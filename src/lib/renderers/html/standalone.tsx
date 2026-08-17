/**
 * Export HTML autonome.
 *
 * Produit un `.html` unique qui contient sa CSS, son JavaScript et ses images.
 * Il s'ouvre depuis un disque, une clé USB ou une pièce jointe, sans serveur et
 * sans le SaaS. C'est l'inverse exact du prototype, dont le « fichier autonome »
 * pesait 7,5 Mo parce qu'il embarquait deux fois des PNG 2560×2560.
 *
 * Le markup vient du même composant `CVDuo` que la page publique, et le script
 * du même `screenRuntime()` : le fichier téléchargé est, au pixel près, ce que
 * l'utilisateur a vu.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server.edge";

import { CVDuo } from "../../../templates/duo/screen/CVDuo";
import { CVDuoPrint, printStyles } from "../../../templates/duo/print/CVDuoPrint";
import { screenStyles } from "../../../templates/duo/screen/styles";
import { screenRuntime } from "../../../templates/duo/screen/runtime";
import { duoTokens } from "../../../templates/duo/tokens";
import { toPlain } from "../../../domain/cv/richtext";
import { resolveLocalized } from "../../../domain/cv/schema";
import type { CVDocument, Locale } from "../../../domain/cv/types";

/**
 * Rendu en chaîne.
 *
 * On passe par `react-dom/server.edge` plutôt que par `react-dom/server` :
 * Next.js interdit ce dernier dans le graphe applicatif, et la variante edge
 * fonctionne aussi bien sous Node depuis que les Web Streams y sont natifs.
 */
async function renderToString(element: ReactElement): Promise<string> {
  const stream = await renderToReadableStream(element);
  await stream.allReady;

  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

/**
 * Intègre les polices au document.
 *
 * Trente kilo-octets pour trois graisses : le prix de l'autonomie totale. Sans
 * cela, le fichier téléchargé changerait d'apparence dès qu'il est ouvert hors
 * ligne, ce qui est précisément le cas d'usage d'un export autonome.
 */
async function inlineFonts(): Promise<string> {
  const weights = [400, 500, 600];
  const faces: string[] = [];

  for (const weight of weights) {
    try {
      const path = join(process.cwd(), "public", "fonts", `jost-latin-${weight}-normal.woff2`);
      const data = await readFile(path);
      faces.push(
        `@font-face{font-family:'Jost';font-style:normal;font-weight:${weight};` +
          `font-display:swap;src:url(data:font/woff2;base64,${data.toString("base64")}) format('woff2')}`,
      );
    } catch {
      // Police absente : la pile de repli prend le relais, sans casser l'export.
    }
  }

  return faces.join("");
}

/** Résout une URL d'asset en octets. Local en migration, R2 en production. */
export type AssetReader = (url: string) => Promise<{ body: Buffer; mime: string } | null>;

export interface StandaloneOptions {
  locale?: Locale;
  readAsset: AssetReader;
  /** Police distante. Désactivable pour un fichier strictement hors ligne. */
  webfont?: boolean;
}

export interface StandaloneResult {
  html: string;
  bytes: number;
  inlinedAssets: number;
}

export async function renderStandaloneHtml(
  doc: CVDocument,
  options: StandaloneOptions,
): Promise<StandaloneResult> {
  const locale = options.locale ?? doc.locales.primary;
  const density = duoTokens.density[doc.presentation.density];

  const markup = await renderToString(<CVDuo doc={doc} locale={locale} />);
  const { html: inlined, count } = await inlineAssets(markup, options.readAsset);

  const { personal, summary } = doc.data;
  const fullName = `${personal.firstName} ${personal.lastName}`.trim();
  const headline = resolveLocalized(personal.headline, locale, doc.locales.primary) ?? "";
  const summaryNodes = resolveLocalized(summary, locale, doc.locales.primary);
  const description = summaryNodes
    ? toPlain(summaryNodes).slice(0, 180)
    : [fullName, headline].filter(Boolean).join(" — ");

  // Les polices sont intégrées au fichier : il n'émet aucune requête réseau,
  // et son rendu est strictement identique à celui du serveur.
  const fontCss = options.webfont ? await inlineFonts() : "";

  const html = `<!DOCTYPE html>
<html lang="${locale}" data-theme="${doc.presentation.theme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeAttr(fullName)}${headline ? ` — ${escapeAttr(headline)}` : ""}</title>
<meta name="description" content="${escapeAttr(description)}">
<meta name="generator" content="CV SaaS — export autonome">
<meta property="og:type" content="profile">
<meta property="og:title" content="${escapeAttr(fullName)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta name="color-scheme" content="light dark">
<script type="application/ld+json">${jsonLd(doc, locale)}</script>
<style>${fontCss}${screenStyles(duoTokens, density)}</style>
</head>
<body>
${inlined}
<script>${screenRuntime()}</script>
</body>
</html>
`;

  return { html, bytes: Buffer.byteLength(html), inlinedAssets: count };
}

/**
 * Remplace chaque `src="/assets/…"` par une data URI.
 *
 * Seules les variantes réellement référencées par le markup sont lues : le
 * composant choisit déjà la plus petite taille adéquate, donc on n'embarque
 * jamais la version 1024 d'un logo affiché à 40 px.
 */
async function inlineAssets(
  markup: string,
  readAsset: AssetReader,
): Promise<{ html: string; count: number }> {
  const urls = new Set<string>();
  const re = /src="(\/assets\/[^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markup)) !== null) {
    if (match[1]) urls.add(match[1]);
  }

  const cache = new Map<string, string>();
  for (const url of urls) {
    const asset = await readAsset(url);
    if (!asset) continue;
    cache.set(url, `data:${asset.mime};base64,${asset.body.toString("base64")}`);
  }

  let html = markup;
  for (const [url, dataUri] of cache) {
    html = html.split(`src="${url}"`).join(`src="${dataUri}"`);
  }
  return { html, count: cache.size };
}

