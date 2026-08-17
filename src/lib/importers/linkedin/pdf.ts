/**
 * Importeur « profil LinkedIn en PDF ».
 *
 * Parcours principal du prototype : l'utilisateur exporte lui-même son profil
 * (Plus → Enregistrer au format PDF) et dépose le fichier. Aucune requête n'est
 * émise vers LinkedIn, aucune protection n'est contournée, aucun modèle de
 * langage n'intervient.
 *
 * Le découpage repose sur la géométrie et la hiérarchie typographique du
 * document (voir `pdf-text.ts`), pas sur des intitulés codés en dur : un profil
 * anglais, allemand ou espagnol se découpe de la même façon.
 *
 * Règle non négociable : **ne jamais inventer**. Une information absente reste
 * vide, une information ambiguë produit un avertissement.
 */

import type { DomainKey, RawProfile, RawSection } from "../types";
import { extractLines, profileSizes, type SizeProfile, type TextLine } from "./pdf-text";

export class PdfImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfImportError";
  }
}

export interface PdfWarning {
  section: string;
  message: string;
  raw?: string;
}

export interface PdfReport {
  profile: RawProfile;
  warnings: PdfWarning[];
  unassigned: string[];
  sectionsFound: string[];
  confidence: "low";
}

/* ── Reconnaissance des sections ───────────────────────────────────────── */

type SectionKind =
  | "contact"
  | "skills"
  | "languages"
  | "certifications"
  | "summary"
  | "experience"
  | "education"
  | "projects"
  | "volunteering"
  | "publications"
  | "honors"
  | "courses"
  | "other";

/**
 * Intitulés connus, plusieurs langues. Ils servent à *nommer* une section déjà
 * détectée par sa taille de police, pas à la détecter : un intitulé inconnu
 * donne une section « autre », signalée et conservée.
 */
const SECTION_PATTERNS: Array<{ match: RegExp; kind: SectionKind }> = [
  { match: /^(coordonn[ée]es|contact|kontakt|contacto)$/i, kind: "contact" },
  {
    match: /^(principales? comp[ée]tences?|top skills|comp[ée]tences?|skills|kenntnisse|aptitudes)$/i,
    kind: "skills",
  },
  { match: /^(langues?|languages?|sprachen|idiomas)$/i, kind: "languages" },
  { match: /^(certifications?|licences? et certifications?|zertifikate)$/i, kind: "certifications" },
  { match: /^(r[ée]sum[ée]|summary|[àa] propos|about|zusammenfassung|extracto)$/i, kind: "summary" },
  {
    match: /^(exp[ée]riences?( professionnelles?)?|experience|berufserfahrung|experiencia)$/i,
    kind: "experience",
  },
  { match: /^(formation|[ée]ducation|education|ausbildung|educaci[óo]n)$/i, kind: "education" },
  { match: /^(projets?|projects?|projekte)$/i, kind: "projects" },
  {
    match: /^(b[ée]n[ée]volat|exp[ée]riences? de b[ée]n[ée]volat|volunteer(ing)?( experience)?|ehrenamt)$/i,
    kind: "volunteering",
  },
  { match: /^(publications?|ver[öo]ffentlichungen)$/i, kind: "publications" },
  { match: /^(distinctions?|prix|honors?( & awards?)?|awards?|auszeichnungen)$/i, kind: "honors" },
  { match: /^(cours|courses?|kurse)$/i, kind: "courses" },
];

interface Block {
  kind: SectionKind;
  title: string;
  lines: TextLine[];
}

/* ── Dates ─────────────────────────────────────────────────────────────── */

