/**
 * Libellés du rendu LaTeX.
 *
 * Les intitulés de sections sont volontairement ceux que les analyseurs de CV
 * reconnaissent : « Expérience professionnelle », « Formation »,
 * « Professional Experience », « Education ». Un titre créatif coûte du
 * matching et n'apporte rien dans ce format.
 */

import type { Locale } from "../../../domain/cv/types";

export interface SectionLabels {
  summary: string;
  experiences: string;
  education: string;
  skills: string;
  languages: string;
  certifications: string;
  projects: string;
  interests: string;
  credential: string;
}

export const SECTION_LABELS: Record<Locale, SectionLabels> = {
  fr: {
    summary: "Profil",
    experiences: "Expérience professionnelle",
    education: "Formation",
    skills: "Compétences",
    languages: "Langues",
    certifications: "Certifications",
    projects: "Projets",
    interests: "Centres d'intérêt",
    credential: "identifiant",
  },
  en: {
    summary: "Profile",
    experiences: "Professional Experience",
    education: "Education",
    skills: "Skills",
    languages: "Languages",
    certifications: "Certifications",
    projects: "Projects",
    interests: "Interests",
    credential: "credential",
  },
};

export const CONTRACT_LABELS: Record<Locale, Record<string, string>> = {
  fr: {
    cdi: "CDI",
    cdd: "CDD",
    stage: "stage",
    alternance: "alternance",
    freelance: "freelance",
    interim: "intérim",
    benevolat: "bénévolat",
  },
  en: {
    cdi: "permanent",
    cdd: "fixed-term",
    stage: "internship",
    alternance: "apprenticeship",
    freelance: "freelance",
    interim: "temporary",
    benevolat: "volunteer",
  },
};

export const LEVEL_LABELS: Record<Locale, Record<string, string>> = {
  fr: {
    A1: "A1 — débutant",
    A2: "A2 — élémentaire",
    B1: "B1 — intermédiaire",
    B2: "B2 — intermédiaire supérieur",
    C1: "C1 — avancé",
    C2: "C2 — maîtrise",
    native: "langue maternelle",
  },
  en: {
    A1: "A1 — beginner",
    A2: "A2 — elementary",
    B1: "B1 — intermediate",
    B2: "B2 — upper intermediate",
    C1: "C1 — advanced",
    C2: "C2 — proficient",
    native: "native speaker",
  },
};
