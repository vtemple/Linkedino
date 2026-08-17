/**
 * Contrat d'importation.
 *
 * Toutes les sources de profil convergent vers une seule représentation
 * intermédiaire, `RawProfile`, avant normalisation. Ce choix n'est pas
 * cosmétique : la Member Snapshot API de LinkedIn renvoie ses données sous
 * forme de lignes clé/valeur dont les clés sont exactement les en-têtes de
 * colonnes de l'archive CSV (« First Name », « Company Name », « Started On »…).
 *
 * Conséquence : l'API DMA, l'archive ZIP et le PDF de profil partagent le
 * *même* normaliseur. Ajouter une source revient à écrire un transport qui
 * produit des `RawSection` ; rien d'autre dans le SaaS ne bouge.
 *
 * Aucun modèle de langage n'intervient à aucune étape.
 */

import type { CVData } from "../../domain/cv/types";
import type { NormalizeWarning } from "../normalize";

/** Identifiants des domaines LinkedIn utiles à un CV. */
export const CV_DOMAINS = [
  "PROFILE",
  "POSITIONS",
  "EDUCATION",
  "SKILLS",
  "LANGUAGES",
  "CERTIFICATIONS",
  "PROJECTS",
  "COURSES",
  "HONORS",
  "PUBLICATIONS",
  "VOLUNTEERING_EXPERIENCES",
  "EMAIL_ADDRESSES",
  "PHONE_NUMBERS",
] as const;

export type DomainKey = (typeof CV_DOMAINS)[number];

/** Une section brute : un domaine, et ses lignes telles que la source les livre. */
export interface RawSection {
  domain: DomainKey;
  rows: Array<Record<string, string>>;
}

export type ProfileSourceId =
  | "linkedin-portability"
  | "linkedin-archive"
  | "linkedin-pdf"
  | "manual";

export interface RawProfile {
  source: ProfileSourceId;
  fetchedAt: string;
  sections: RawSection[];
  /** Données que la source fournit hors domaines (photo OIDC, par exemple). */
  extras?: {
    pictureUrl?: string;
    email?: string;
    givenName?: string;
    familyName?: string;
    locale?: string;
  };
}

/** Ce que la normalisation a réellement pu remplir, section par section. */
export type Coverage = Record<string, { filled: number; source: ProfileSourceId | null }>;

export interface NormalizeResult {
  data: CVData;
  warnings: NormalizeWarning[];
  coverage: Coverage;
  /** Champs que la source ne fournit jamais — à compléter par l'utilisateur. */
  gaps: string[];
}

export interface ProfileImporter {
  readonly id: ProfileSourceId;
  readonly label: string;
  /** Domaines que cette source sait fournir. */
  readonly domains: readonly DomainKey[];
  accepts(input: unknown): boolean;
  load(input: unknown): Promise<RawProfile>;
}

/** Fusionne plusieurs sources : la première non vide gagne, section par section.
 *  Permet de compléter un import API par une archive sans rien réécrire. */
export function mergeRawProfiles(profiles: RawProfile[]): RawProfile {
  const byDomain = new Map<DomainKey, RawSection>();
  let extras: RawProfile["extras"] = {};

  for (const profile of profiles) {
    for (const section of profile.sections) {
      const existing = byDomain.get(section.domain);
      if (!existing || existing.rows.length === 0) {
        byDomain.set(section.domain, section);
      }
    }
    extras = { ...extras, ...profile.extras };
  }

  return {
    source: profiles[0]?.source ?? "manual",
    fetchedAt: new Date().toISOString(),
    sections: [...byDomain.values()],
    extras,
  };
}
