/**
 * Dates — décision D3 : on stocke de l'ISO 8601 partiel, on formate au rendu.
 *
 * Le prototype stockait des chaînes d'affichage (« Juin 2025 ») traduites par
 * dictionnaire de mois. Conséquences : aucun tri possible, aucune durée
 * calculable, et toute langue non prévue cassait le rendu.
 */

import type { DateRange, Locale } from "./schema";

/* ── Parsing ───────────────────────────────────────────────────────────── */

const MONTHS: Record<string, number> = {};
const registerMonth = (index: number, ...names: string[]): void => {
  for (const name of names) MONTHS[normalizeToken(name)] = index;
};

registerMonth(1, "janvier", "janv", "jan", "january");
registerMonth(2, "février", "fevrier", "févr", "fevr", "fév", "fev", "feb", "february");
registerMonth(3, "mars", "mar", "march");
registerMonth(4, "avril", "avr", "apr", "april");
registerMonth(5, "mai", "may");
registerMonth(6, "juin", "jun", "june");
registerMonth(7, "juillet", "juil", "jul", "july");
registerMonth(8, "août", "aout", "aoû", "aou", "aug", "august");
registerMonth(9, "septembre", "sept", "sep", "september");
registerMonth(10, "octobre", "oct", "october");
registerMonth(11, "novembre", "nov", "november");
registerMonth(12, "décembre", "decembre", "déc", "dec", "december");

const PRESENT_TOKENS = new Set([
  "aujourdhui",
  "aujourd'hui",
  "present",
  "présent",
  "actuel",
  "actuelle",
  "encours",
  "now",
  "current",
  "today",
  "ongoing",
]);

/** Minuscules, sans diacritiques, sans ponctuation de fin. */
function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,;]+$/, "")
    .trim();
}

/**
 * Séparateurs de plage.
 *
 * Les alternatives littérales (`to`, `au`, `à`, `a`) exigent des espaces de part
 * et d'autre : sans cette contrainte, le « a » de « Mar 2022 » était pris pour
 * un séparateur et la date devenait illisible. Les tirets cadratins, eux,
 * peuvent être collés.
 */
const SEPARATORS = /\s*[–—\u2013\u2014]\s*|\s+-\s+|\s+(?:to|au|à|a)\s+/i;

export interface ParsedDate {
  iso: string | null;
  current: boolean;
}

/** « Juin 2025 » → 2025-06 · « 2020 » → 2020 · « 06/2025 » → 2025-06 · « en cours » → current */
export function parseDateToken(input: string): ParsedDate {
  const raw = input.trim();
  if (!raw) return { iso: null, current: false };
  if (PRESENT_TOKENS.has(normalizeToken(raw))) return { iso: null, current: true };

  // Déjà ISO
  const iso = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(raw);
  if (iso) return { iso: raw, current: false };

  // MM/YYYY ou MM-YYYY
  const numeric = /^(\d{1,2})[/\-.](\d{4})$/.exec(raw);
  if (numeric) {
    const month = Number(numeric[1]);
    if (month >= 1 && month <= 12) return { iso: `${numeric[2]}-${pad(month)}`, current: false };
  }

  // « Juin 2025 », « Jun 2025 », « 2025 Juin »
  const words = raw.split(/\s+/).filter(Boolean);
  let year: number | null = null;
  let month: number | null = null;
  for (const word of words) {
    const yearMatch = /^(\d{4})$/.exec(word);
    if (yearMatch) {
      year = Number(yearMatch[1]);
      continue;
    }
    const candidate = MONTHS[normalizeToken(word)];
    if (candidate !== undefined) month = candidate;
  }

  if (year === null) return { iso: null, current: false };
  return { iso: month === null ? String(year) : `${year}-${pad(month)}`, current: false };
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Analyse un champ date hérité complet.
 *
 * « 2025 – 2026 » → { start: "2025", end: "2026" }
 * « Juin 2025 »   → { start: "2025-06", end: "2025-06" }   (événement ponctuel)
 * « 2020 – »      → { start: "2020", end: null, current: true }
 */
export function parseLegacyRange(input: string): DateRange | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  const parts = raw.split(SEPARATORS).map((p) => p.trim()).filter(Boolean);

  if (parts.length === 0) return null;

  if (parts.length === 1) {
    const single = parseDateToken(parts[0] ?? "");
    if (!single.iso) return null;
    // Un point unique : début et fin identiques, ce qui rend « Juin 2025 »
    // sans laisser croire à une période ouverte.
    return { start: single.iso, end: single.iso, current: false };
  }

  const startToken = parseDateToken(parts[0] ?? "");
  const endToken = parseDateToken(parts.slice(1).join(" "));

  if (!startToken.iso) return null;
  if (endToken.current || !endToken.iso) {
    return { start: startToken.iso, end: null, current: true };
  }
  // Année de fin abrégée : « 2023 – 25 » n'existe pas dans le corpus, mais
  // « Juin – Août 2025 » oui : la fin porte l'année, le début l'hérite.
  const start = inheritYear(startToken.iso, endToken.iso);
  return { start, end: endToken.iso, current: false };
}

