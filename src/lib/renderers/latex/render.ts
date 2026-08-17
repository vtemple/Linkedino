/**
 * Renderer LaTeX — format « sobre, linéaire, optimisé ATS ».
 *
 * Fonction pure : mêmes entrées, même sortie, aucun effet de bord. C'est la
 * condition pour les tests par instantané et pour la reproductibilité des
 * exports.
 *
 * Choix assumés pour l'ATS :
 *   - une seule colonne, aucun tableau, aucune boîte ;
 *   - ni photo ni logo (un analyseur ne les lit pas, et ils cassent le flux) ;
 *   - aucun pictogramme ;
 *   - intitulés de sections standards ;
 *   - contacts en texte nu, chacun identifiable isolément.
 */

import { formatRange } from "../../../domain/cv/dates";
import { toPlain } from "../../../domain/cv/richtext";
import { resolveLocalized } from "../../../domain/cv/schema";
import { resolveSections } from "../../../domain/cv/sections";
import type {
  CVDocument,
  Localized,
  Locale,
  RichText,
} from "../../../domain/cv/types";
import { DropReport } from "./escape";
import { buildStyleFile, DEFAULT_STYLE, type StyleOptions } from "./style";
import { SECTION_LABELS, CONTRACT_LABELS, LEVEL_LABELS } from "./labels";

export interface LatexFile {
  path: string;
  content: string;
}

export interface LatexBundle {
  files: LatexFile[];
  warnings: string[];
  /** Texte nu du document, pour vérifier l'extraction ATS en test. */
  plainText: string;
}

export interface LatexOptions {
  locale?: Locale;
  style?: StyleOptions;
  /** Ordre des sections. Par défaut : l'ordre attendu sur un CV français. */
  sectionOrder?: string[];
}

const DEFAULT_ORDER = [
  "summary",
  "experiences",
  "education",
  "skills",
  "languages",
  "certifications",
  "projects",
  "interests",
];

