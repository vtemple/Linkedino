/**
 * Génère les trois formats depuis un CVDocument stocké.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/export-all.ts <id> [dossier]
 *
 * Exécute exactement le même code que les routes d'export du SaaS : ce script
 * sert de vérification bout en bout hors HTTP, et de point d'entrée pour une
 * génération en lot ou en intégration continue.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { repository, readLocalAsset } from "../src/lib/storage/repo";
import { renderStandaloneHtml, renderStandalonePrint } from "../src/lib/renderers/html/standalone";
import { renderLatex } from "../src/lib/renderers/latex/render";
import { toPlain } from "../src/domain/cv/richtext";

async function main(): Promise<void> {
  const [id, output = "out/export"] = process.argv.slice(2);
  if (!id) {
    console.error("Usage : tsx scripts/export-all.ts <id> [dossier]");
    process.exit(1);
  }

  const doc = await repository.get(id);
  if (!doc) {
    console.error(`CV « ${id} » introuvable.`);
    process.exit(1);
  }

  const dir = resolve(output);
  await mkdir(join(dir, "latex"), { recursive: true });

  const name = `${doc.data.personal.firstName} ${doc.data.personal.lastName}`.trim();
  console.log(`CV : ${name} — révision ${doc.meta.revision}\n`);

  /* HTML autonome */
  const html = await renderStandaloneHtml(doc, { readAsset: readLocalAsset, webfont: true });
  await writeFile(join(dir, "cv.html"), html.html, "utf8");
  console.log(`HTML autonome   ${(html.bytes / 1024).toFixed(1)} Ko`);
  console.log(`                ${html.inlinedAssets} images intégrées en data URI`);
  console.log(`                aucune requête réseau requise pour l'affichage`);

  /* LaTeX */
  const latex = renderLatex(doc);
  for (const file of latex.files) {
    await writeFile(join(dir, "latex", file.path), file.content, "utf8");
  }
  const tex = latex.files.find((f) => f.path === "cv.tex")?.content ?? "";
  console.log(`\nLaTeX           ${latex.files.length} fichiers, cv.tex ${(tex.length / 1024).toFixed(1)} Ko`);
  for (const warning of latex.warnings) console.log(`                ⚠ ${warning}`);

  /* Contrôle d'extraction : le texte du LaTeX doit couvrir celui du CVData. */
  const missing = expectedStrings(doc).filter((needle) => !latex.plainText.includes(needle));
  console.log(
    missing.length === 0
      ? `                extraction vérifiée : ${expectedStrings(doc).length} éléments présents`
      : `                ✗ absents de l'extraction : ${missing.join(", ")}`,
  );

  /* PDF — la même page que celle visitée par Chromium, écrite sur disque
     pour pouvoir contrôler la mise en page A4 sans lancer de navigateur. */
  const print = await renderStandalonePrint(doc, { readAsset: readLocalAsset, webfont: true });
  await writeFile(join(dir, "cv-print.html"), print.html, "utf8");
  console.log(`\nPDF (mise en page A4)  ${(print.bytes / 1024).toFixed(1)} Ko — cv-print.html`);
  console.log(`                imprimable directement (Ctrl+P → A4, marges gérées par @page)`);
  console.log(`                route de rendu : /render/print/${id}`);
  console.log(`                généré par Chromium via /api/cv/${id}/export/pdf`);

  console.log(`\nFichiers écrits dans ${dir}`);
}

/** Éléments qu'un analyseur doit retrouver dans le texte extrait. */
function expectedStrings(doc: Awaited<ReturnType<typeof repository.get>>): string[] {
  if (!doc) return [];
  const out: string[] = [
    `${doc.data.personal.firstName} ${doc.data.personal.lastName}`.trim(),
  ];
  if (doc.data.personal.email) out.push(doc.data.personal.email);
  for (const xp of doc.data.experiences) out.push(xp.organization);
  for (const edu of doc.data.education) out.push(edu.institution);
  for (const cert of doc.data.certifications) out.push(cert.issuer);
  void toPlain;
  return out;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