const MONTH = "[A-Za-zÀ-ÿ]{3,12}\\.?";
const RANGE_RE = new RegExp(
  `(${MONTH}\\s+\\d{4}|\\d{4})\\s*[-–—]\\s*(${MONTH}\\s+\\d{4}|\\d{4}|present|présent|aujourd'hui|actuel|heute|now)`,
  "i",
);
const SINGLE_RE = new RegExp(`^(${MONTH}\\s+\\d{4}|\\d{4})$`, "i");
/** Fin de ligne de diplôme : « … · (juin 2026 - juillet 2029) ». */
const EDU_DATE_RE = /·\s*\(([^)]+)\)\s*$/;
const OPEN_END_RE = /present|présent|aujourd'hui|actuel|heute|now/i;

/* ── Entrée principale ─────────────────────────────────────────────────── */

export async function readLinkedInPdf(buffer: Buffer): Promise<PdfReport> {
  let lines: TextLine[];
  let sizes: SizeProfile;

  try {
    const extraction = await extractLines(buffer);
    lines = extraction.lines;
    sizes = profileSizes(lines);
  } catch {
    throw new PdfImportError(
      "Ce PDF n'a pas pu être lu. Vérifiez qu'il s'agit du fichier produit par « Enregistrer au format PDF » depuis votre profil LinkedIn.",
    );
  }

  if (lines.length < 5) {
    throw new PdfImportError(
      "Aucun texte exploitable. Un PDF scanné ou aplati en image ne peut pas être analysé ; utilisez plutôt l'archive LinkedIn.",
    );
  }

  const warnings: PdfWarning[] = [];
  const { blocks, header, unassigned } = splitIntoBlocks(lines, sizes);

  if (blocks.length === 0) {
    throw new PdfImportError(
      "Ce PDF ne ressemble pas à un profil LinkedIn : aucune section reconnaissable n'y a été trouvée. Utilisez le fichier produit par « Enregistrer au format PDF », ou déposez plutôt l'archive ZIP.",
    );
  }

  const sections: RawSection[] = [];
  const find = (kind: SectionKind): Block | undefined => blocks.find((b) => b.kind === kind);

  const contact = parseContact(find("contact")?.lines ?? [], warnings);
  const summary = joinParagraph(find("summary")?.lines ?? []);

  sections.push({
    domain: "PROFILE",
    rows: [
      {
        "First Name": header.firstName,
        "Last Name": header.lastName,
        Headline: header.headline,
        Summary: summary,
        "Geo Location": header.location,
        Websites: contact.websites,
      },
    ],
  });

  if (contact.email) {
    sections.push({ domain: "EMAIL_ADDRESSES", rows: [{ "Email Address": contact.email }] });
  }
  if (contact.phone) {
    sections.push({ domain: "PHONE_NUMBERS", rows: [{ Number: contact.phone }] });
  }

  const skills = parseListBlock(find("skills")?.lines ?? []);
  if (skills.length > 0) {
    sections.push({ domain: "SKILLS", rows: skills.map((name) => ({ Name: name })) });
  }

  const languages = parseListBlock(find("languages")?.lines ?? []);
  if (languages.length > 0) {
    sections.push({ domain: "LANGUAGES", rows: languages.map(splitLanguage) });
  }

  const certifications = parseListBlock(find("certifications")?.lines ?? []);
  if (certifications.length > 0) {
    sections.push({
      domain: "CERTIFICATIONS",
      rows: certifications.map((name) => ({ Name: name, Authority: "" })),
    });
  }

  const experience = parseExperience(find("experience")?.lines ?? [], sizes, warnings);
  if (experience.length > 0) sections.push({ domain: "POSITIONS", rows: experience });

  const education = parseEducation(find("education")?.lines ?? [], sizes, warnings);
  if (education.length > 0) sections.push({ domain: "EDUCATION", rows: education });

  const volunteering = parseExperience(find("volunteering")?.lines ?? [], sizes, warnings);
  if (volunteering.length > 0) {
    sections.push({
      domain: "VOLUNTEERING_EXPERIENCES",
      rows: volunteering.map((row) => ({
        "Company Name": row["Company Name"] ?? "",
        Role: row["Title"] ?? "",
        Cause: "",
        "Start Date": row["Started On"] ?? "",
        "End Date": row["Finished On"] ?? "",
        Description: row["Description"] ?? "",
      })),
    });
  }

  const projects = parseExperience(find("projects")?.lines ?? [], sizes, warnings);
  if (projects.length > 0) {
    sections.push({
      domain: "PROJECTS",
      rows: projects.map((row) => ({
        Title: row["Company Name"] ?? row["Title"] ?? "",
        Description: row["Description"] ?? "",
        "Started On": row["Started On"] ?? "",
        "Finished On": row["Finished On"] ?? "",
      })),
    });
  }

  for (const [kind, domain] of [
    ["publications", "PUBLICATIONS"],
    ["honors", "HONORS"],
    ["courses", "COURSES"],
  ] as Array<[SectionKind, DomainKey]>) {
    const entries = parseListBlock(find(kind)?.lines ?? []);
    if (entries.length > 0) {
      sections.push({ domain, rows: entries.map((name) => ({ Name: name, Title: name })) });
    }
  }

  const usable = sections.filter(
    (section) => section.domain !== "PROFILE" && section.rows.length > 0,
  );
  if (usable.length === 0) {
    throw new PdfImportError(
      "Aucune donnée exploitable n'a été trouvée dans ce PDF. Déposez plutôt votre archive LinkedIn.",
    );
  }

  for (const block of blocks) {
    if (block.kind !== "other") continue;
    warnings.push({
      section: block.title,
      message: `Section « ${block.title} » détectée mais non exploitée par le CV.`,
    });
  }

  return {
    profile: {
      source: "linkedin-pdf",
      fetchedAt: new Date().toISOString(),
      sections,
    },
    warnings,
    unassigned,
    sectionsFound: blocks.map((block) => block.title),
    confidence: "low",
  };
}

