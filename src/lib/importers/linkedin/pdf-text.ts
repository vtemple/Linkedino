/**
 * Extraction de texte positionnée.
 *
 * Le PDF de profil LinkedIn est mis en page sur deux colonnes : une barre
 * latérale étroite (coordonnées, compétences principales, certifications,
 * langues) et une colonne principale (identité, résumé, expérience, formation).
 *
 * Une extraction naïve concatène les deux et produit du texte inutilisable :
 * les lignes voisines se collent, par exemple « EnglishÉtudiant en Programme… ».
 * On sépare donc les colonnes par leur abscisse avant toute analyse.
 *
 * Deuxième apport : la **taille de police porte la sémantique**. Dans le PDF
 * LinkedIn, l'identité est à 26 pt, les titres de sections principales à 16 pt,
 * les titres de barre latérale à 13 pt, les entrées à 12 pt et les métadonnées
 * à 11 pt. Se fier à ces tailles plutôt qu'aux intitulés rend le découpage
 * indépendant de la langue du profil.
 */

import { getDocumentProxy } from "unpdf";

export type Column = "side" | "main";

export interface TextLine {
  text: string;
  column: Column;
  /** Taille de police en points, arrondie. */
  size: number;
  page: number;
  x: number;
  y: number;
}

interface RawItem {
  str: string;
  x: number;
  y: number;
  size: number;
  page: number;
}

/**
 * Pied de page « Page 1 of 3 ».
 *
 * Le seuil est volontairement bas : du contenu réel descend jusqu'à y ≈ 29 en
 * bas de page, et un seuil trop haut escamotait des dates d'expérience. C'est
 * l'expression régulière, appliquée à la ligne reconstituée, qui fait le tri.
 */
const FOOTER_Y = 20;
const FOOTER_RE = /^page\s*\d+\s*(of|sur|\/)\s*\d+$/i;

export interface ExtractionResult {
  lines: TextLine[];
  pages: number;
  /** Abscisse de séparation retenue entre les deux colonnes. */
  columnSplit: number | null;
}

export async function extractLines(buffer: Buffer): Promise<ExtractionResult> {
  const document = await getDocumentProxy(new Uint8Array(buffer));
  const items: RawItem[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = (await page.getTextContent()) as {
      items: Array<{ str: string; transform: number[] }>;
    };

    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const x = Math.round(item.transform[4] ?? 0);
      const y = Math.round(item.transform[5] ?? 0);
      if (y < FOOTER_Y) continue;
      items.push({
        str: item.str,
        x,
        y,
        size: Math.round(Math.abs(item.transform[0] ?? 0)),
        page: pageNumber,
      });
    }
  }

  const columnSplit = findColumnSplit(items);
  const lines = groupIntoLines(items, columnSplit);

  // Barre latérale d'abord, puis colonne principale : chaque bloc devient
  // continu, alors que l'ordre de lecture du PDF les entrelace.
  const ordered = [
    ...lines.filter((line) => line.column === "side"),
    ...lines.filter((line) => line.column === "main"),
  ];

  return { lines: ordered, pages: document.numPages, columnSplit };
}

/**
 * Détecte la frontière entre les colonnes.
 *
 * On regroupe les abscisses de début de ligne ; s'il en ressort deux amas
 * nettement séparés, la frontière est à leur milieu. Un document sur une seule
 * colonne renvoie `null` et tout est traité comme colonne principale.
 */
function findColumnSplit(items: RawItem[]): number | null {
  const counts = new Map<number, number>();
  for (const item of items) {
    const bucket = Math.round(item.x / 10) * 10;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([x]) => x);

  const first = ranked[0];
  const second = ranked.find((x) => first !== undefined && Math.abs(x - first) > 80);
  if (first === undefined || second === undefined) return null;

  return Math.round((Math.min(first, second) + Math.max(first, second)) / 2);
}