export function renderLatex(doc: CVDocument, options: LatexOptions = {}): LatexBundle {
  const locale = options.locale ?? doc.locales.primary;
  const primary = doc.locales.primary;
  const style = options.style ?? DEFAULT_STYLE;
  const report = new DropReport();
  const labels = SECTION_LABELS[locale];
  const { data, presentation } = doc;

  const esc = (value: string): string => report.escape(value);
  const t = <T>(value: Localized<T> | undefined): T | undefined =>
    resolveLocalized(value, locale, primary);
  const rich = (value: Localized<RichText> | undefined): string => {
    const nodes = t(value);
    return nodes ? esc(toPlain(nodes)) : "";
  };

  const plain: string[] = [];
  const body: string[] = [];

  /* ── En-tête ─────────────────────────────────────────────────────────── */

  const fullName = `${data.personal.firstName} ${data.personal.lastName}`.trim();
  const headline = t(data.personal.headline) ?? "";

  // Un élément de contact par segment, séparés par un point médian : chaque
  // information reste isolable à l'extraction.
  const contactParts: string[] = [];
  if (data.personal.email) contactParts.push(data.personal.email);
  if (data.personal.phone) contactParts.push(data.personal.phone);
  if (data.personal.location) {
    contactParts.push(formatPlace(data.personal.location, locale));
  }
  for (const link of data.personal.links) {
    contactParts.push(link.href.replace(/^https?:\/\/(www\.)?/, ""));
  }

  plain.push(fullName, headline, contactParts.join(" · "));

  /* ── Sections ────────────────────────────────────────────────────────── */

  // L'ordre suit celui du studio ; les intitulés, eux, restent standards
  // (voir `sectionTitle`) parce que ce format vise l'analyse automatisée.
  const resolved = resolveSections(data, presentation, locale, primary);
  const visible = new Map(resolved.map((section) => [section.key, section]));
  const order =
    options.sectionOrder ??
    resolved.filter((section) => section.kind !== "profile").map((section) => section.key);

  /**
   * Les surcharges de titres définies dans `Presentation` sont délibérément
   * ignorées ici. Un CV dont la section s'intitule « PROFIL » plutôt que
   * « Centres d'intérêt » perd du matching : ce format privilégie la
   * reconnaissance automatique sur la personnalisation. Les surcharges
   * s'appliquent aux rendus HTML et PDF, destinés à l'œil humain.
   */
  const sectionTitle = (_key: string, standard: string): string => esc(standard);

  const isVisible = (key: string): boolean => visible.get(key)?.visible !== false;

  for (const key of order) {
    if (!isVisible(key)) continue;

    switch (key) {
      case "summary": {
        const summary = rich(data.summary);
        if (!summary) break;
        body.push(`\\cvsection{${sectionTitle(key, labels.summary)}}`);
        body.push(`\\cvtext{${summary}}`);
        plain.push(labels.summary, toPlain(t(data.summary) ?? []));
        break;
      }

      case "experiences": {
        if (data.experiences.length === 0) break;
        body.push(`\\cvsection{${sectionTitle(key, labels.experiences)}}`);
        plain.push(labels.experiences);

        for (const entry of data.experiences) {
          const role = t(entry.role) ?? "";
          const contract = entry.contract ? CONTRACT_LABELS[locale][entry.contract] : "";
          const title = contract ? `${role} (${contract})` : role;
          const place = entry.location ? formatPlace(entry.location, locale) : "";
          const period = formatRange(entry.period, locale, "short");

          body.push(
            `\\cventry{${esc(title)}}{${esc(entry.organization)}}{${esc(place)}}{${esc(period)}}`,
          );
          plain.push(title, entry.organization, place, period);

          const summary = rich(entry.summary);
          if (summary) {
            body.push(`\\cvtext{${summary}}`);
            plain.push(toPlain(t(entry.summary) ?? []));
          }

          const bullets = t(entry.bullets) ?? [];
          if (bullets.length > 0) {
            body.push("\\begin{itemize}");
            for (const bullet of bullets) {
              const line = toPlain(bullet);
              body.push(`  \\item ${esc(line)}`);
              plain.push(line);
            }
            body.push("\\end{itemize}");
          }
        }
        break;
      }

      case "education": {
        if (data.education.length === 0) break;
        body.push(`\\cvsection{${sectionTitle(key, labels.education)}}`);
        plain.push(labels.education);

        for (const entry of data.education) {
          const degree = t(entry.degree) ?? "";
          const field = t(entry.field);
          const title = field ? `${degree} — ${field}` : degree;
          const place = entry.location ? formatPlace(entry.location, locale) : "";
          const period = formatRange(entry.period, locale, "year");

          body.push(
            `\\cventry{${esc(title)}}{${esc(entry.institution)}}{${esc(place)}}{${esc(period)}}`,
          );
          plain.push(title, entry.institution, place, period);

          const distinction = t(entry.distinction);
          if (distinction) {
            body.push(`\\cvtext{${esc(distinction)}}`);
            plain.push(distinction);
          }

          const bullets = t(entry.bullets) ?? [];
          if (bullets.length > 0) {
            body.push("\\begin{itemize}");
            for (const bullet of bullets) {
              const line = toPlain(bullet);
              body.push(`  \\item ${esc(line)}`);
              plain.push(line);
            }
            body.push("\\end{itemize}");
          }
        }
        break;
      }

      case "skills": {
        if (data.skills.length === 0) break;
        body.push(`\\cvsection{${sectionTitle(key, labels.skills)}}`);
        plain.push(labels.skills);

        for (const group of data.skills) {
          const name = t(group.name) ?? "";
          const list = group.skills.map((s) => t(s.name) ?? "").filter(Boolean);
          if (list.length === 0) continue;
          // Compétences en énumération simple : c'est le format qu'un analyseur
          // découpe correctement, contrairement aux barres de niveau graphiques.
          body.push(`\\cvline{${esc(name)}}{${esc(list.join(", "))}}`);
          plain.push(`${name} : ${list.join(", ")}`);
        }
        break;
      }

      case "languages": {
        if (data.languages.length === 0) break;
        body.push(`\\cvsection{${sectionTitle(key, labels.languages)}}`);
        plain.push(labels.languages);

        for (const entry of data.languages) {
          const name = t(entry.name) ?? "";
          const level = LEVEL_LABELS[locale][entry.level];
          const cert = entry.certification
            ? ` (${entry.certification.name}${entry.certification.score ? ` ${entry.certification.score}` : ""})`
            : "";
          body.push(`\\cvline{${esc(name)}}{${esc(level + cert)}}`);
          plain.push(`${name} : ${level}${cert}`);
        }
        break;
      }

      case "certifications": {
        if (data.certifications.length === 0) break;
        body.push(`\\cvsection{${sectionTitle(key, labels.certifications)}}`);
        plain.push(labels.certifications);

        for (const entry of data.certifications) {
          const name = t(entry.name) ?? "";
          const details: string[] = [];
          if (entry.issued) details.push(entry.issued.slice(0, 4));
          if (entry.credentialId) details.push(`${labels.credential} ${entry.credentialId}`);
          const suffix = details.length > 0 ? ` — ${details.join(", ")}` : "";
          const label = esc(name + suffix);
          const value = entry.url ? `\\href{${escapeUrl(entry.url)}}{${label}}` : label;
          body.push(`\\cvline{${esc(entry.issuer || name)}}{${entry.issuer ? value : esc(suffix.replace(/^ — /, ""))}}`);
          plain.push(`${entry.issuer} : ${name}${suffix}`);
        }
        break;
      }

      case "projects": {
        if (data.projects.length === 0) break;
        body.push(`\\cvsection{${sectionTitle(key, labels.projects)}}`);
        plain.push(labels.projects);

        for (const entry of data.projects) {
          const name = t(entry.name) ?? "";
          const role = t(entry.role) ?? "";
          const period = entry.period ? formatRange(entry.period, locale, "short") : "";
          body.push(`\\cventry{${esc(name)}}{${esc(role)}}{}{${esc(period)}}`);
          plain.push(name, role, period);

          const bullets = t(entry.bullets) ?? [];
          if (bullets.length > 0) {
            body.push("\\begin{itemize}");
            for (const bullet of bullets) {
              const line = toPlain(bullet);
              body.push(`  \\item ${esc(line)}`);
              plain.push(line);
            }
            body.push("\\end{itemize}");
          }
        }
        break;
      }

      case "interests": {
        if (data.interests.length === 0) break;
        body.push(`\\cvsection{${sectionTitle(key, labels.interests)}}`);
        plain.push(labels.interests);

        for (const entry of data.interests) {
          // L'icône est délibérément ignorée : elle vit dans `icon`, séparée du
          // libellé, donc l'omettre ne mutile pas le texte.
          const label = t(entry.label) ?? "";
          const text = rich(entry.text);
          body.push(`\\cvline{${esc(label)}}{${text}}`);
          plain.push(`${label} : ${toPlain(t(entry.text) ?? [])}`);
        }
        break;
      }

      default: {
        if (!key.startsWith("custom:")) break;
        const id = key.slice("custom:".length);
        const section = data.customSections.find((s) => s.id === id);
        if (!section || section.entries.length === 0) break;

        const title = t(section.title) ?? "";
        body.push(`\\cvsection{${esc(title)}}`);
        plain.push(title);

        for (const entry of section.entries) {
          const entryTitle = t(entry.title) ?? "";
          const subtitle = t(entry.subtitle) ?? "";
          const period = entry.period ? formatRange(entry.period, locale, "short") : "";
          body.push(`\\cventry{${esc(entryTitle)}}{${esc(subtitle)}}{}{${esc(period)}}`);
          plain.push(entryTitle, subtitle, period);
        }
        break;
      }
    }
  }

  /* ── Assemblage ──────────────────────────────────────────────────────── */

  const tex = `%% CV — ${esc(fullName)}
%% Généré automatiquement. Format linéaire, optimisé pour l'analyse automatisée.
%% Compilation : latexmk -lualatex cv.tex   (ou pdflatex cv.tex)

\\documentclass[${style.fontSize},a4paper]{article}
\\usepackage{cvstyle}

\\cvname{${esc(fullName)}}
\\cvheadline{${esc(headline)}}
\\cvcontact{${contactParts.map((p) => esc(p)).join(" \\textperiodcentered{} ")}}

\\begin{document}
\\cvheader

${body.join("\n")}

\\end{document}
`;

  const warnings: string[] = [];
  const summary = report.summary;
  if (summary) warnings.push(summary);
  if (data.personal.photo) {
    warnings.push(
      "La photo n'est pas incluse : ce format vise l'analyse automatisée, où une image n'apporte rien et perturbe l'extraction.",
    );
  }

  return {
    files: [
      { path: "cv.tex", content: tex },
      { path: "cvstyle.sty", content: buildStyleFile(style) },
      { path: "Makefile", content: MAKEFILE },
      { path: "LISEZMOI.txt", content: readme(locale) },
    ],
    warnings,
    plainText: plain.filter(Boolean).join("\n"),
  };
}