/* ── Découpage en blocs ────────────────────────────────────────────────── */

interface Header {
  firstName: string;
  lastName: string;
  headline: string;
  location: string;
}

function splitIntoBlocks(
  lines: TextLine[],
  sizes: SizeProfile,
): { blocks: Block[]; header: Header; unassigned: string[] } {
  const blocks: Block[] = [];
  const unassigned: string[] = [];
  const headerLines: TextLine[] = [];
  let current: Block | null = null;

  for (const line of lines) {
    // L'identité est la seule ligne à la taille maximale.
    if (
      line.column === "main" &&
      sizes.identity > sizes.mainHeading &&
      line.size >= sizes.identity
    ) {
      headerLines.push(line);
      current = null;
      continue;
    }

    const isHeading =
      line.column === "main"
        ? line.size >= sizes.mainHeading && line.size < sizes.identity
        : line.size >= sizes.sideHeading;

    if (isHeading) {
      const kind = classify(line.text);
      current = { kind: kind ?? "other", title: line.text, lines: [] };
      blocks.push(current);
      continue;
    }

    if (current) current.lines.push(line);
    else if (line.column === "main") headerLines.push(line);
    else unassigned.push(line.text);
  }

  return { blocks, header: parseHeader(headerLines), unassigned };
}

function classify(text: string): SectionKind | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  return SECTION_PATTERNS.find((entry) => entry.match.test(normalized))?.kind ?? null;
}

/**
 * En-tête : nom, accroche, localisation.
 *
 * Le nom est la ligne la plus grande. La localisation est reconnue à sa forme
 * — segments séparés par des virgules — plutôt qu'à sa position, qui varie.
 */
function parseHeader(lines: TextLine[]): Header {
  if (lines.length === 0) return { firstName: "", lastName: "", headline: "", location: "" };

  const sorted = [...lines].sort((a, b) => b.size - a.size);
  const nameLine = sorted[0];
  const name = nameLine?.text.trim() ?? "";
  const rest = lines.filter((line) => line !== nameLine).map((line) => line.text.trim());

  const locationIndex = rest.findIndex((text) => text.split(",").length >= 2);
  const location = locationIndex >= 0 ? (rest[locationIndex] ?? "") : "";
  const headline = rest.find((text, index) => index !== locationIndex && text.length > 0) ?? "";

  const parts = name.split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" "), headline, location };
}