/** Données structurées : la page publique et le fichier exporté sont indexables. */
function jsonLd(doc: CVDocument, locale: Locale): string {
  const { personal } = doc.data;
  const payload = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: `${personal.firstName} ${personal.lastName}`.trim(),
    jobTitle: resolveLocalized(personal.headline, locale, doc.locales.primary),
    email: personal.email,
    address: personal.location
      ? { "@type": "PostalAddress", addressLocality: personal.location.city }
      : undefined,
    sameAs: personal.links.map((l) => l.href),
    alumniOf: doc.data.education.map((e) => ({
      "@type": "EducationalOrganization",
      name: e.institution,
    })),
    knowsLanguage: doc.data.languages.map((l) => ({
      "@type": "Language",
      name: resolveLocalized(l.name, locale, doc.locales.primary),
    })),
  };
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Variante impression autonome.
 *
 * Rend exactement la même page que celle visitée par Chromium pour produire le
 * PDF. Utile en revue de mise en page, et comme repli lorsque Chromium n'est
 * pas disponible : le navigateur de l'utilisateur sait imprimer en A4.
 */
export async function renderStandalonePrint(
  doc: CVDocument,
  options: StandaloneOptions,
): Promise<StandaloneResult> {
  const locale = options.locale ?? doc.locales.primary;
  const density = duoTokens.density[doc.presentation.density];

  const markup = await renderToString(<CVDuoPrint doc={doc} locale={locale} />);
  const { html: inlined, count } = await inlineAssets(markup, options.readAsset);

  const fullName = `${doc.data.personal.firstName} ${doc.data.personal.lastName}`.trim();
  const fontCss = options.webfont ? await inlineFonts() : "";

  const html = `<!DOCTYPE html>
<html lang="${locale}" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CV — ${escapeAttr(fullName)}</title>
<style>${fontCss}${printStyles(duoTokens, density)}</style>
<style>
/* Aperçu à l'écran : simule la feuille A4 et ses marges, pour juger la mise
   en page sans imprimer. Ces règles disparaissent à l'impression réelle. */
@media screen{
  body{background:#54565B;padding:24px 12px}
  .pg-sheet{
    width:210mm;min-height:297mm;margin:0 auto;padding:13mm;
    background:var(--bg);box-shadow:0 8px 40px rgba(0,0,0,.4);
  }
}
</style>
</head>
<body>
${inlined}
</body>
</html>
`;

  return { html, bytes: Buffer.byteLength(html), inlinedAssets: count };
}
