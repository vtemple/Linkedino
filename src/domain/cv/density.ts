/**
 * Analyse de densité.
 *
 * Estime la place qu'occupera un CVData sur une A4 et formule des conseils.
 * Rien n'est jamais tronqué ni modifié : le rôle de ce module est d'informer,
 * la décision reste à l'utilisateur.
 *
 * ─── Pourquoi une estimation, et pas un décompte de caractères ───────────
 * Les seuils dérivent des métriques réelles du gabarit d'impression : largeur
 * des deux colonnes, corps de texte, interlignes, marges. Compter les
 * caractères produirait un chiffre sans rapport avec la page ; ici on estime
 * des millimètres de hauteur A4, avec le même modèle typographique que le
 * renderer. Le studio affine ensuite ce résultat par une mesure réelle dans
 * Chromium (voir `/api/cv/[id]/fit`).
 * ────────────────────────────────────────────────────────────────────────
 */

import { toPlain } from "./richtext";
import { resolveLocalized } from "./schema";
import { renderableSections, resolveSections } from "./sections";
import type { CVData, Locale, Localized, Presentation, RichText } from "./types";

/* ── Métriques du gabarit d'impression ─────────────────────────────────── */

/**
 * Ces valeurs suivent `printStyles` : A4 moins les marges, partage 35 / 65,
 * corps à 9,4 pt et interligne 1,45. Toute modification du gabarit doit être
 * répercutée ici — c'est le prix d'une estimation fidèle sans lancer Chromium.
 */
const SHEET = {
  /** Hauteur imprimable en millimètres (297 − 13 haut − 14 bas). */
  height: 270,
  /** Largeurs utiles des deux colonnes, gouttière déduite. */
  mainWidth: 108,
  asideWidth: 56,
  /** Hauteur d'une ligne de corps, en millimètres. */
  lineHeight: 4.7,
  /** Largeur moyenne d'un caractère de corps, en millimètres. */
  charWidth: 1.62,
} as const;

/** Nombre de lignes qu'occupe un texte dans une colonne donnée. */
function linesFor(text: string, widthMm: number, scale = 1): number {
  if (!text.trim()) return 0;
  const perLine = Math.max(12, Math.floor(widthMm / (SHEET.charWidth * scale)));
  return text
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / perLine)), 0);
}

function mm(lines: number, scale = 1): number {
  return lines * SHEET.lineHeight * scale;
}

/* ── Rapport ───────────────────────────────────────────────────────────── */

export type DensityLevel = "normal" | "attention" | "recommandation" | "critique";

export interface DensityAdvice {
  id: string;
  level: Exclude<DensityLevel, "normal">;
  /** Section concernée, pour pointer l'utilisateur au bon endroit. */
  scope: string;
  message: string;
}

export interface DensityReport {
  level: DensityLevel;
  /** Hauteur estimée du contenu, en millimètres d'A4. */
  estimatedMm: number;
  capacityMm: number;
  /** 1 = la page est pleine. Au-delà, la mise en page devra se resserrer. */
  fillRatio: number;
  /** Verdict lisible : ce qu'on affiche à côté du bouton d'export. */
  pageEstimate: "une page" | "une page, resserrée" | "plus d'une page";
  advices: DensityAdvice[];
  counts: {
    experiences: number;
    bullets: number;
    education: number;
    skills: number;
    languages: number;
    certifications: number;
    interests: number;
    customEntries: number;
  };
}

/**
 * Seuils.
 *
 * Ils correspondent au mécanisme réel d'ajustement : le PDF humain se resserre
 * jusqu'à 66 % avant qu'on refuse d'aller plus loin, soit une capacité utile
 * d'environ 1,5 page. Au-delà, aucune réduction acceptable ne fera tenir le
 * document — c'est le seuil « critique ».
 */
const THRESHOLDS = { attention: 0.9, recommandation: 1.0, critique: 1.5 } as const;

/** Longueur au-delà de laquelle une puce cesse d'être lue en diagonale. */
const LONG_BULLET = 190;
const LONG_SUMMARY = 700;
const LONG_HEADLINE = 90;