/* ── Barre latérale ────────────────────────────────────────────────────── */

interface Contact {
  email: string;
  phone: string;
  websites: string;
}

function parseContact(lines: TextLine[], warnings: PdfWarning[]): Contact {
  const result: Contact = { email: "", phone: "", websites: "" };
  const urls: string[] = [];

  // Une URL longue est coupée en fin de ligne : « …/in/alix-moreau- » puis
  // « fixture ». Le même recollage que pour les listes s'applique.
  for (const text of parseListBlock(lines)) {
    // « (LinkedIn) », « (Personnel) » : étiquette du lien précédent.
    if (/^\(.+\)$/.test(text)) continue;

    const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text);
    if (email && !result.email) {
      result.email = email[0].toLowerCase();
      continue;
    }

    // Le recollage d'une URL coupée laisse une espace au point de césure.
    const candidate = text.replace(/([/\-_.])\s+(?=\S)/g, "$1");
    if (/^(?:https?:\/\/)?(?:www\.)?[\w-]+\.[\w.-]{2,}(?:\/\S*)?$/i.test(candidate)) {
      urls.push(candidate.startsWith("http") ? candidate : `https://${candidate}`);
      continue;
    }

    const digits = text.replace(/\D/g, "");
    if (digits.length >= 8 && /^[\d\s+().-]+$/.test(text)) {
      result.phone = text;
      continue;
    }

    warnings.push({
      section: "Coordonnées",
      message: `Ligne de contact non identifiée : « ${text} ».`,
      raw: text,
    });
  }

  result.websites = urls.join(", ");
  return result;
}

/**
 * Liste de la barre latérale.
 *
 * Les entrées y sont repliées sur plusieurs lignes sans séparateur. On fusionne
 * une ligne avec la précédente lorsqu'elle en est visiblement la suite :
 * initiale minuscule, parenthèse restée ouverte, ou score isolé.
 */
function parseListBlock(lines: TextLine[]): string[] {
  const entries: string[] = [];
  const threshold = continuationThreshold(lines);
  let previousLine: TextLine | null = null;

  for (const line of lines) {
    const text = line.text.replace(/\u200e/g, "").trim();
    if (!text) continue;

    const previous = entries[entries.length - 1];
    const gap =
      previousLine && previousLine.page === line.page ? previousLine.y - line.y : Infinity;

    // L'écart vertical est le signal le plus fiable : dans une entrée repliée
    // l'interligne est serré, entre deux entrées il est plus large. La
    // typographie du texte ne sert que de repli quand l'écart est ambigu.
    const continues =
      previous !== undefined &&
      (threshold !== null ? gap <= threshold : isContinuation(previous, text));

    if (continues && previous !== undefined) {
      entries[entries.length - 1] = `${previous} ${text}`.replace(/\s+/g, " ");
    } else {
      entries.push(text);
    }
    previousLine = line;
  }

  return entries.filter(Boolean);
}

/**
 * Sépare les deux régimes d'interligne d'un bloc de liste.
 * Renvoie `null` quand la distribution n'est pas assez nette pour trancher.
 */
function continuationThreshold(lines: TextLine[]): number | null {
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const previous = lines[i - 1]!;
    const current = lines[i]!;
    if (previous.page !== current.page) continue;
    const gap = previous.y - current.y;
    if (gap > 0 && gap < 60) gaps.push(gap);
  }
  if (gaps.length < 3) return null;

  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  if (max - min < 4) return null;
  return min + (max - min) / 2;
}

function isContinuation(previous: string, text: string): boolean {
  if (/^[a-zà-ÿ)(]/.test(text)) return true;
  const opens = (previous.match(/\(/g) ?? []).length;
  const closes = (previous.match(/\)/g) ?? []).length;
  if (opens > closes) return true;
  // Score isolé : un intitulé de certification suivi de « 842/1000 ».
  if (/^\d+\s*[/|]\s*\d+$/.test(text)) return true;
  return false;
}

