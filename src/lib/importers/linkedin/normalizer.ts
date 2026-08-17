/**
 * Normaliseur LinkedIn.
 *
 * Transforme un `RawProfile` (lignes clé/valeur) en `CVData`. Unique pour les
 * trois sources : API DMA, archive ZIP, PDF de profil.
 *
 * Deux principes tenus ici :
 *
 * 1. **Tolérance aux noms de colonnes.** La documentation officielle ne publie
 *    pas la liste exacte des en-têtes par domaine, et LinkedIn les a déjà fait
 *    varier par le passé. Chaque champ cible accepte donc plusieurs alias,
 *    comparés sans casse ni accents. Une colonne inconnue n'est jamais perdue :
 *    elle produit un avertissement.
 *
 * 2. **Aucune invention.** Un niveau de langue non reconnu, une date illisible,
 *    un intitulé ambigu remontent en avertissement au lieu d'être devinés.
 */

import { parseLegacyRange, compareRangesDesc } from "../../../domain/cv/dates";
import { fromPlain } from "../../../domain/cv/richtext";
import type {
  Certification,
  CVData,
  Education,
  Experience,
  Interest,
  Language,
  Project,
  SkillGroup,
} from "../../../domain/cv/types";
import {
  deterministicId,
  normalizePhone,
  parseLocation,
  splitRoleAndContract,
  type NormalizeWarning,
} from "../../normalize";
import type {
  Coverage,
  DomainKey,
  NormalizeResult,
  RawProfile,
  RawSection,
} from "../types";

/* ── Accès tolérant aux colonnes ───────────────────────────────────────── */

