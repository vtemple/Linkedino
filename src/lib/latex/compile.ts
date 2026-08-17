/**
 * Compilation LaTeX → PDF, et vérification que rien ne s'est perdu en route.
 *
 * LaTeX devient un moteur interne : l'utilisateur télécharge un PDF, jamais un
 * `.tex`. Ce PDF vise l'analyse automatisée, donc son seul critère de qualité
 * est l'extraction — d'où le contrôle systématique après compilation.
 *
 * La validation compare le texte réellement extrait du PDF aux données de
 * `CVData`. Un rendu qui perd une organisation, une date ou un intitulé est
 * déclaré invalide : c'est une garantie mesurée, pas une promesse.
 */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { extractText, getDocumentProxy } from "unpdf";

import { formatDate } from "../../domain/cv/dates";
import { resolveLocalized } from "../../domain/cv/schema";
import type { CVDocument, Locale } from "../../domain/cv/types";
import { renderLatex, type LatexFile } from "../renderers/latex/render";
import type { StyleOptions } from "../renderers/latex/style";

const run = promisify(execFile);

export class LatexUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LatexUnavailableError";
  }
}

/* ── Compilation ───────────────────────────────────────────────────────── */

export interface CompileResult {
  pdf: Buffer;
  engine: string;
  /** Extrait du journal, utile au diagnostic sans exposer tout le bruit TeX. */
  log: string;
}

/**
 * Ordre des moteurs — pdflatex d'abord, et c'est un choix, pas un repli.
 *
 * LuaLaTeX exige `luaotfload` et des polices système ; sur une image Debian
 * minimale il échoue avec « module luaotfload-main not found », et le corriger
 * demande d'installer `texlive-luatex` puis de régénérer les formats. pdflatex
 * est présent dans toute installation TeX, y compris
 * `texlive-latex-base`.
 *
 * Le compromis habituel — pdflatex gère mal l'Unicode — ne s'applique pas ici :
 * avec `fontenc T1` et `inputenc utf8`, l'extraction du PDF restitue les
 * accents à l'identique, ce que vérifie la validation ATS après chaque
 * compilation. Pour un document d'une colonne en alphabet latin, LuaLaTeX
 * n'apporte rien qui justifie sa surface de déploiement.
 *
 * Il reste en second : si une installation le fournit et que pdflatex venait à
 * manquer, la compilation aboutit quand même.
 */
const ENGINES = ["pdflatex", "lualatex"] as const;

