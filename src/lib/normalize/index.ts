/**
 * Normaliseurs déterministes.
 *
 * C'est ici que se joue la promesse « aucune IA » : transformer des chaînes
 * saisies librement en données structurées, par règles explicites, testables
 * et reproductibles. Chaque fonction est pure, et signale ce qu'elle n'a pas
 * su interpréter plutôt que de deviner.
 *
 * Règle d'or : en cas d'ambiguïté, on conserve la chaîne d'origine dans un
 * champ libre et on émet un avertissement. On ne perd jamais d'information.
 */

import type { ContractSchema, LanguageSchema, LocationSchema } from "../../domain/cv/schema";
import type { z } from "zod";

type Location = z.infer<typeof LocationSchema>;
type Contract = z.infer<typeof ContractSchema>;
type LanguageLevel = z.infer<typeof LanguageSchema>["level"];

export interface NormalizeWarning {
  /** Chemin logique dans le document, ex. « experiences[1].period ». */
  path: string;
  code:
    | "date_illisible"
    | "contact_non_reconnu"
    | "niveau_langue_inconnu"
    | "pays_inconnu"
    | "lien_ignore"
    | "champ_vide";
  /** La valeur d'origine, toujours conservée pour relecture humaine. */
  raw: string;
  message: string;
}

/* ── Emojis et pictogrammes ────────────────────────────────────────────── */

const PICTOGRAM =
  /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2460}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;

/**
 * Sépare le pictogramme du libellé au lieu de le supprimer.
 * Le prototype filtrait par plage de codepoints (`cp > 0x24FF → continue`),
 * ce qui emportait au passage tout caractère non latin.
 */
export function splitIcon(input: string): { icon?: string; label: string } {
  const icons = input.match(PICTOGRAM) ?? [];
  const label = input.replace(PICTOGRAM, "").replace(/\s+/g, " ").trim();
  const icon = icons.join("").trim();
  return icon ? { icon, label } : { label };
}

export function stripIcons(input: string): string {
  return input.replace(PICTOGRAM, "").replace(/\s+/g, " ").trim();
}

/* ── Lieux ─────────────────────────────────────────────────────────────── */

const COUNTRIES: Record<string, string> = {
  france: "FR",
  allemagne: "DE",
  germany: "DE",
  deutschland: "DE",
  espagne: "ES",
  spain: "ES",
  "royaume-uni": "GB",
  "united kingdom": "GB",
  angleterre: "GB",
  belgique: "BE",
  belgium: "BE",
  suisse: "CH",
  switzerland: "CH",
  italie: "IT",
  italy: "IT",
  "pays-bas": "NL",
  netherlands: "NL",
  portugal: "PT",
  canada: "CA",
  "états-unis": "US",
  "etats-unis": "US",
  "united states": "US",
  usa: "US",
  tunisie: "TN",
  tunisia: "TN",
  maroc: "MA",
  morocco: "MA",
  luxembourg: "LU",
  irlande: "IE",
  ireland: "IE",
  autriche: "AT",
  austria: "AT",
};

/** « Lyon, France » → { city: "Lyon", country: "FR" } */
export function parseLocation(
  input: string,
  path: string,
  warnings: NormalizeWarning[] = [],
): Location | undefined {
  const raw = stripIcons(input).trim();
  if (!raw) return undefined;

  const parts = raw.split(/\s*,\s*/).filter(Boolean);
  if (parts.length === 0) return undefined;

  const city = parts[0] ?? "";
  const tail = parts.slice(1);

  if (tail.length === 0) return { city };

  const last = tail[tail.length - 1] ?? "";
  const code = COUNTRIES[last.toLowerCase()];

  if (code) {
    const region = tail.slice(0, -1).join(", ");
    return region ? { city, region, country: code } : { city, country: code };
  }

  warnings.push({
    path,
    code: "pays_inconnu",
    raw: last,
    message: `Pays « ${last} » non reconnu ; conservé comme région.`,
  });
  return { city, region: tail.join(", ") };
}

export function formatLocation(location: Location | undefined): string {
  if (!location) return "";
  return [location.city, location.region, countryName(location.country)]
    .filter(Boolean)
    .join(", ");
}

const COUNTRY_NAMES: Record<string, string> = Object.entries(COUNTRIES).reduce<
  Record<string, string>
>((acc, [name, code]) => {
  if (!acc[code]) acc[code] = name.charAt(0).toUpperCase() + name.slice(1);
  return acc;
}, {});

function countryName(code: string | undefined): string {
  if (!code) return "";
  return COUNTRY_NAMES[code] ?? code;
}

/* ── Bloc de contact ───────────────────────────────────────────────────── */