function groupIntoLines(items: RawItem[], split: number | null): TextLine[] {
  const buckets = new Map<string, RawItem[]>();

  for (const item of items) {
    const column: Column = split !== null && item.x < split ? "side" : "main";
    // Tolérance verticale : les exposants et accents décalent légèrement la
    // ligne de base sans changer de ligne.
    const key = `${item.page}|${column}|${Math.round(item.y / 3)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  }

  const lines: TextLine[] = [];

  for (const [key, bucket] of buckets) {
    const [pageRaw, columnRaw] = key.split("|");
    bucket.sort((a, b) => a.x - b.x);

    const text = joinItems(bucket);
    if (!text || FOOTER_RE.test(text.replace(/\s+/g, " "))) continue;

    lines.push({
      text,
      column: columnRaw === "side" ? "side" : "main",
      size: Math.max(...bucket.map((item) => item.size)),
      page: Number(pageRaw),
      x: Math.min(...bucket.map((item) => item.x)),
      y: bucket[0]?.y ?? 0,
    });
  }

  return lines.sort((a, b) => a.page - b.page || b.y - a.y);
}

/**
 * Recolle les fragments d'une ligne.
 *
 * LinkedIn découpe les lignes en plusieurs objets texte sans toujours inclure
 * l'espace : « novembre 2024 - février 2025 » et « (4 mois) » arrivent collés.
 * On insère une espace quand la césure tombe entre deux caractères de mots.
 */
function joinItems(items: RawItem[]): string {
  let out = "";
  for (const item of items) {
    const fragment = item.str;
    if (out && needsSpace(out.slice(-1), fragment.slice(0, 1))) out += " ";
    out += fragment;
  }
  return out.replace(/\s+/g, " ").trim();
}

function needsSpace(left: string, right: string): boolean {
  if (!left.trim() || !right.trim()) return false;
  // Ni espace avant une ponctuation fermante, ni après une ouvrante.
  if (/[),.;:!?»]/.test(right)) return false;
  if (/[(«]/.test(left)) return false;
  return /[\p{L}\p{N}.)]/u.test(left) && /[\p{L}\p{N}(·]/u.test(right);
}

/* ── Classification par taille ─────────────────────────────────────────── */

export interface SizeProfile {
  /** Taille du nom : la plus grande de la colonne principale. */
  identity: number;
  /** Seuil des titres de sections principales. */
  mainHeading: number;
  /** Seuil des titres de barre latérale. */
  sideHeading: number;
  /** Taille des lignes d'entrée (organisation, intitulé). */
  entry: number;
  /** Taille des métadonnées (dates, lieux, descriptions). */
  meta: number;
}

/**
 * Déduit les seuils à partir du document lui-même.
 *
 * Aucune valeur n'est codée en dur : un PDF LinkedIn dans une autre langue ou
 * une future révision de leur gabarit reste analysable tant que la hiérarchie
 * typographique est respectée.
 */
export function profileSizes(lines: TextLine[]): SizeProfile {
  const main = lines.filter((line) => line.column === "main").map((line) => line.size);
  const side = lines.filter((line) => line.column === "side").map((line) => line.size);

  const identity = main.length > 0 ? Math.max(...main) : 26;

  // Les tailles fréquentes sont celles du corps de texte.
  const frequency = new Map<number, number>();
  for (const size of main) frequency.set(size, (frequency.get(size) ?? 0) + 1);
  const ranked = [...frequency.entries()].sort((a, b) => b[1] - a[1]).map(([size]) => size);

  const meta = ranked[0] ?? 11;
  const entry = ranked.find((size) => size > meta) ?? meta + 1;

  // Un titre de section est plus grand que les entrées, sans être l'identité.
  const headingCandidates = [...new Set(main)]
    .filter((size) => size > entry && size < identity)
    .sort((a, b) => a - b);
  const mainHeading = headingCandidates[0] ?? entry + 2;

  const sideSizes = [...new Set(side)].sort((a, b) => b - a);
  const sideHeading = sideSizes[0] ?? mainHeading;

  return { identity, mainHeading, sideHeading, entry, meta };
}