function inheritYear(start: string, end: string): string {
  if (start.length >= 4 && /^\d{4}/.test(start)) return start;
  const endYear = end.slice(0, 4);
  return `${endYear}-${start}`;
}

/* ── Formatage ─────────────────────────────────────────────────────────── */

const PRESENT_LABEL: Record<Locale, string> = { fr: "aujourd'hui", en: "present" };

export type DateStyle = "long" | "short" | "numeric" | "year";

/** Formate une date ISO partielle. Aucun dictionnaire maison : `Intl` fait foi. */
export function formatDate(iso: string, locale: Locale, style: DateStyle = "long"): string {
  const [yearPart, monthPart] = iso.split("-");
  const year = Number(yearPart);
  if (!monthPart || style === "year") return String(year);
  if (style === "numeric") return `${monthPart}/${year}`;

  const date = new Date(Date.UTC(year, Number(monthPart) - 1, 1));
  const month = new Intl.DateTimeFormat(locale, {
    month: style === "short" ? "short" : "long",
    timeZone: "UTC",
  }).format(date);
  const cleaned = month.replace(/\.$/, "");
  return `${capitalize(cleaned)} ${year}`;
}

export function formatRange(range: DateRange, locale: Locale, style: DateStyle = "long"): string {
  const start = formatDate(range.start, locale, style);
  if (range.current) return `${start} – ${PRESENT_LABEL[locale]}`;
  if (!range.end || range.end === range.start) return start;
  return `${start} – ${formatDate(range.end, locale, style)}`;
}

/** Durée en mois, bornes incluses. Alimente la timeline du CV interactif. */
export function durationInMonths(range: DateRange, reference = new Date()): number {
  const start = toMonthIndex(range.start);
  const endIso = range.current ? isoMonth(reference) : (range.end ?? range.start);
  const end = toMonthIndex(endIso);
  return Math.max(1, end - start + 1);
}

export function formatDuration(months: number, locale: Locale): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(locale === "fr" ? `${years} an${years > 1 ? "s" : ""}` : `${years} yr`);
  if (rest > 0) parts.push(locale === "fr" ? `${rest} mois` : `${rest} mo`);
  return parts.join(" ") || (locale === "fr" ? "1 mois" : "1 mo");
}

function toMonthIndex(iso: string): number {
  const [yearPart, monthPart] = iso.split("-");
  return Number(yearPart) * 12 + (monthPart ? Number(monthPart) - 1 : 0);
}

function isoMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Tri antichronologique — l'ordre attendu sur un CV. */
export function compareRangesDesc(a: DateRange, b: DateRange): number {
  const aKey = a.current ? Number.POSITIVE_INFINITY : toMonthIndex(a.end ?? a.start);
  const bKey = b.current ? Number.POSITIVE_INFINITY : toMonthIndex(b.end ?? b.start);
  if (aKey !== bKey) return bKey - aKey;
  return toMonthIndex(b.start) - toMonthIndex(a.start);
}
