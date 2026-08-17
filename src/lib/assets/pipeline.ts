/**
 * Pipeline d'assets.
 *
 * Le prototype stockait des PNG 2560×2560 en base64 pour les afficher à 40 px :
 * un logo pesait 1,77 Mo, le fichier entier 7,5 Mo dont 98,7 % de base64.
 *
 * Ici : une image entre, des variantes dimensionnées sortent, et `CVData` ne
 * contient qu'une référence. Le stockage est derrière une interface, pour que
 * la migration locale et R2 partagent exactement le même code de traitement.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp, { type Sharp } from "sharp";

import type { AssetRef } from "../../domain/cv/schema";

export interface AssetStore {
  /** Retourne l'URL publique (ou le chemin relatif) de l'objet écrit. */
  put(key: string, body: Buffer, mime: string): Promise<string>;
}

/** Stockage local — utilisé par la migration et les tests. */
export class FileSystemAssetStore implements AssetStore {
  constructor(
    private readonly root: string,
    private readonly publicPrefix = "/assets",
  ) {}

  async put(key: string, body: Buffer, _mime: string): Promise<string> {
    const target = join(this.root, key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
    return `${this.publicPrefix}/${key}`;
  }
}

export type AssetRole = "photo" | "logo";

type OutputFormat = "webp" | "png" | "jpeg";

interface FormatSpec {
  format: OutputFormat;
  widths: number[];
}

/**
 * Variantes générées par rôle.
 *
 * Un logo affiché à 40 px n'a pas besoin de 2560, et un PNG de photographie
 * n'a aucun intérêt : on ne produit du PNG que là où la transparence compte
 * (les logos), et du JPEG comme repli universel pour la photo.
 */
const SPECS: Record<AssetRole, FormatSpec[]> = {
  photo: [
    { format: "webp", widths: [256, 512, 1024] },
    { format: "jpeg", widths: [512] },
  ],
  logo: [
    { format: "webp", widths: [64, 128, 256] },
    { format: "png", widths: [128, 256] },
  ],
};

const MIME: Record<OutputFormat, AssetRef["mime"]> = {
  webp: "image/webp",
  png: "image/png",
  jpeg: "image/jpeg",
};

export interface ProcessOptions {
  role: AssetRole;
  focal?: { x: number; y: number };
  /** Chemin logique, utilisé pour les messages d'erreur. */
  path?: string;
}

export interface ProcessResult {
  asset: AssetRef;
  /** Octets avant / après, pour le rapport de migration. */
  bytesBefore: number;
  bytesAfter: number;
}

const DATA_URI_RE = /^data:([\w/+.-]+);base64,(.+)$/s;

export function decodeDataUri(input: string): { mime: string; buffer: Buffer } | null {
  const match = DATA_URI_RE.exec(input.trim());
  if (!match) return null;
  const mime = match[1] ?? "";
  const data = match[2] ?? "";
  try {
    return { mime, buffer: Buffer.from(data, "base64") };
  } catch {
    return null;
  }
}

/**
 * Produit les variantes WebP et PNG d'une image.
 *
 * Le PNG est conservé parce que LaTeX ne lit pas le WebP : c'est la seule
 * raison de le générer, et elle est suffisante.
 */
export async function processImage(
  source: Buffer,
  store: AssetStore,
  options: ProcessOptions,
): Promise<ProcessResult> {
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
  const metadata = await sharp(source).metadata();
  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error(`Image illisible (${options.path ?? "inconnue"}).`);
  }

  const variants: AssetRef["variants"] = {};
  let bytesAfter = 0;
  let largestWebp: { key: string; width: number } | null = null;

  for (const spec of SPECS[options.role]) {
    // On ne suréchantillonne jamais ; si l'original est plus petit que toutes
    // les cibles, on produit une variante unique à sa taille réelle.
    const applicable = spec.widths.filter((w) => w <= originalWidth);
    const widths = applicable.length > 0 ? applicable : [originalWidth];

    for (const width of widths) {
      const height = Math.max(1, Math.round((originalHeight / originalWidth) * width));
      const buffer = await encode(sharp(source).resize({ width, withoutEnlargement: true }), spec.format);
      const key = `${spec.format}-${width}`;
      const url = await store.put(`${hash}/w${width}.${spec.format}`, buffer, MIME[spec.format]);

      variants[key] = { url, width, height, bytes: buffer.byteLength };
      bytesAfter += buffer.byteLength;

      if (spec.format === "webp" && (!largestWebp || width > largestWebp.width)) {
        largestWebp = { key, width };
      }
    }
  }

  const defaultKey = largestWebp?.key ?? Object.keys(variants)[0];
  if (!defaultKey) throw new Error(`Aucune variante produite (${options.path ?? "inconnue"}).`);
  const defaultVariant = variants[defaultKey]!;
  const defaultFormat = (defaultKey.split("-")[0] ?? "webp") as OutputFormat;

  const asset: AssetRef = {
    id: `ast_${hash.slice(0, 12)}`,
    url: defaultVariant.url,
    mime: MIME[defaultFormat],
    width: defaultVariant.width,
    height: defaultVariant.height,
    focal: options.focal ?? { x: 50, y: 50 },
    zoom: 1,
    variants,
  };

  return { asset, bytesBefore: source.byteLength, bytesAfter };
}

async function encode(pipeline: Sharp, format: OutputFormat): Promise<Buffer> {
  switch (format) {
    case "webp":
      return pipeline.webp({ quality: 82, effort: 5 }).toBuffer();
    case "png":
      return pipeline.png({ compressionLevel: 9, palette: true }).toBuffer();
    case "jpeg":
      return pipeline.jpeg({ quality: 84, progressive: true, mozjpeg: true }).toBuffer();
  }
}

/** Sélectionne la plus petite variante couvrant la largeur demandée. */
export function pickVariant(
  asset: AssetRef,
  format: OutputFormat,
  minWidth: number,
): { url: string; width: number; height: number } {
  const candidates = Object.entries(asset.variants)
    .filter(([key]) => key.startsWith(`${format}-`))
    .map(([, value]) => value)
    .sort((a, b) => a.width - b.width);

  return candidates.find((v) => v.width >= minWidth) ?? candidates[candidates.length - 1] ?? asset;
}
