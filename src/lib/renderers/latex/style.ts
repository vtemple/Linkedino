/**
 * `cvstyle.sty` — préambule et macros.
 *
 * Reprend les bons choix du prototype (`geometry`, `microtype`, `enumitem`,
 * `emergencystretch`, `pagestyle{empty}`) et les sépare du contenu : le
 * `cv.tex` livré ne contient plus que des appels sémantiques, lisibles et
 * modifiables sans rien connaître du préambule.
 *
 * Objectif de ce format : lisibilité machine. Une seule colonne, aucune boîte,
 * aucun tableau, aucun pictogramme, titres de sections standards. Les parseurs
 * ATS lisent le flux de texte dans l'ordre — c'est exactement ce qu'on produit.
 */

export interface StyleOptions {
  /** Taille de base. 10.5 pt tient une page de plus sans nuire à la lisibilité. */
  fontSize: "9pt" | "10pt" | "11pt";
  /** Marge en millimètres. */
  margin: number;
  /** Interligne des puces. */
  compact: boolean;
  /** Facteur d'interligne global. Sous 1, le texte se resserre sans rapetisser. */
  leading?: number;
}

export const DEFAULT_STYLE: StyleOptions = {
  fontSize: "11pt",
  margin: 18,
  compact: false,
};

export function buildStyleFile(options: StyleOptions = DEFAULT_STYLE): string {
  const itemSep = options.compact ? "0.6pt" : "2pt";
  const sectionSkip = options.compact ? "5pt" : "9pt";
  const entrySkip = options.compact ? "4pt" : "7pt";
  const leading = options.leading ?? 1;

  return `%% cvstyle.sty — mise en forme du CV
%% Généré automatiquement. Modifiable : rien ici ne dépend du contenu.
%%
%% Compatible pdfLaTeX, XeLaTeX et LuaLaTeX.
%% Compilation recommandée : latexmk -lualatex cv.tex

\\NeedsTeXFormat{LaTeX2e}
\\ProvidesPackage{cvstyle}[2026/01/01 CV linéaire optimisé ATS]

\\RequirePackage{iftex}
\\ifPDFTeX
  \\RequirePackage[T1]{fontenc}
  \\RequirePackage[utf8]{inputenc}
  \\RequirePackage{helvet}
  \\renewcommand{\\familydefault}{\\sfdefault}
\\else
  \\RequirePackage{fontspec}
  %% TeX Gyre Heros est présent dans toute distribution TeX Live et s'extrait
  %% proprement : c'est ce qui compte pour un document destiné à être parsé.
  \\setmainfont{TeX Gyre Heros}
\\fi

\\RequirePackage[a4paper,margin=${options.margin}mm]{geometry}
\\RequirePackage{enumitem}
\\RequirePackage{microtype}
\\RequirePackage[hidelinks]{hyperref}
\\RequirePackage{xcolor}

%% Aucune couleur d'accent : le contraste porte l'information, pas la teinte.
\\definecolor{cvrule}{gray}{0.55}

\\linespread{${leading.toFixed(3)}}\\selectfont
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0pt}
\\setlength{\\emergencystretch}{3em}
\\pagestyle{empty}
\\raggedright

%% Puce « - » plutôt que « • » : c'est le caractère que les analyseurs de CV
%% reconnaissent le plus fidèlement à l'extraction du texte.
\\setlist[itemize]{
  nosep,
  topsep=1pt,
  partopsep=0pt,
  itemsep=${itemSep},
  leftmargin=1.1em,
  label={-}
}

%% ─── En-tête ────────────────────────────────────────────────────────────
\\newcommand{\\cvname}[1]{\\def\\@cvname{#1}}
\\newcommand{\\cvheadline}[1]{\\def\\@cvheadline{#1}}
\\newcommand{\\cvcontact}[1]{\\def\\@cvcontact{#1}}
\\def\\@cvname{}
\\def\\@cvheadline{}
\\def\\@cvcontact{}

\\newcommand{\\cvheader}{%
  {\\fontsize{20pt}{23pt}\\selectfont\\bfseries \\@cvname\\par}%
  \\ifx\\@cvheadline\\empty\\else\\vspace{2pt}{\\fontsize{10.5pt}{13pt}\\selectfont \\@cvheadline\\par}\\fi%
  \\ifx\\@cvcontact\\empty\\else\\vspace{3pt}{\\small \\@cvcontact\\par}\\fi%
  \\vspace{4pt}%
  {\\color{cvrule}\\hrule height 0.6pt}%
  \\vspace{${sectionSkip}}%
}

%% ─── Sections ───────────────────────────────────────────────────────────
%% Intitulés standards, en capitales, sans numérotation ni pictogramme.
\\newcommand{\\cvsection}[1]{%
  \\vspace{${sectionSkip}}%
  {\\normalsize\\bfseries\\MakeUppercase{#1}\\par}%
  \\vspace{1.5pt}%
  {\\color{cvrule}\\hrule height 0.4pt}%
  \\vspace{4pt}%
}

%% ─── Entrées ────────────────────────────────────────────────────────────
%% \\cventry{intitulé}{organisation}{lieu}{période}
%% L'intitulé précède l'organisation : c'est l'ordre attendu par la plupart
%% des analyseurs, et celui que lit un recruteur qui parcourt la page.
\\newcommand{\\cventry}[4]{%
  \\vspace{${entrySkip}}%
  {\\bfseries #1\\par}%
  {\\small #2%
    \\ifx\\relax#3\\relax\\else{} --- #3\\fi%
    \\ifx\\relax#4\\relax\\else\\hfill #4\\fi
    \\par}%
  \\vspace{2pt}%
}

%% \\cvline{libellé}{valeur} — compétences, langues, certifications
\\newcommand{\\cvline}[2]{%
  {\\bfseries #1}\\ifx\\relax#2\\relax\\else{} : #2\\fi\\par
  \\vspace{1.5pt}%
}

%% Paragraphe libre (résumé, description d'entrée)
\\newcommand{\\cvtext}[1]{#1\\par\\vspace{2pt}}

\\endinput
`;
}
