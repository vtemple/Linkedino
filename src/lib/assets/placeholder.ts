/**
 * Asset de test.
 *
 * Le jeu de démonstration ne doit contenir aucune photographie de personne
 * réelle : ni celle d'un utilisateur, ni une image trouvée ailleurs. On génère
 * donc un visuel neutre, explicitement marqué comme fictif, à partir des
 * initiales du profil de test.
 *
 * Il traverse le même pipeline d'assets que n'importe quelle image téléversée
 * — redimensionnement, variantes WebP et PNG, déduplication par hachage.
 */

import sharp from "sharp";

import { processImage, type AssetStore } from "./pipeline";
import type { AssetRef } from "../../domain/cv/types";

export const PLACEHOLDER_MARKER = "profil-fictif";

function svg(initials: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1B1F26"/>
      <stop offset="1" stop-color="#0E1013"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="rgba(227,172,99,.07)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="800" height="1000" fill="url(#g)"/>
  <rect width="800" height="1000" fill="url(#grid)"/>
  <circle cx="400" cy="420" r="150" fill="none" stroke="rgba(227,172,99,.35)" stroke-width="2"/>
  <text x="400" y="470" font-family="Futura, 'Century Gothic', system-ui, sans-serif"
        font-size="120" font-weight="600" fill="#E3AC63" text-anchor="middle"
        letter-spacing="6">${initials}</text>
  <text x="400" y="700" font-family="system-ui, sans-serif" font-size="26"
        fill="rgba(236,237,239,.45)" text-anchor="middle" letter-spacing="8">
    PROFIL FICTIF
  </text>
  <text x="400" y="742" font-family="system-ui, sans-serif" font-size="20"
        fill="rgba(236,237,239,.28)" text-anchor="middle" letter-spacing="3">
    donnée de test — aucune personne réelle
  </text>
</svg>`;
}

/** Produit l'asset de test et l'enregistre via le pipeline standard. */
export async function createPlaceholderPhoto(
  store: AssetStore,
  initials = "PN",
): Promise<AssetRef> {
  const png = await sharp(Buffer.from(svg(initials.slice(0, 2).toUpperCase())))
    .png()
    .toBuffer();

  const result = await processImage(png, store, {
    role: "photo",
    path: "personal.photo (placeholder)",
  });

  return {
    ...result.asset,
    alt: { fr: "Photo fictive — donnée de test", en: "Fictional photo — test data" },
  };
}