/** « English (Full Professional) » ou « Anglais — bilingue ». */
function splitLanguage(entry: string): Record<string, string> {
  const parenthesised = /^(.+?)\s*[(（]\s*(.+?)\s*[)）]$/.exec(entry);
  if (parenthesised) {
    return { Name: parenthesised[1]?.trim() ?? entry, Proficiency: parenthesised[2]?.trim() ?? "" };
  }
  const dashed = /^(.+?)\s+[-–—]\s+(.+)$/.exec(entry);
  if (dashed) return { Name: dashed[1]?.trim() ?? entry, Proficiency: dashed[2]?.trim() ?? "" };
  return { Name: entry, Proficiency: "" };
}

/* ── Expériences ───────────────────────────────────────────────────────── */

/**
 * Structure d'une entrée d'expérience :
 *
 *   Organisation          (taille « entrée »)
 *   Intitulé du poste     (taille « entrée »)
 *   Période               (taille « méta », contient une plage de dates)
 *   Lieu                  (taille « méta », optionnel)
 *   Description…          (taille « méta »)
 *
 * Le retour de la taille « méta » à la taille « entrée » marque le début de
 * l'entrée suivante.
 */
function parseExperience(
  lines: TextLine[],
  sizes: SizeProfile,
  warnings: PdfWarning[],
): Array<Record<string, string>> {
  if (lines.length === 0) return [];

  const groups: TextLine[][] = [];
  let group: TextLine[] = [];

  for (const line of lines) {
    const startsEntry = line.size >= sizes.entry;
    const previousWasMeta = group.length > 0 && (group[group.length - 1]?.size ?? 0) < sizes.entry;
    if (startsEntry && previousWasMeta) {
      groups.push(group);
      group = [];
    }
    group.push(line);
  }
  if (group.length > 0) groups.push(group);

  return groups
    .map((entry, index): Record<string, string> | null => {
      const heads = entry.filter((line) => line.size >= sizes.entry).map((line) => line.text.trim());
      const metas = entry.filter((line) => line.size < sizes.entry).map((line) => line.text.trim());

      const organization = heads[0] ?? "";
      const title = heads[1] ?? "";
      if (!organization && !title) return null;

      const dateIndex = metas.findIndex((text) => RANGE_RE.test(text) || SINGLE_RE.test(text));
      const dateLine = dateIndex >= 0 ? (metas[dateIndex] ?? "") : "";
      const { start, end } = parseRange(dateLine);

      if (!dateLine) {
        warnings.push({
          section: "Expérience",
          message: `Aucune date trouvée pour « ${organization || title || `entrée ${index + 1}`} » ; à compléter.`,
        });
      }

      const after = dateIndex >= 0 ? metas.slice(dateIndex + 1) : metas;
      // La ligne suivant la date est le lieu si elle est courte et dépourvue de
      // ponctuation de phrase.
      const candidate = after[0] ?? "";
      const looksLikeLocation =
        candidate.length > 0 && candidate.length <= 70 && !/[.:;•]|^-\s/.test(candidate);

      return {
        "Company Name": organization,
        Title: title,
        Location: looksLikeLocation ? candidate : "",
        "Started On": start,
        "Finished On": end,
        Description: foldDescription(looksLikeLocation ? after.slice(1) : after),
      };
    })
    .filter((row): row is Record<string, string> => row !== null);
}

function parseRange(text: string): { start: string; end: string } {
  const range = RANGE_RE.exec(text);
  if (range) {
    const rawEnd = (range[2] ?? "").trim();
    return { start: (range[1] ?? "").trim(), end: OPEN_END_RE.test(rawEnd) ? "" : rawEnd };
  }
  const single = SINGLE_RE.exec(text.trim());
  if (single) {
    const value = (single[1] ?? "").trim();
    return { start: value, end: value };
  }
  return { start: "", end: "" };
}

