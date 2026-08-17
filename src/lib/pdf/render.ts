/**
 * Génération PDF par Chromium.
 *
 * Le prototype ouvrait une fenêtre et appelait `window.print()` : bloqué par
 * les bloqueurs de pop-ups, et le `addEventListener("load")` était attaché
 * après `document.close()`, donc l'événement pouvait déjà être passé — la
 * boîte d'impression ne s'ouvrait jamais.
 *
 * Ici le rendu est piloté côté serveur, avec attente explicite des polices.
 * Le binaire est résolu dans cet ordre :
 *   1. CHROMIUM_PATH (déploiement maîtrisé) ;
 *   2. @sparticuz/chromium (serverless : le binaire est dans le paquet npm) ;
 *   3. chemins système usuels.
 * Aucun de ces chemins n'est obligatoire au démarrage : l'absence de Chromium
 * dégrade cet export, elle n'empêche pas l'application de tourner.
 */

import { existsSync } from "node:fs";

export class PdfUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfUnavailableError";
  }
}

const SYSTEM_PATHS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export async function resolveExecutable(): Promise<string> {
  const fromEnv = process.env["CHROMIUM_PATH"];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  try {
    const mod = (await import("@sparticuz/chromium")) as {
      default?: { executablePath: () => Promise<string> };
      executablePath?: () => Promise<string>;
    };
    const resolver = mod.default?.executablePath ?? mod.executablePath;
    if (resolver) {
      const path = await resolver();
      if (path && existsSync(path)) return path;
    }
  } catch {
    /* paquet absent : on continue */
  }

  const system = SYSTEM_PATHS.find((path) => existsSync(path));
  if (system) return system;

  throw new PdfUnavailableError(
    "Aucun binaire Chromium trouvé. Définissez CHROMIUM_PATH ou installez `@sparticuz/chromium`.",
  );
}

export interface PdfOptions {
  timeoutMs?: number;
  /** Force le document sur une seule page en resserrant la mise en page. */
  fitOnePage?: boolean;
  /** Plancher de lisibilité : en dessous, on préfère deux pages. */
  minScale?: number;
}

export interface PdfRenderResult {
  pdf: Buffer;
  /** Facteur appliqué pour tenir sur une page. 1 = aucun ajustement. */
  scale: number;
  overflow: boolean;
}

/**
 * Navigateur maintenu chaud.
 *
 * Le démarrage de Chromium coûte une dizaine de secondes ; le rendu lui-même
 * en coûte moins de deux. On lance donc une seule instance, réutilisée d'un
 * export à l'autre, et on n'ouvre qu'un onglet par requête.
 */
let browserPromise: Promise<PuppeteerBrowser> | null = null;

async function getBrowser(): Promise<PuppeteerBrowser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.isConnected?.() !== false) return existing;
    } catch {
      /* instance perdue : on relance */
    }
    browserPromise = null;
  }

  const executablePath = await resolveExecutable();
  const puppeteer = (await import("puppeteer-core").catch(() => null)) as {
    launch: (opts: Record<string, unknown>) => Promise<PuppeteerBrowser>;
  } | null;

  if (!puppeteer) throw new PdfUnavailableError("`puppeteer-core` n'est pas installé.");

  browserPromise = puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      // Sans cela, le rendu des polices diffère d'une machine à l'autre.
      "--font-render-hinting=none",
    ],
  });

  return browserPromise;
}

/** Préchauffage : à appeler au démarrage pour que le premier export soit rapide. */
export async function warmUpPdf(): Promise<boolean> {
  try {
    await getBrowser();
    return true;
  } catch {
    return false;
  }
}

/** Dernier ajustement appliqué, exposé pour les en-têtes de réponse. */
let lastFit: { scale: number; overflow: boolean } = { scale: 1, overflow: false };

export function lastFitInfo(): { scale: number; overflow: boolean } {
  return lastFit;
}

/**
 * Ajuste la mise en page pour tenir sur une seule page A4.
 *
 * On mesure la hauteur réelle du document, puis on applique un facteur de zoom
 * CSS — qui reflowe le texte au lieu de l'écraser, contrairement à une
 * transformation d'échelle. Deux passes de correction suffisent : la première
 * estime le facteur, la seconde compense le reflow.
 *
 * Le plancher de lisibilité est explicite : sous 66 %, on préfère livrer deux
 * pages lisibles qu'une page illisible. Le caractère « obligatoirement une
 * page » cède devant l'illisibilité, et l'appelant en est informé.
 */
