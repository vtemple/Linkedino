/**
 * Importeur « archive LinkedIn » (ZIP).
 *
 * Voie officielle et mondiale : LinkedIn indique que tous les membres, y
 * compris hors EEE et Suisse, peuvent demander une copie de leurs données
 * depuis leurs réglages. C'est notre repli quand l'API de portabilité n'est
 * pas ouverte au membre.
 *
 * Il produit exactement les mêmes `RawSection` que l'API : les colonnes des
 * CSV sont les clés que renvoie la Member Snapshot API. Le normaliseur, le
 * studio et les trois renderers sont donc partagés sans une ligne spécifique.
 *
 * Aucun réseau, aucun scraping : l'utilisateur dépose un fichier.
 */

import JSZip from "jszip";

import { CV_DOMAINS, type DomainKey, type RawProfile, type RawSection } from "../types";

/* ── Correspondance fichier → domaine ──────────────────────────────────── */

function fileKey(name: string): string {
  const base = name.split("/").pop() ?? name;
  return base
    .replace(/\.csv$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Les noms varient selon la langue du compte et les versions de l'archive. */
const FILE_TO_DOMAIN: Record<string, DomainKey> = {
  profile: "PROFILE",
  profil: "PROFILE",
  positions: "POSITIONS",
  postes: "POSITIONS",
  education: "EDUCATION",
  formation: "EDUCATION",
  skills: "SKILLS",
  competences: "SKILLS",
  languages: "LANGUAGES",
  langues: "LANGUAGES",
  certifications: "CERTIFICATIONS",
  projects: "PROJECTS",
  projets: "PROJECTS",
  courses: "COURSES",
  cours: "COURSES",
  honors: "HONORS",
  distinctions: "HONORS",
  publications: "PUBLICATIONS",
  volunteering: "VOLUNTEERING_EXPERIENCES",
  volunteeringexperiences: "VOLUNTEERING_EXPERIENCES",
  benevolat: "VOLUNTEERING_EXPERIENCES",
  emailaddresses: "EMAIL_ADDRESSES",
  adressesemail: "EMAIL_ADDRESSES",
  phonenumbers: "PHONE_NUMBERS",
  numerosdetelephone: "PHONE_NUMBERS",
};

export interface ArchiveReport {
  profile: RawProfile;
  /** Photo de profil trouvée dans l'archive, le cas échéant. */
  photo?: { bytes: Buffer; name: string };
  /** Fichiers reconnus, avec le nombre de lignes retenues. */
  matched: Array<{ file: string; domain: DomainKey; rows: number }>;
  /** Fichiers présents mais sans usage pour un CV — listés, jamais masqués. */
  ignored: string[];
}

/* ── Lecture ───────────────────────────────────────────────────────────── */

export async function readLinkedInArchive(buffer: Buffer): Promise<ArchiveReport> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new ArchiveError(
      "Le fichier n'est pas une archive ZIP lisible. Déposez l'archive telle que LinkedIn vous l'a envoyée, sans la décompresser.",
    );
  }

  const sections = new Map<DomainKey, RawSection>();
  const matched: ArchiveReport["matched"] = [];
  const ignored: string[] = [];

  const entries = Object.values(zip.files).filter((file) => !file.dir);
  if (entries.length === 0) throw new ArchiveError("L'archive est vide.");

  let photo: ArchiveReport["photo"];

  for (const entry of entries) {
    // L'archive complète embarque la photo de profil, que l'API de
    // portabilité ne fournit pas : on la récupère ici.
    if (!photo && isProfilePhoto(entry.name)) {
      photo = { bytes: Buffer.from(await entry.async("uint8array")), name: entry.name };
      continue;
    }

    if (!/\.csv$/i.test(entry.name)) {
      ignored.push(entry.name);
      continue;
    }

    const domain = FILE_TO_DOMAIN[fileKey(entry.name)];
    if (!domain || !CV_DOMAINS.includes(domain)) {
      ignored.push(entry.name);
      continue;
    }

    const rows = parseCsv(await entry.async("string"));
    if (rows.length === 0) {
      matched.push({ file: entry.name, domain, rows: 0 });
      continue;
    }

    // Un même domaine peut arriver en plusieurs fichiers : on concatène.
    const existing = sections.get(domain);
    if (existing) existing.rows.push(...rows);
    else sections.set(domain, { domain, rows });

    matched.push({ file: entry.name, domain, rows: rows.length });
  }

  if (sections.size === 0) {
    throw new ArchiveError(
      "Aucun fichier exploitable trouvé. Vérifiez d'avoir demandé « The works » ou coché les rubriques de profil dans « Obtenir une copie de vos données ».",
    );
  }

  return {
    profile: {
      source: "linkedin-archive",
      fetchedAt: new Date().toISOString(),
      sections: [...sections.values()],
    },
    ...(photo ? { photo } : {}),
    matched,
    ignored,
  };
}

/** Les archives nomment la photo de façon variable selon leur version. */
function isProfilePhoto(name: string): boolean {
  if (!/\.(jpe?g|png|webp)$/i.test(name)) return false;
  const key = fileKey(name.replace(/\.[a-z]+$/i, ""));
  return (
    key.includes("profile") ||
    key.includes("photo") ||
    key.includes("displaypicture") ||
    key.includes("profilphoto")
  );
}

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveError";
  }
}

/* ── Analyse CSV ───────────────────────────────────────────────────────── */

/**
 * Analyseur CSV conforme au RFC 4180, écrit ici plutôt qu'importé : les
 * fichiers LinkedIn contiennent des descriptions multilignes entre guillemets,
 * cas que les découpages naïfs sur la virgule cassent systématiquement.
 */
export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // Retire le BOM, présent dans les archives LinkedIn.
  const text = input.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((cell) => cell.trim() !== ""));
}

/**
 * Convertit un CSV en lignes clé/valeur.
 *
 * Certaines archives font précéder l'en-tête d'une ligne de remarque
 * (« Notes: … ») : on la saute au lieu de la prendre pour des colonnes.
 */
export function parseCsv(input: string): Array<Record<string, string>> {
  const rows = parseCsvRows(input);
  if (rows.length === 0) return [];

  let headerIndex = 0;
  while (headerIndex < rows.length) {
    const candidate = rows[headerIndex]!;
    const isNote = /^notes?\s*:?$/i.test((candidate[0] ?? "").trim());
    if (!isNote && candidate.filter((cell) => cell.trim() !== "").length >= 1) break;
    headerIndex += 1;
  }

  const header = (rows[headerIndex] ?? []).map((cell) => cell.trim());
  if (header.length === 0) return [];

  return rows
    .slice(headerIndex + 1)
    .map((cells) => {
      const record: Record<string, string> = {};
      header.forEach((name, index) => {
        if (!name) return;
        record[name] = (cells[index] ?? "").trim();
      });
      return record;
    })
    .filter((record) => Object.values(record).some((value) => value !== ""));
}