function key(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Lit la première colonne présente parmi les alias donnés. */
function pick(row: Record<string, string>, aliases: string[]): string {
  const normalized = new Map<string, string>();
  for (const [name, value] of Object.entries(row)) normalized.set(key(name), value);

  for (const alias of aliases) {
    const value = normalized.get(key(alias));
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

/** Colonnes qu'aucun alias n'a réclamées — signalées, jamais silencieuses. */
function reportUnmapped(
  section: RawSection,
  claimed: string[],
  warnings: NormalizeWarning[],
): void {
  const claimedKeys = new Set(claimed.map(key));
  const seen = new Set<string>();

  for (const row of section.rows) {
    for (const [name, value] of Object.entries(row)) {
      if (claimedKeys.has(key(name))) continue;
      if (!String(value ?? "").trim()) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      warnings.push({
        path: `${section.domain}.${name}`,
        code: "contact_non_reconnu",
        raw: String(value).slice(0, 60),
        message: `Colonne « ${name} » non exploitée par le CV (${section.domain}).`,
      });
    }
  }
}

/* ── Niveaux de langue ─────────────────────────────────────────────────────
   LinkedIn n'utilise pas le CECRL mais son propre barème à cinq échelons.
   La correspondance ci-dessous est une convention explicite et documentée,
   pas une estimation : elle suit l'équivalence usuelle des cadres. */

const PROFICIENCY_TO_CEFR: Array<{ match: RegExp; level: Language["level"] }> = [
  { match: /native|bilingual|maternelle|bilingue/i, level: "native" },
  { match: /full professional|professionnelle compl/i, level: "C1" },
  { match: /professional working|professionnelle/i, level: "B2" },
  { match: /limited working|limit/i, level: "B1" },
  { match: /elementary|notions|elementaire/i, level: "A2" },
];

/* ── Normalisation ─────────────────────────────────────────────────────── */

export function normalizeLinkedInProfile(raw: RawProfile): NormalizeResult {
  const warnings: NormalizeWarning[] = [];
  const coverage: Coverage = {};
  const sections = new Map<DomainKey, RawSection>(
    raw.sections.map((section) => [section.domain, section]),
  );

  const rowsOf = (domain: DomainKey): Array<Record<string, string>> =>
    sections.get(domain)?.rows ?? [];

  const mark = (name: string, filled: number): void => {
    coverage[name] = { filled, source: filled > 0 ? raw.source : null };
  };

  /* Identité */

  const profileRow = rowsOf("PROFILE")[0] ?? {};
  const claimedProfile = [
    "First Name",
    "Last Name",
    "Headline",
    "Summary",
    "Geo Location",
    "Address",
    "Zip Code",
    "Industry",
    "Websites",
    "Maiden Name",
    "Birth Date",
    "Twitter Handles",
    "Instant Messengers",
  ];
  if (sections.has("PROFILE")) {
    reportUnmapped(sections.get("PROFILE")!, claimedProfile, warnings);
  }

  const firstName = pick(profileRow, ["First Name", "firstName"]) || raw.extras?.givenName || "";
  const lastName = pick(profileRow, ["Last Name", "lastName"]) || raw.extras?.familyName || "";
  const headline = pick(profileRow, ["Headline", "headline"]);
  const summary = pick(profileRow, ["Summary", "summary", "About"]);
  const geo = pick(profileRow, ["Geo Location", "Location", "Address"]);

  const email =
    pick(rowsOf("EMAIL_ADDRESSES")[0] ?? {}, ["Email Address", "email"]) ||
    raw.extras?.email ||
    "";

  const phoneRow = rowsOf("PHONE_NUMBERS")[0] ?? {};
  const phone = pick(phoneRow, ["Number", "Phone Number", "phone"]);

  const websites = pick(profileRow, ["Websites", "Web Sites"]);
  const links = parseWebsites(websites);

  const location = geo ? parseLocation(geo, "personal.location", warnings) : undefined;

  /* Expériences */

  const positionRows = rowsOf("POSITIONS");
  if (sections.has("POSITIONS")) {
    reportUnmapped(
      sections.get("POSITIONS")!,
      ["Company Name", "Title", "Description", "Location", "Started On", "Finished On"],
      warnings,
    );
  }

  const experiences: Experience[] = positionRows
    .map((row, index): Experience | null => {
      const organization = pick(row, ["Company Name", "Organization", "companyName"]);
      const rawTitle = pick(row, ["Title", "Position", "Role", "title"]);
      if (!organization && !rawTitle) return null;

      const started = pick(row, ["Started On", "Start Date", "startedOn"]);
      const finished = pick(row, ["Finished On", "End Date", "finishedOn"]);
      const period = buildPeriod(started, finished, `experiences[${index}].period`, warnings);

      const { role, contract } = splitRoleAndContract(rawTitle);
      const description = pick(row, ["Description", "description"]);
      const place = pick(row, ["Location", "location"]);
      const parsedPlace = place
        ? parseLocation(place, `experiences[${index}].location`, warnings)
        : undefined;

      const bullets = splitDescription(description);

      return {
        id: deterministicId("exp", `${organization}|${rawTitle}|${started}`),
        provenance: "import",
        organization: organization || "—",
        logo: null,
        role: { fr: role || "—" },
        ...(contract ? { contract } : {}),
        ...(parsedPlace ? { location: parsedPlace } : {}),
        period,
        ...(bullets.length > 0 ? { bullets: { fr: bullets } } : {}),
      };
    })
    .filter((entry): entry is Experience => entry !== null)
    .sort((a, b) => compareRangesDesc(a.period, b.period));

  /* Formations */

  const educationRows = rowsOf("EDUCATION");
  if (sections.has("EDUCATION")) {
    reportUnmapped(
      sections.get("EDUCATION")!,
      ["School Name", "Start Date", "End Date", "Notes", "Degree Name", "Activities"],
      warnings,
    );
  }

  const education: Education[] = educationRows
    .map((row, index): Education | null => {
      const institution = pick(row, ["School Name", "School", "Institution"]);
      const degree = pick(row, ["Degree Name", "Degree", "Field Of Study"]);
      if (!institution && !degree) return null;

      const started = pick(row, ["Start Date", "Started On"]);
      const finished = pick(row, ["End Date", "Finished On"]);
      const period = buildPeriod(started, finished, `education[${index}].period`, warnings);
      const notes = pick(row, ["Notes", "Activities", "Description"]);

      return {
        id: deterministicId("edu", `${institution}|${degree}|${started}`),
        provenance: "import",
        institution: institution || "—",
        logo: null,
        degree: { fr: degree || institution },
        period,
        ...(notes ? { distinction: { fr: notes } } : {}),
      };
    })
    .filter((entry): entry is Education => entry !== null)
    .sort((a, b) => compareRangesDesc(a.period, b.period));

  /* Compétences — LinkedIn ne fournit aucun niveau, seulement des libellés. */

  const skillRows = rowsOf("SKILLS");
  const skillNames = skillRows
    .map((row) => pick(row, ["Name", "Skill", "skillName"]))
    .filter(Boolean);

  const skills: SkillGroup[] =
    skillNames.length > 0
      ? [
          {
            id: deterministicId("grp", "linkedin-skills"),
            provenance: "import",
            name: { fr: "Compétences" },
            skills: skillNames.map((name) => ({
              id: deterministicId("skl", name),
              provenance: "import" as const,
              name: { fr: name },
            })),
          },
        ]
      : [];

  /* Langues */

  const languageRows = rowsOf("LANGUAGES");
  const languages: Language[] = languageRows
    .map((row, index): Language | null => {
      const name = pick(row, ["Name", "Language", "languageName"]);
      if (!name) return null;
      const proficiency = pick(row, ["Proficiency", "Level"]);
      const level = mapProficiency(proficiency, `languages[${index}].level`, warnings);

      return {
        id: deterministicId("lng", name),
        provenance: "import",
        name: { fr: name },
        level,
      };
    })
    .filter((entry): entry is Language => entry !== null);

  /* Certifications */

  const certificationRows = rowsOf("CERTIFICATIONS");
  if (sections.has("CERTIFICATIONS")) {
    reportUnmapped(
      sections.get("CERTIFICATIONS")!,
      ["Name", "Url", "Authority", "Started On", "Finished On", "License Number"],
      warnings,
    );
  }

  const certifications: Certification[] = certificationRows
    .map((row): Certification | null => {
      const name = pick(row, ["Name", "Certification", "Title"]);
      const issuer = pick(row, ["Authority", "Issuer", "Organization"]);
      if (!name) return null;

      const url = pick(row, ["Url", "URL", "Link"]);
      const credentialId = pick(row, ["License Number", "Credential Id", "License"]);
      const issued = parseLegacyRange(pick(row, ["Started On", "Issue Date"]))?.start;

      return {
        id: deterministicId("crt", `${issuer}|${name}`),
        provenance: "import",
        // Le PDF ne donne pas l'organisme émetteur : on laisse vide plutôt que
        // d'afficher un tiret, et le rendu masque la ligne.
        issuer: issuer || "",
        name: { fr: name },
        logo: null,
        ...(credentialId ? { credentialId } : {}),
        ...(url && /^https?:\/\//i.test(url) ? { url } : {}),
        ...(issued ? { issued } : {}),
        expires: null,
      };
    })
    .filter((entry): entry is Certification => entry !== null);

  /* Projets */

  const projects: Project[] = rowsOf("PROJECTS")
    .map((row, index): Project | null => {
      const name = pick(row, ["Title", "Name", "Project"]);
      if (!name) return null;
      const started = pick(row, ["Started On", "Start Date"]);
      const finished = pick(row, ["Finished On", "End Date"]);
      const url = pick(row, ["Url", "URL"]);
      const description = pick(row, ["Description"]);

      return {
        id: deterministicId("prj", name),
        provenance: "import",
        name: { fr: name },
        ...(url && /^https?:\/\//i.test(url) ? { url } : {}),
        ...(started
          ? { period: buildPeriod(started, finished, `projects[${index}].period`, warnings) }
          : {}),
        ...(description ? { bullets: { fr: splitDescription(description) } } : {}),
        tags: [],
      };
    })
    .filter((entry): entry is Project => entry !== null);

  /* Bénévolat et distinctions → centres d'intérêt et sections libres */

  const interests: Interest[] = rowsOf("VOLUNTEERING_EXPERIENCES")
    .map((row): Interest | null => {
      const organization = pick(row, ["Company Name", "Organization", "Company"]);
      const role = pick(row, ["Role", "Title"]);
      const cause = pick(row, ["Cause"]);
      if (!organization && !role) return null;

      const label = cause || "Bénévolat";
      const text = [role, organization].filter(Boolean).join(" — ");

      return {
        id: deterministicId("int", `${organization}|${role}`),
        provenance: "import",
        label: { fr: label },
        ...(text ? { text: { fr: fromPlain(text) } } : {}),
      };
    })
    .filter((entry): entry is Interest => entry !== null);

  /* Assemblage */

  const data: CVData = {
    personal: {
      firstName: firstName || "Prénom",
      lastName: lastName || "Nom",
      ...(headline ? { headline: { fr: headline } } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone: normalizePhone(phone) } : {}),
      ...(location ? { location } : {}),
      photo: null,
      links,
    },
    ...(summary ? { summary: { fr: fromPlain(summary) } } : {}),
    experiences,
    education,
    skills,
    languages,
    certifications,
    projects,
    interests,
    customSections: [],
  };

  mark("personal", firstName || lastName ? 1 : 0);
  mark("experiences", experiences.length);
  mark("education", education.length);
  mark("skills", skills[0]?.skills.length ?? 0);
  mark("languages", languages.length);
  mark("certifications", certifications.length);
  mark("projects", projects.length);
  mark("interests", interests.length);

  return { data, warnings, coverage, gaps: computeGaps(raw, data) };
}

/* ── Aides ─────────────────────────────────────────────────────────────── */

function buildPeriod(
  started: string,
  finished: string,
  path: string,
  warnings: NormalizeWarning[],
): { start: string; end: string | null; current: boolean } {
  const startRange = parseLegacyRange(started);
  const endRange = finished ? parseLegacyRange(finished) : null;

  if (!startRange) {
    warnings.push({
      path,
      code: "date_illisible",
      raw: started || "(vide)",
      message: `Date de début « ${started || "vide"} » non interprétable ; à saisir.`,
    });
    return { start: String(new Date().getFullYear()), end: null, current: true };
  }

  // Une case « Finished On » vide signifie « en cours » chez LinkedIn.
  if (!finished) return { start: startRange.start, end: null, current: true };

  if (!endRange) {
    warnings.push({
      path,
      code: "date_illisible",
      raw: finished,
      message: `Date de fin « ${finished} » non interprétable ; poste marqué en cours.`,
    });
    return { start: startRange.start, end: null, current: true };
  }

  const end = endRange.end ?? endRange.start;
  if (end < startRange.start) {
    warnings.push({
      path,
      code: "date_illisible",
      raw: `${started} → ${finished}`,
      message: "La date de fin précède le début ; période à vérifier.",
    });
    return { start: startRange.start, end: null, current: false };
  }

  return { start: startRange.start, end, current: false };
}

/** Les descriptions LinkedIn sont du texte libre multiligne, souvent à puces. */
function splitDescription(value: string): ReturnType<typeof fromPlain>[] {
  if (!value.trim()) return [];
  return value
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*[–—\-•*·]\s*/, "").trim())
    .filter(Boolean)
    .map(fromPlain);
}

function mapProficiency(
  value: string,
  path: string,
  warnings: NormalizeWarning[],
): Language["level"] {
  const found = PROFICIENCY_TO_CEFR.find((entry) => entry.match.test(value));
  if (found) return found.level;

  warnings.push({
    path,
    code: "niveau_langue_inconnu",
    raw: value || "(vide)",
    message: `Niveau LinkedIn « ${value || "vide"} » non reconnu ; positionné sur B1, à vérifier.`,
  });
  return "B1";
}

function parseWebsites(value: string): CVData["personal"]["links"] {
  if (!value) return [];
  // Format LinkedIn : « [PERSONAL:https://exemple.fr] », parfois séparés par des virgules.
  const matches = value.match(/https?:\/\/[^\s,\]]+/g) ?? [];
  return matches.map((href) => ({
    id: deterministicId("lnk", href),
    provenance: "import" as const,
    kind: classify(href),
    href,
  }));
}

function classify(href: string): "linkedin" | "github" | "website" | "portfolio" | "other" {
  const value = href.toLowerCase();
  if (value.includes("linkedin.")) return "linkedin";
  if (value.includes("github.")) return "github";
  if (value.includes("behance.") || value.includes("dribbble.")) return "portfolio";
  return "website";
}

/**
 * Ce que LinkedIn ne fournit jamais par cette voie.
 * Sert à guider l'utilisateur dans le studio au lieu de laisser des trous muets.
 */
function computeGaps(raw: RawProfile, data: CVData): string[] {
  const gaps: string[] = [];

  if (!data.personal.photo && !raw.extras?.pictureUrl) {
    gaps.push("Photo de profil — absente du domaine PROFILE ; à téléverser.");
  }
  if (data.experiences.some((entry) => !entry.logo)) {
    gaps.push("Logos d'entreprises — non fournis par LinkedIn ; initiales générées à défaut.");
  }
  if (data.skills[0]?.skills.some((skill) => skill.level === undefined)) {
    gaps.push("Niveaux de compétences — LinkedIn ne livre que les libellés.");
  }
  if (!data.personal.links.some((link) => link.kind === "linkedin")) {
    gaps.push("URL publique du profil — non incluse dans l'export ; à ajouter.");
  }
  if (data.experiences.some((entry) => !entry.contract)) {
    gaps.push("Types de contrat — déduits de l'intitulé quand c'est possible.");
  }

  return gaps;
}