export interface ParsedContact {
  email?: string;
  phone?: string;
  location?: Location;
  links: Array<{ kind: "linkedin" | "github" | "website" | "portfolio" | "other"; href: string }>;
  /** Lignes non identifiées : jamais jetées, remontées à l'utilisateur. */
  unrecognized: string[];
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?){2,6}\d{2,4}/;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?([\w-]+\.[\w.-]+(?:\/[\w\-./?%&=+#@~]*)?)/;
/** Gabarit non rempli, ex. « 06 XX XX XX XX ». Reconnu comme téléphone, signalé comme incomplet. */
const MASKED_PHONE_RE = /^\+?[\d\s.\-XxX•_]{8,}$/;

/**
 * Découpe le blob de contact du prototype.
 *
 * « 📧 email@exemple.fr\n📞 06 XX XX XX XX\n📍 Lyon, France\n🔗 linkedin.com/in/x »
 * devient quatre champs typés. L'ordre des lignes n'a aucune importance :
 * la reconnaissance se fait sur le contenu, pas sur la position.
 */
export function parseContactBlock(
  input: string,
  path = "personal.contact",
  warnings: NormalizeWarning[] = [],
): ParsedContact {
  const result: ParsedContact = { links: [], unrecognized: [] };

  const lines = (input ?? "")
    .split(/\r?\n|<br\s*\/?>/i)
    .map((line) => stripIcons(line).replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const email = EMAIL_RE.exec(line);
    if (email && !result.email) {
      result.email = email[0].toLowerCase();
      continue;
    }

    const url = URL_RE.exec(line);
    if (url && /\.[a-z]{2,}/i.test(line) && !EMAIL_RE.test(line)) {
      const host = url[1] ?? "";
      const href = line.startsWith("http") ? line : `https://${host}`;
      result.links.push({ kind: classifyLink(host), href });
      continue;
    }

    const digits = line.replace(/[^\d]/g, "");
    if (digits.length >= 8 && PHONE_RE.test(line)) {
      result.phone = normalizePhone(line);
      continue;
    }
    // Gabarit non rempli : on le conserve tel quel plutôt que de le jeter,
    // et on le signale pour que l'éditeur le mette en évidence.
    if (MASKED_PHONE_RE.test(line) && /[Xx•_]/.test(line)) {
      result.phone = line;
      warnings.push({
        path,
        code: "champ_vide",
        raw: line,
        message: `Numéro de téléphone non renseigné (gabarit « ${line} ») ; à compléter.`,
      });
      continue;
    }

    // Reste : un lieu si la ligne contient une virgule ou un pays connu.
    const maybeLocation = parseLocation(line, path, []);
    if (maybeLocation && (line.includes(",") || COUNTRIES[line.toLowerCase()])) {
      result.location = maybeLocation;
      continue;
    }

    result.unrecognized.push(line);
    warnings.push({
      path,
      code: "contact_non_reconnu",
      raw: line,
      message: `Ligne de contact non identifiée : « ${line} ».`,
    });
  }

  return result;
}

function classifyLink(host: string): ParsedContact["links"][number]["kind"] {
  const h = host.toLowerCase();
  if (h.includes("linkedin.")) return "linkedin";
  if (h.includes("github.")) return "github";
  if (h.includes("behance.") || h.includes("dribbble.") || h.includes("notion.")) return "portfolio";
  return "website";
}

/** Groupe les chiffres par deux (usage français) sans réécrire l'indicatif. */
export function normalizePhone(input: string): string {
  const cleaned = input.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    const rest = cleaned.slice(1);
    const cc = rest.slice(0, 2);
    return `+${cc} ${chunk(rest.slice(2))}`.trim();
  }
  return chunk(cleaned);
}

function chunk(digits: string): string {
  return (digits.match(/.{1,2}/g) ?? []).join(" ");
}

/* ── Langues ───────────────────────────────────────────────────────────── */

const CEFR_RE = /\b([ABC][12])\b/i;
const NATIVE_RE =
  /\b(natif|native|maternelle|mother\s*tongue|bilingue|bilingual|courant\s*natif)\b/i;
const CERT_RE = /\b(TOEIC|TOEFL|IELTS|DELE|DELF|DALF|Goethe|HSK|JLPT|Cambridge|BULATS)\b/i;
const SCORE_RE = /(\d{2,4}\s*\/\s*\d{2,4}|\b\d{1,3}[.,]\d\b|\b[A-C][12]\b)/;

/**
 * « C1 — TOEIC 800/990 » → { level: "C1", certification: { name: "TOEIC", score: "800/990" } }
 * « Natif » → { level: "native" }
 */
export function parseLanguageLevel(
  input: string,
  path: string,
  warnings: NormalizeWarning[] = [],
): { level: LanguageLevel; certification?: { name: string; score?: string; year?: string } } {
  const raw = stripIcons(input).trim();

  const certMatch = CERT_RE.exec(raw);
  let certification: { name: string; score?: string; year?: string } | undefined;
  if (certMatch) {
    const name = certMatch[1] ?? "";
    const after = raw.slice(certMatch.index + name.length);
    const score = SCORE_RE.exec(after)?.[1]?.replace(/\s+/g, "");
    const year = /\b(19|20)\d{2}\b/.exec(after)?.[0];
    certification = { name: name.toUpperCase(), ...(score ? { score } : {}), ...(year ? { year } : {}) };
  }

  if (NATIVE_RE.test(raw)) {
    return certification ? { level: "native", certification } : { level: "native" };
  }

  const cefr = CEFR_RE.exec(raw)?.[1]?.toUpperCase() as LanguageLevel | undefined;
  if (cefr) {
    return certification ? { level: cefr, certification } : { level: cefr };
  }

  warnings.push({
    path,
    code: "niveau_langue_inconnu",
    raw,
    message: `Niveau « ${raw} » non reconnu ; positionné sur B1, à vérifier.`,
  });
  return certification ? { level: "B1", certification } : { level: "B1" };
}

/* ── Intitulés de poste ────────────────────────────────────────────────── */

const CONTRACTS: Array<{ re: RegExp; value: Contract }> = [
  { re: /\bstage\b|\binternship\b|\bintern\b/i, value: "stage" },
  { re: /\balternance\b|\bapprentissage\b|\bapprentice\b/i, value: "alternance" },
  { re: /\bCDD\b|\bfixed[-\s]?term\b/i, value: "cdd" },
  { re: /\bCDI\b|\bpermanent\b|\bfull[-\s]?time\b/i, value: "cdi" },
  { re: /\bfreelance\b|\bind[ée]pendant\b|\bconsultant\b/i, value: "freelance" },
  { re: /\bint[ée]rim\b|\btemporary\b/i, value: "interim" },
  { re: /\bb[ée]n[ée]vol/i, value: "benevolat" },
];

/**
 * « Assistant Manager — Stage 2 mois » → role « Assistant Manager », contrat « stage ».
 *
 * Le segment de contrat est retiré du titre : il devient une donnée, ce qui
 * permet au LaTeX ATS de l'omettre et au HTML de l'afficher comme étiquette.
 */
export function splitRoleAndContract(input: string): {
  role: string;
  contract?: Contract;
  droppedSegment?: string;
} {
  const raw = input.trim();
  const segments = raw.split(/\s+[—–-]\s+/);

  if (segments.length > 1) {
    const tail = segments[segments.length - 1] ?? "";
    const found = CONTRACTS.find((c) => c.re.test(tail));
    if (found) {
      return {
        role: segments.slice(0, -1).join(" — ").trim(),
        contract: found.value,
        droppedSegment: tail.trim(),
      };
    }
  }

  const inline = CONTRACTS.find((c) => c.re.test(raw));
  return inline ? { role: raw, contract: inline.value } : { role: raw };
}

/* ── Certifications ────────────────────────────────────────────────────── */

const CREDENTIAL_RE =
  /\b(?:identifiant|id|code|r[ée]f[ée]rence|credential)\s*:?\s*([A-Z0-9][A-Z0-9-]{4,})/i;

/** « Identifiant P-DY6XKXG8 » → credentialId « P-DY6XKXG8 », reste vide. */
export function parseCredential(input: string): { credentialId?: string; detail?: string } {
  const raw = input.trim();
  if (!raw) return {};

  const match = CREDENTIAL_RE.exec(raw);
  if (!match) return { detail: raw };

  const credentialId = match[1] ?? "";
  const detail = raw.replace(match[0], "").replace(/\s{2,}/g, " ").trim();
  return detail ? { credentialId, detail } : { credentialId };
}

/* ── Identité ──────────────────────────────────────────────────────────── */

/**
 * Découpe un nom complet. Règle simple et documentée : le dernier mot est le
 * nom de famille, le reste le prénom. Les particules (de, van, del…) sont
 * rattachées au nom. Aucune heuristique culturelle au-delà : en cas de doute,
 * l'utilisateur corrige dans l'éditeur.
 */
export function splitFullName(input: string): { firstName: string; lastName: string } {
  const parts = stripIcons(input).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };

  const particles = new Set(["de", "du", "des", "van", "von", "der", "del", "della", "la", "le", "di"]);
  let splitIndex = parts.length - 1;
  while (splitIndex > 1 && particles.has((parts[splitIndex - 1] ?? "").toLowerCase())) {
    splitIndex -= 1;
  }

  return {
    firstName: parts.slice(0, splitIndex).join(" "),
    lastName: parts.slice(splitIndex).join(" "),
  };
}

/* ── Utilitaires ───────────────────────────────────────────────────────── */

let counter = 0;

/** Identifiants stables et reproductibles : deux imports du même fichier
 *  produisent le même document, condition d'un pipeline déterministe. */
export function deterministicId(prefix: string, seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

export function resetCounter(): void {
  counter = 0;
}

export function nextIndex(): number {
  counter += 1;
  return counter;
}