/* ── Formations ────────────────────────────────────────────────────────── */

/**
 * Structure d'une entrée de formation :
 *
 *   Établissement                (taille « entrée »)
 *   Diplôme, domaine · (dates)   (taille « méta », replié sur n lignes)
 *
 * Le marqueur `· (…)` clôt l'entrée, ce qui rend le découpage fiable même quand
 * l'intitulé du diplôme court sur plusieurs lignes.
 */
function parseEducation(
  lines: TextLine[],
  sizes: SizeProfile,
  warnings: PdfWarning[],
): Array<Record<string, string>> {
  if (lines.length === 0) return [];

  const rows: Array<Record<string, string>> = [];
  let institution = "";
  let degreeParts: string[] = [];
  let pending = "";

  const flush = (dateText: string): void => {
    const degree = degreeParts.join(" ").replace(/\s+/g, " ").trim();
    if (!institution && !degree) return;

    const { start, end } = parseRange(dateText);
    if (dateText && !start) {
      warnings.push({
        section: "Formation",
        message: `Période « ${dateText} » non interprétable pour « ${institution} ».`,
        raw: dateText,
      });
    }

    rows.push({
      "School Name": institution,
      "Degree Name": degree,
      "Start Date": start,
      "End Date": end,
      Notes: "",
    });

    institution = "";
    degreeParts = [];
  };

  for (const line of lines) {
    const text = line.text.trim();

    if (line.size >= sizes.entry) {
      // Nouvel établissement alors qu'une entrée est ouverte : on la ferme sans
      // date plutôt que de perdre son contenu.
      if (institution || degreeParts.length > 0) flush("");
      institution = text;
      continue;
    }

    // La parenthèse de dates peut être coupée en fin de ligne :
    // « … · (juin » puis « 2020) ». On recolle avant de tester.
    const merged = pending ? `${pending} ${text}` : text;
    const dateMatch = EDU_DATE_RE.exec(merged);
    if (dateMatch) {
      degreeParts.push(merged.replace(EDU_DATE_RE, "").trim());
      flush(dateMatch[1] ?? "");
      pending = "";
      continue;
    }

    if (/·\s*\([^)]*$/.test(merged)) {
      pending = merged;
      continue;
    }

    if (pending) {
      degreeParts.push(pending);
      pending = "";
    }
    degreeParts.push(text);
  }

  if (pending) degreeParts.push(pending);
  if (institution || degreeParts.length > 0) flush("");
  return rows;
}

/* ── Utilitaires ───────────────────────────────────────────────────────── */

/**
 * Recolle une description repliée.
 *
 * Dans le PDF, une puce longue est coupée sur plusieurs lignes sans marqueur :
 * « Conduite d'une enquête… avec 72 » puis « % d'avis favorables. ». Seule une
 * ligne commençant par un marqueur ouvre une nouvelle puce ; tout le reste
 * poursuit la précédente.
 */
function foldDescription(lines: string[]): string {
  const out: string[] = [];
  for (const raw of lines) {
    const text = raw.trim();
    if (!text) continue;
    const previous = out[out.length - 1];
    if (/^[-•·*–]\s?/.test(text) || previous === undefined) out.push(text);
    else out[out.length - 1] = `${previous} ${text}`;
  }
  return out.join("\n").replace(/[ \t]+/g, " ").trim();
}

/** Recolle un paragraphe replié, en préservant les listes à puces. */
function joinParagraph(lines: TextLine[]): string {
  const out: string[] = [];

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;

    const isBullet = /^[-•·*–]\s?/.test(text);
    const previous = out[out.length - 1];

    if (isBullet || !previous) {
      out.push(text);
      continue;
    }
    if (/^[a-zà-ÿ(«"']/.test(text) || /[,;:]$/.test(previous)) {
      out[out.length - 1] = `${previous} ${text}`;
      continue;
    }
    out.push(text);
  }

  return out.join("\n").replace(/[ \t]+/g, " ").trim();
}