export async function compileLatex(files: LatexFile[]): Promise<CompileResult> {
  const dir = await mkdtemp(join(tmpdir(), "cv-tex-"));

  try {
    for (const file of files) {
      await writeFile(join(dir, file.path), file.content, "utf8");
    }

    let lastError = "";

    for (const engine of ENGINES) {
      try {
        // Deux passes : la première résout les références, la seconde stabilise
        // la pagination. `nonstopmode` évite qu'une erreur bloque le processus.
        for (let pass = 0; pass < 2; pass += 1) {
          await run(engine, ["-interaction=nonstopmode", "-halt-on-error", "cv.tex"], {
            cwd: dir,
            timeout: 60_000,
            maxBuffer: 8 * 1024 * 1024,
          });
        }

        const pdf = await readFile(join(dir, "cv.pdf"));
        const log = await readFile(join(dir, "cv.log"), "utf8").catch(() => "");
        return { pdf, engine, log: summariseLog(log) };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        // Un moteur absent n'est pas un échec de compilation : on passe au suivant.
        if (/ENOENT/.test(detail)) {
          lastError = `${engine} introuvable`;
          continue;
        }
        const log = await readFile(join(dir, "cv.log"), "utf8").catch(() => "");
        lastError = summariseLog(log) || detail.slice(0, 400);
      }
    }

    throw new LatexUnavailableError(
      `Compilation impossible. Dernier échec : ${lastError || "inconnu"}. ` +
        "Installez une distribution TeX (texlive-latex-recommended) ou téléchargez le PDF humain.",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Ne garde que les lignes utiles d'un journal LaTeX. */
function summariseLog(log: string): string {
  return log
    .split("\n")
    .filter((line) => /^(!|l\.\d+|LaTeX (Warning|Error)|Package .* Error)/.test(line))
    .slice(0, 12)
    .join("\n");
}

/* ── Validation ATS ────────────────────────────────────────────────────── */

export interface AtsCheck {
  label: string;
  expected: string;
  found: boolean;
  /** Une donnée essentielle absente invalide le rendu. */
  critical: boolean;
}

export interface AtsValidation {
  valid: boolean;
  checks: AtsCheck[];
  missing: AtsCheck[];
  /** Nombre de caractères réellement extraits : zéro = PDF sans couche texte. */
  extractedChars: number;
}

/**
 * Normalise avant comparaison : l'extraction PDF introduit des césures, des
 * espaces insécables et des ligatures que rien ne justifie de traiter comme
 * des différences de contenu.
 */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00a0\u202f\u2009]/g, " ")
    .replace(/[’']/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

export async function validateAtsPdf(
  pdf: Buffer,
  doc: CVDocument,
  locale?: Locale,
): Promise<AtsValidation> {
  const active = locale ?? doc.locales.primary;
  const primary = doc.locales.primary;

  const proxy = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(proxy, { mergePages: true });
  const haystack = normalise(String(text));

  const checks: AtsCheck[] = [];
  const add = (label: string, expected: string, critical: boolean): void => {
    const value = expected.trim();
    if (!value) return;
    checks.push({ label, expected: value, found: haystack.includes(normalise(value)), critical });
  };

  const { data } = doc;
  const t = <T,>(v: Parameters<typeof resolveLocalized<T>>[0]): T | undefined =>
    resolveLocalized(v, active, primary);

  add("Nom", `${data.personal.firstName} ${data.personal.lastName}`, true);
  if (data.personal.email) add("E-mail", data.personal.email, true);
  if (data.personal.phone) add("Téléphone", data.personal.phone, false);
  if (data.personal.location) add("Localisation", data.personal.location.city, false);

  for (const entry of data.experiences) {
    add(`Organisation — ${entry.organization}`, entry.organization, true);
    add(`Poste — ${entry.organization}`, t(entry.role) ?? "", true);
    // La date est vérifiée sur l'année : le format d'affichage varie, pas elle.
    add(`Date — ${entry.organization}`, formatDate(entry.period.start, active, "year"), true);
  }

  for (const entry of data.education) {
    add(`Établissement — ${entry.institution}`, entry.institution, true);
    add(`Diplôme — ${entry.institution}`, t(entry.degree) ?? "", false);
  }

  for (const group of data.skills) {
    for (const skill of group.skills) add(`Compétence — ${t(skill.name)}`, t(skill.name) ?? "", false);
  }

  for (const entry of data.languages) add(`Langue — ${t(entry.name)}`, t(entry.name) ?? "", false);

  for (const entry of data.certifications) {
    add(`Certification — ${t(entry.name)}`, t(entry.name) ?? "", false);
  }

  const missing = checks.filter((check) => !check.found);
  const criticalMissing = missing.filter((check) => check.critical);

  return {
    // Un PDF sans couche texte est inexploitable quoi qu'il contienne.
    valid: criticalMissing.length === 0 && haystack.length > 200,
    checks,
    missing,
    extractedChars: haystack.length,
  };
}

/* ── Pipeline complet ──────────────────────────────────────────────────── */

/**
 * Échelle de compacité.
 *
 * Un CV doit tenir sur une page. Plutôt qu'un facteur d'échelle continu — qui
 * finit par rendre le document illisible — on descend une échelle de réglages
 * typographiques choisis : d'abord les blancs, puis l'interligne, puis le corps.
 * Chaque cran reste un document composé, pas une photocopie réduite.
 */
const FIT_LADDER: StyleOptions[] = [
  { fontSize: "11pt", margin: 18, compact: false },
  { fontSize: "11pt", margin: 16, compact: true },
  { fontSize: "10pt", margin: 15, compact: true },
  { fontSize: "10pt", margin: 14, compact: true, leading: 0.95 },
  { fontSize: "10pt", margin: 12, compact: true, leading: 0.9 },
  { fontSize: "9pt", margin: 12, compact: true, leading: 0.9 },
  { fontSize: "9pt", margin: 10, compact: true, leading: 0.86 },
];

async function pageCount(pdf: Buffer): Promise<number> {
  const proxy = await getDocumentProxy(new Uint8Array(pdf));
  return proxy.numPages;
}

export interface AtsPdfResult {
  pdf: Buffer;
  engine: string;
  validation: AtsValidation;
  /** Cran de compacité retenu, et nombre de pages obtenu. */
  fit: { step: number; style: StyleOptions; pages: number; forcedOverflow: boolean };
}

/**
 * CVData → LaTeX → PDF → vérification d'extraction, en une page.
 *
 * On compile au cran le plus confortable, et on ne resserre que si le document
 * déborde. Un CV qui tient déjà sur une page n'est jamais compressé.
 */
export async function renderAtsPdf(doc: CVDocument, locale?: Locale): Promise<AtsPdfResult> {
  let last: { pdf: Buffer; engine: string; pages: number; step: number } | null = null;

  for (let step = 0; step < FIT_LADDER.length; step += 1) {
    const style = FIT_LADDER[step]!;
    const bundle = renderLatex(doc, { ...(locale ? { locale } : {}), style });
    const { pdf, engine } = await compileLatex(bundle.files);
    const pages = await pageCount(pdf);
    last = { pdf, engine, pages, step };

    if (pages <= 1) break;
  }

  if (!last) throw new LatexUnavailableError("Aucune compilation n'a abouti.");

  const validation = await validateAtsPdf(last.pdf, doc, locale);

  return {
    pdf: last.pdf,
    engine: last.engine,
    validation,
    fit: {
      step: last.step,
      style: FIT_LADDER[last.step]!,
      pages: last.pages,
      // Au dernier cran, un contenu très fourni peut encore déborder : mieux
      // vaut deux pages lisibles qu'une page illisible.
      forcedOverflow: last.pages > 1,
    },
  };
}