async function fitToOnePage(
  page: PuppeteerPage,
  minScale: number,
): Promise<{ scale: number; overflow: boolean }> {
  // La mesure doit se faire en média impression : les règles d'aperçu écran
  // imposent une feuille de 297 mm de haut, ce qui ferait croire à un
  // débordement même pour un CV d'une demi-page.
  await page.emulateMediaType("print");

  const result = (await page.evaluate(
    `(async () => {
      const MM = 96 / 25.4;
      // Hauteur imprimable : A4 moins les marges déclarées par @page.
      const target = (297 - 13 - 14) * MM;
      const root = document.documentElement;
      // On mesure la feuille elle-même, pas le body : celui-ci n'a pas de
      // hauteur propre en mise en page de grille et renvoyait une valeur
      // constante, ce qui neutralisait tout l'ajustement.
      const sheet = document.querySelector(".pg-sheet");
      const measure = () =>
        sheet ? sheet.getBoundingClientRect().height : root.scrollHeight;

      root.style.zoom = "1";
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const natural = measure();
      if (natural <= target + 1) return { scale: 1, overflow: false };

      let scale = 1;
      for (let pass = 0; pass < 3; pass += 1) {
        const height = measure();
        if (height <= target) break;
        // Marge de 1,5 % pour absorber les arrondis de pagination.
        scale = Math.max(${minScale}, scale * (target / height) * 0.985);
        root.style.zoom = String(scale);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }

      return { scale, overflow: measure() > target + 1 };
    })()`,
  )) as { scale: number; overflow: boolean };

  return result;
}

export interface FitMeasurement {
  available: true;
  /** Facteur nécessaire pour tenir sur une page. 1 = tient déjà. */
  scale: number;
  /** Vrai si le document déborde même au plancher de lisibilité. */
  overflow: boolean;
  /** Hauteur estimée en pages A4. */
  pages: number;
}

/**
 * Mesure sans générer de PDF.
 *
 * Réutilise `fitToOnePage`, donc le studio et l'export partagent strictement
 * le même verdict : impossible qu'un conseil annonce une page et que l'export
 * en produise deux.
 */
export async function measureFit(url: string, minScale = 0.66): Promise<FitMeasurement> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle0", timeout: 20_000 });
    await page.evaluate("document.fonts.ready");

    const natural = (await page.evaluate(
      `(() => {
        const sheet = document.querySelector(".pg-sheet");
        return sheet ? sheet.getBoundingClientRect().height : document.documentElement.scrollHeight;
      })()`,
    )) as number;

    const fit = await fitToOnePage(page, minScale);
    const target = (297 - 13 - 14) * (96 / 25.4);

    return {
      available: true,
      scale: fit.scale,
      overflow: fit.overflow,
      pages: Math.max(1, Number((natural / target).toFixed(2))),
    };
  } finally {
    await page.close();
  }
}

export async function renderPdf(url: string, options: PdfOptions = {}): Promise<Buffer> {
  const browser = await getBrowser();

  try {
    const page = await browser.newPage();
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: options.timeoutMs ?? 30_000,
    });

    // Une police encore en chargement décale toute la mise en page entre la
    // mesure et le rendu : on attend explicitement.
    await page.evaluate("document.fonts.ready");
    await page.waitForSelector("#print-ready", { timeout: 5_000 }).catch(() => null);

    const fit = options.fitOnePage === false ? { scale: 1, overflow: false } : await fitToOnePage(page, options.minScale ?? 0.66);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });

    await page.close();
    lastFit = fit;
    return Buffer.from(pdf);
  } catch (error) {
    // Une instance devenue inutilisable ne doit pas empoisonner les exports
    // suivants : on la met au rebut, la prochaine demande en relancera une.
    browserPromise = null;
    throw error;
  }
}

/* Surface minimale de puppeteer-core réellement utilisée, déclarée localement
   pour que le projet compile même sans la dépendance. */
interface PuppeteerBrowser {
  newPage(): Promise<PuppeteerPage>;
  close(): Promise<void>;
  isConnected?(): boolean;
}

interface PuppeteerPage {
  close(): Promise<void>;
  emulateMediaType(type: string): Promise<void>;
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  evaluate(script: string): Promise<unknown>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  pdf(options?: Record<string, unknown>): Promise<Uint8Array>;
}