export function analyseDensity(
  data: CVData,
  presentation: Presentation,
  locale: Locale,
  primary: Locale = locale,
): DensityReport {
  const t = <T,>(value: Localized<T> | undefined): T | undefined =>
    resolveLocalized(value, locale, primary);
  const plain = (value: Localized<RichText> | undefined): string => {
    const nodes = t(value);
    return nodes ? toPlain(nodes) : "";
  };

  const sections = renderableSections(resolveSections(data, presentation, locale, primary));
  const visible = new Set(sections.map((section) => section.key));
  const column = new Map(sections.map((section) => [section.key, section.column]));
  const widthOf = (key: string): number =>
    column.get(key) === "aside" ? SHEET.asideWidth : SHEET.mainWidth;

  const advices: DensityAdvice[] = [];
  let mainMm = 0;
  let asideMm = 0;

  const add = (key: string, height: number): void => {
    if (column.get(key) === "aside") asideMm += height;
    else mainMm += height;
  };

  /* Identité — bloc de tête, hauteur quasi fixe. */
  if (visible.has("profile")) {
    add("profile", data.personal.photo ? 62 : 22);
  }

  const headline = t(data.personal.headline) ?? "";
  if (headline.length > LONG_HEADLINE) {
    advices.push({
      id: "headline-long",
      level: "attention",
      scope: "personal",
      message: `Votre accroche fait ${headline.length} caractères. Une formule courte se retient mieux et laisse de la place au parcours.`,
    });
  }

  /* Résumé */
  if (visible.has("summary")) {
    const summary = plain(data.summary);
    add("summary", mm(linesFor(summary, widthOf("summary"))) + 8);

    if (summary.length > LONG_SUMMARY) {
      advices.push({
        id: "summary-long",
        level: "recommandation",
        scope: "summary",
        message: `Votre résumé fait ${summary.length} caractères. En dessous de 600, il est lu ; au-delà, il est souvent sauté.`,
      });
    }
  }

  /* Expériences */
  let bulletCount = 0;

  if (visible.has("experiences")) {
    let height = 10;

    for (const entry of data.experiences) {
      const bullets = t(entry.bullets) ?? [];
      bulletCount += bullets.length;

      // En-tête d'entrée : intitulé, organisation, dates.
      height += mm(2) + 3;
      for (const bullet of bullets) {
        height += mm(linesFor(toPlain(bullet), widthOf("experiences") - 4));
      }

      if (bullets.length > 6) {
        advices.push({
          id: `bullets-${entry.id}`,
          level: "recommandation",
          scope: `experiences:${entry.id}`,
          message: `« ${t(entry.role) ?? entry.organization} » compte ${bullets.length} puces. Trois à cinq réalisations marquantes portent davantage.`,
        });
      }

      const longest = bullets.map(toPlain).find((text) => text.length > LONG_BULLET);
      if (longest) {
        advices.push({
          id: `bullet-long-${entry.id}`,
          level: "attention",
          scope: `experiences:${entry.id}`,
          message: `Une puce de « ${entry.organization} » dépasse ${LONG_BULLET} caractères. La scinder ou la synthétiser la rendra plus lisible.`,
        });
      }
    }

    add("experiences", height);

    if (data.experiences.length > 8) {
      advices.push({
        id: "experiences-count",
        level: data.experiences.length > 12 ? "critique" : "recommandation",
        scope: "experiences",
        message: `${data.experiences.length} expériences rendent le CV difficile à parcourir. Les plus anciennes gagnent souvent à être réduites à une ligne, voire regroupées.`,
      });
    }
  }

  /* Formations */
  if (visible.has("education")) {
    add("education", 10 + data.education.length * (mm(2) + 3));

    if (data.education.length > 5) {
      advices.push({
        id: "education-count",
        level: "attention",
        scope: "education",
        message: `${data.education.length} formations : au-delà du bac, les diplômes les plus récents suffisent généralement.`,
      });
    }
  }

  /* Compétences — rendues en pastilles, environ trois par ligne en colonne étroite. */
  const skillCount = data.skills.reduce((total, group) => total + group.skills.length, 0);
  if (visible.has("skills")) {
    const perLine = column.get("skills") === "aside" ? 2 : 4;
    add("skills", 10 + mm(Math.ceil(skillCount / perLine)) * 1.2);

    if (skillCount > 12) {
      advices.push({
        id: "skills-count",
        level: skillCount > 25 ? "recommandation" : "attention",
        scope: "skills",
        message: `${skillCount} compétences diluent le message. Une dizaine, choisies pour le poste visé, ressortent mieux.`,
      });
    }
  }

  /* Langues */
  if (visible.has("languages")) {
    add("languages", 10 + data.languages.length * mm(1.4));
  }

  /* Certifications */
  if (visible.has("certifications")) {
    add("certifications", 10 + data.certifications.length * (mm(1.6) + 1.5));

    if (data.certifications.length > 8) {
      advices.push({
        id: "certifications-count",
        level: "recommandation",
        scope: "certifications",
        message: `${data.certifications.length} certifications occupent beaucoup de place. Mettre en avant les plus pertinentes et masquer les autres allège la lecture.`,
      });
    }
  }

  /* Centres d'intérêt */
  if (visible.has("interests")) {
    let height = 10;
    for (const interest of data.interests) {
      height += mm(linesFor(plain(interest.text), widthOf("interests")) + 1);
    }
    add("interests", height);

    if (data.interests.length > 6) {
      advices.push({
        id: "interests-count",
        level: "attention",
        scope: "interests",
        message: `${data.interests.length} centres d'intérêt : trois ou quatre, choisis pour ce qu'ils disent de vous, suffisent.`,
      });
    }
  }

  /* Sections personnalisées */
  let customEntries = 0;

  for (const section of data.customSections) {
    const key = `custom:${section.id}`;
    if (!visible.has(key)) continue;

    customEntries += section.entries.length;
    let height = 10;

    for (const entry of section.entries) {
      height += mm(1.6) + 2;
      for (const bullet of t(entry.bullets) ?? []) {
        height += mm(linesFor(toPlain(bullet), widthOf(key) - 4));
      }
    }
    add(key, height);

    if (section.entries.length > 8) {
      advices.push({
        id: `custom-${section.id}`,
        level: "attention",
        scope: key,
        message: `La section « ${t(section.title) ?? "personnalisée"} » compte ${section.entries.length} entrées. La simplifier évitera qu'elle prenne le pas sur le parcours.`,
      });
    }
  }

  /* Verdict */

  // Les deux colonnes s'écoulent en parallèle : c'est la plus haute qui
  // détermine la hauteur de la page, pas leur somme.
  const estimatedMm = Math.max(mainMm, asideMm);
  const fillRatio = estimatedMm / SHEET.height;

  const level: DensityLevel =
    fillRatio > THRESHOLDS.critique
      ? "critique"
      : fillRatio > THRESHOLDS.recommandation
        ? "recommandation"
        : fillRatio > THRESHOLDS.attention
          ? "attention"
          : "normal";

  if (level === "critique") {
    advices.unshift({
      id: "page-overflow",
      level: "critique",
      scope: "global",
      message:
        "Le contenu ne peut plus tenir sur une page A4 à une taille de police acceptable. Les PDF seront livrés sur deux pages.",
    });
  } else if (level === "recommandation") {
    advices.unshift({
      id: "page-tight",
      level: "recommandation",
      scope: "global",
      message:
        "Votre CV risque de dépasser une page A4. La mise en page se resserrera automatiquement pour l'éviter.",
    });
  }

  return {
    level,
    estimatedMm: Math.round(estimatedMm),
    capacityMm: SHEET.height,
    fillRatio: Number(fillRatio.toFixed(3)),
    pageEstimate:
      fillRatio > THRESHOLDS.critique
        ? "plus d'une page"
        : fillRatio > THRESHOLDS.recommandation
          ? "une page, resserrée"
          : "une page",
    advices,
    counts: {
      experiences: data.experiences.length,
      bullets: bulletCount,
      education: data.education.length,
      skills: skillCount,
      languages: data.languages.length,
      certifications: data.certifications.length,
      interests: data.interests.length,
      customEntries,
    },
  };
}
