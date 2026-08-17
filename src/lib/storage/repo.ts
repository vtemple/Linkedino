/**
 * Dépôt de CV.
 *
 * Implémentation sur système de fichiers, volontairement minimale : il n'y a
 * ni compte ni paiement à ce stade, et une base Postgres serait du travail
 * jeté. L'interface `CVRepository` est en revanche celle que Prisma
 * implémentera — le reste de l'application ne verra pas la différence.
 *
 * Le versionnement est déjà là : chaque écriture incrémente `revision` et
 * archive l'état précédent. C'est ce qui permettra l'historique sans
 * remaniement.
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { CVDocumentSchema, type CVDocument } from "../../domain/cv/schema";

export interface CVRepository {
  list(): Promise<CVDocument[]>;
  get(id: string): Promise<CVDocument | null>;
  save(doc: CVDocument): Promise<CVDocument>;
  /** Concurrence optimiste : rejette si la révision attendue est dépassée. */
  patch(id: string, data: unknown, expectedRevision: number): Promise<PatchResult>;
}

export type PatchResult =
  | { ok: true; document: CVDocument }
  | { ok: false; reason: "not_found" | "conflict" | "invalid"; detail?: string };

const DATA_DIR = join(process.cwd(), ".data");
const CV_DIR = join(DATA_DIR, "cv");
const VERSION_DIR = join(DATA_DIR, "versions");
export const ASSET_DIR = join(DATA_DIR, "assets");

export class FileCVRepository implements CVRepository {
  async list(): Promise<CVDocument[]> {
    if (!existsSync(CV_DIR)) return [];
    const files = (await readdir(CV_DIR)).filter((f) => f.endsWith(".json"));
    const docs = await Promise.all(files.map((f) => this.get(f.replace(/\.json$/, ""))));
    return docs
      .filter((d): d is CVDocument => d !== null)
      .sort((a, b) => b.meta.updatedAt.localeCompare(a.meta.updatedAt));
  }

  async get(id: string): Promise<CVDocument | null> {
    const path = join(CV_DIR, `${safeId(id)}.json`);
    if (!existsSync(path)) return null;
    const parsed = CVDocumentSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return parsed.success ? parsed.data : null;
  }

  async save(doc: CVDocument): Promise<CVDocument> {
    await mkdir(CV_DIR, { recursive: true });
    await writeFile(
      join(CV_DIR, `${safeId(doc.id)}.json`),
      `${JSON.stringify(doc, null, 2)}\n`,
      "utf8",
    );
    return doc;
  }

  async patch(id: string, data: unknown, expectedRevision: number): Promise<PatchResult> {
    const current = await this.get(id);
    if (!current) return { ok: false, reason: "not_found" };

    if (current.meta.revision !== expectedRevision) {
      return { ok: false, reason: "conflict" };
    }

    const candidate = CVDocumentSchema.safeParse({
      ...current,
      ...(typeof data === "object" && data !== null ? data : {}),
      id: current.id,
      schemaVersion: current.schemaVersion,
      meta: {
        ...current.meta,
        updatedAt: new Date().toISOString(),
        revision: current.meta.revision + 1,
      },
    });

    if (!candidate.success) {
      return { ok: false, reason: "invalid", detail: candidate.error.issues[0]?.message };
    }

    await this.archive(current);
    await this.save(candidate.data);
    return { ok: true, document: candidate.data };
  }

  private async archive(doc: CVDocument): Promise<void> {
    const dir = join(VERSION_DIR, safeId(doc.id));
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `r${doc.meta.revision}.json`),
      JSON.stringify(doc),
      "utf8",
    );
  }
}

/** Lit un asset local à partir de son URL publique. */
export async function readLocalAsset(
  url: string,
): Promise<{ body: Buffer; mime: string } | null> {
  const relative = url.replace(/^\/assets\//, "");
  if (relative.includes("..")) return null;
  const path = join(ASSET_DIR, relative);
  if (!existsSync(path)) return null;
  const ext = path.split(".").pop() ?? "";
  const mime =
    ext === "webp"
      ? "image/webp"
      : ext === "png"
        ? "image/png"
        : ext === "jpeg" || ext === "jpg"
          ? "image/jpeg"
          : "application/octet-stream";
  return { body: await readFile(path), mime };
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

export const repository: CVRepository = new FileCVRepository();