/**
 * « Lyon, France » plutôt que « Lyon, FR » : les analyseurs de CV rapprochent
 * les noms de pays, pas les codes ISO. `Intl.DisplayNames` est déterministe et
 * fourni par la plateforme — aucun dictionnaire à maintenir.
 */
function formatPlace(
  location: { city: string; region?: string; country?: string },
  locale: Locale,
): string {
  const country = location.country ? countryName(location.country, locale) : "";
  return [location.city, country].filter(Boolean).join(", ");
}

const displayNames = new Map<Locale, Intl.DisplayNames>();

function countryName(code: string, locale: Locale): string {
  let formatter = displayNames.get(locale);
  if (!formatter) {
    formatter = new Intl.DisplayNames([locale], { type: "region" });
    displayNames.set(locale, formatter);
  }
  return formatter.of(code) ?? code;
}

/** Dans une URL, seuls `%` et `#` doivent être protégés pour hyperref. */
function escapeUrl(url: string): string {
  return url.replace(/([%#\\])/g, "\\$1");
}

const MAKEFILE = `# Compilation du CV
# Nécessite une distribution TeX Live ou MacTeX.

all: cv.pdf

cv.pdf: cv.tex cvstyle.sty
\tlatexmk -lualatex -interaction=nonstopmode cv.tex

# Repli si LuaLaTeX est indisponible
pdflatex:
\tpdflatex -interaction=nonstopmode cv.tex

clean:
\tlatexmk -C
\trm -f cv.aux cv.log cv.out

.PHONY: all clean pdflatex
`;

function readme(locale: Locale): string {
  if (locale === "en") {
    return `CV — LaTeX source
=================

Files
  cv.tex        Content only. Edit this.
  cvstyle.sty   Layout and macros. Edit to restyle.
  Makefile      Build helper.

Build
  latexmk -lualatex cv.tex
  or: pdflatex cv.tex

This layout is deliberately plain: one column, no tables, no images, standard
section headings. It is meant to be read reliably by applicant tracking
systems. For a version designed for human readers, use the PDF export.
`;
  }

  return `CV — source LaTeX
=================

Fichiers
  cv.tex        Le contenu seul. C'est ce fichier que vous modifiez.
  cvstyle.sty   Mise en forme et macros. À modifier pour changer le style.
  Makefile      Raccourci de compilation.

Compilation
  latexmk -lualatex cv.tex
  ou : pdflatex cv.tex

Cette mise en page est volontairement dépouillée : une colonne, aucun tableau,
aucune image, intitulés de sections standards. Elle est conçue pour être lue
fidèlement par les logiciels de tri de candidatures. Pour une version destinée
à l'œil humain, utilisez l'export PDF.
`;
}
