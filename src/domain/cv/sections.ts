/**
 * Registre des sections.
 *
 * `Presentation.sections` existait déjà mais n'était lu par aucun renderer :
 * la mise en page était figée dans le gabarit. Ce module en fait la source
 * d'autorité — ordre, visibilité, intitulé, colonne — pour l'écran,
 * l'impression et le LaTeX.
 *
 * Une section est soit standard (`experiences`, `languages`…), soit
 * personnalisée (`custom:<id>`), et les deux se manipulent de la même façon.
 */

import type { CVData, Locale, Localized, Presentation } from "./types";
import { resolveLocalized } from "./schema";

export const STANDARD_SECTIONS = [
  "profile",
  "summary",
  "experiences",
  "education",
  "skills",
  "languages",
  "certifications",
  "projects",
  "interests",
] as const;

export type StandardSection = (typeof STANDARD_SECTIONS)[number];

export type SectionColumn = "main" | "aside";

/** Libellés par défaut, surchargeables entrée par entrée dans le studio. */
export const DEFAULT_TITLES: Record<Locale, Record<StandardSection, string>> = {
  fr: {
    profile: "Profil",
    summary: "À propos",
    experiences: "Expériences",
    education: "Formations",
    skills: "Compétences",
    languages: "Langues",
    certifications: "Certifications",
    projects: "Projets",
    interests: "Centres d'intérêt",
  },
  en: {
    profile: "Profile",
    summary: "About",
    experiences: "Experience",
    education: "Education",
    skills: "Skills",
    languages: "Languages",
    certifications: "Certifications",
    projects: "Projects",
    interests: "Interests",
  },
};

/** Colonne naturelle d'une section, appliquée à la création. */
const DEFAULT_COLUMN: Record<StandardSection, SectionColumn> = {
  profile: "aside",
  summary: "main",
  experiences: "main",
  education: "main",
  skills: "aside",
  languages: "aside",
  certifications: "aside",
  projects: "main",
  interests: "aside",
};

/** Ordre naturel à l'import, avant toute personnalisation. */
const DEFAULT_ORDER: StandardSection[] = [
  "profile",
  "summary",
  "experiences",
  "education",
  "skills",
  "languages",
  "certifications",
  "projects",
  "interests",
];

export interface ResolvedSection {
  key: string;
  kind: StandardSection | "custom";
  /** Identifiant de la section personnalisée, le cas échéant. */
  customId: string | null;
  title: string;
  visible: boolean;
  column: SectionColumn;
  /** Nombre d'éléments : une section vide n'est pas rendue. */
  count: number;
}

export function isCustomKey(key: string): boolean {
  return key.startsWith("custom:");
}

export function customIdOf(key: string): string | null {
  return isCustomKey(key) ? key.slice("custom:".length) : null;
}

/** Compte les éléments d'une section : sert à masquer les sections vides. */
export function sectionCount(key: string, data: CVData): number {
  const customId = customIdOf(key);
  if (customId) {
    return data.customSections.find((s) => s.id === customId)?.entries.length ?? 0;
  }

  switch (key as StandardSection) {
    case "profile":
      return 1;
    case "summary":
      return data.summary ? 1 : 0;
    case "experiences":
      return data.experiences.length;
    case "education":
      return data.education.length;
    case "skills":
      return data.skills.reduce((total, group) => total + group.skills.length, 0);
    case "languages":
      return data.languages.length;
    case "certifications":
      return data.certifications.length;
    case "projects":
      return data.projects.length;
    case "interests":
      return data.interests.length;
    default:
      return 0;
  }
}

/**
 * Produit la liste ordonnée des sections.
 *
 * Toute section absente de la configuration est ajoutée à la fin avec ses
 * réglages par défaut : un CVData enrichi après coup — nouvelle section
 * personnalisée, import complémentaire — apparaît sans intervention.
 */
export function resolveSections(
  data: CVData,
  presentation: Presentation,
  locale: Locale,
  primary: Locale = locale,
): ResolvedSection[] {
  const configured = presentation.sections ?? [];
  const seen = new Set(configured.map((entry) => entry.key));

  const missing: string[] = [
    ...DEFAULT_ORDER.filter((key) => !seen.has(key)),
    ...data.customSections.map((section) => `custom:${section.id}`).filter((key) => !seen.has(key)),
  ];

  const all = [
    ...configured.map((entry) => ({
      key: entry.key,
      visible: entry.visible !== false,
      title: entry.title as Localized<string> | undefined,
      column: (entry as { column?: SectionColumn }).column,
    })),
    ...missing.map((key) => ({
      key,
      visible: true,
      title: undefined as Localized<string> | undefined,
      column: undefined as SectionColumn | undefined,
    })),
  ];

  return all.map((entry) => {
    const customId = customIdOf(entry.key);
    const kind: StandardSection | "custom" = customId ? "custom" : (entry.key as StandardSection);

    const custom = customId
      ? data.customSections.find((section) => section.id === customId)
      : undefined;

    const fallback = customId
      ? (resolveLocalized(custom?.title, locale, primary) ?? "Section")
      : (DEFAULT_TITLES[locale][kind as StandardSection] ?? entry.key);

    return {
      key: entry.key,
      kind,
      customId,
      title: resolveLocalized(entry.title, locale, primary) ?? fallback,
      visible: entry.visible,
      column: entry.column ?? (customId ? "main" : DEFAULT_COLUMN[kind as StandardSection]),
      count: sectionCount(entry.key, data),
    };
  });
}

/** Sections effectivement rendues : visibles et non vides. */
export function renderableSections(sections: ResolvedSection[]): ResolvedSection[] {
  return sections.filter((section) => section.visible && section.count > 0);
}

/** Configuration initiale d'un document importé : ordre et colonnes naturels. */
export function defaultSectionConfig(): Array<{
  key: string;
  visible: boolean;
  column: SectionColumn;
}> {
  return DEFAULT_ORDER.map((key) => ({ key, visible: true, column: DEFAULT_COLUMN[key] }));
}
