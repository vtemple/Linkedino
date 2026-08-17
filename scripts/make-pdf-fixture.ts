/**
 * Génère la fixture PDF de test.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/make-pdf-fixture.ts
 *
 * Reproduit la mise en page du PDF de profil LinkedIn — deux colonnes, mêmes
 * tailles de police, mêmes conventions de dates et de repli de lignes — avec
 * des données entièrement inventées.
 *
 * Aucune donnée personnelle réelle ne figure ici ni dans la fixture produite.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveExecutable } from "../src/lib/pdf/render";

/* Personne fictive, générée pour les tests. Toute ressemblance serait fortuite. */
const HTML = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 14mm 12mm 10mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#000; }
  .sheet { display:grid; grid-template-columns: 168px 1fr; gap: 26px; }
  .side { font-size: 11px; line-height: 1.15; }
  .side h2 { font-size: 13px; font-weight: 700; margin: 14px 0 4px; }
  .side h2:first-child { margin-top: 0; }
  .side p { margin-bottom: 4px; }
  .main { font-size: 11px; line-height: 1.5; }
  .name { font-size: 26px; font-weight: 700; line-height: 1.1; }
  .headline, .place { font-size: 12px; }
  .main h2 { font-size: 16px; font-weight: 700; margin: 22px 0 8px; }
  .org, .school { font-size: 12px; font-weight: 700; margin-top: 14px; }
  .role { font-size: 12px; }
  .meta { font-size: 11px; }
  .desc { font-size: 11px; white-space: pre-line; }
  .degree { font-size: 11px; }
</style></head><body><div class="sheet">
  <aside class="side">
    <h2>Coordonnées</h2>
    <p>alix.moreau@exemple-test.fr</p>
    <p>www.linkedin.com/in/alix-moreau-fixture</p>
    <p>(LinkedIn)</p>
    <h2>Principales compétences</h2>
    <p>Gestion de projet</p>
    <p>Analyse de données</p>
    <p>Négociation</p>
    <h2>Languages</h2>
    <p>Français (Bilingue ou langue maternelle)</p>
    <p>Anglais (Capacité professionnelle complète)</p>
    <h2>Certifications</h2>
    <p>Pilotage de la performance</p>
    <p>Habilitation sécurité niveau 2 (module</p>
    <p>avancé)</p>
    <p>Certificat de gestion budgétaire</p>
    <p>842/1000</p>
  </aside>
  <main class="main">
    <p class="name">Alix Moreau</p>
    <p class="headline">Responsable de projets — données fictives</p>
    <p class="place">Bordeaux, Nouvelle-Aquitaine, France</p>

    <h2>Résumé</h2>
    <p class="desc">Profil de test généré pour valider l'importeur.
Il reproduit un paragraphe replié sur plusieurs lignes comme le fait
LinkedIn, afin de vérifier le recollage.</p>

    <h2>Expérience</h2>
    <p class="org">Société Alpha</p>
    <p class="role">Responsable de projets</p>
    <p class="meta">mars 2022 - Present (3 ans 5 mois)</p>
    <p class="meta">Bordeaux, Nouvelle-Aquitaine, France</p>
    <p class="desc">- Coordination de quatre équipes internes.
- Réduction du délai de livraison de 22 %.</p>

    <p class="org">Société Bêta</p>
    <p class="role">Chargé d'études</p>
    <p class="meta">septembre 2019 - février 2022 (2 ans 6 mois)</p>
    <p class="meta">Nantes</p>
    <p class="desc">- Construction d'un tableau de bord mensuel.</p>

    <p class="org">Société Gamma</p>
    <p class="role">Stagiaire analyste</p>
    <p class="meta">juin 2019 - juin 2019 (1 mois)</p>

    <h2>Formation</h2>
    <p class="school">Institut Fictif des Sciences</p>
    <p class="degree">Master, Gestion et stratégie · (septembre 2017 - juin 2019)</p>
    <p class="school">Lycée Imaginaire</p>
    <p class="degree">Baccalauréat, série générale · (juin
2016)</p>
  </main>
</div></body></html>`;

async function main(): Promise<void> {
  const executablePath = await resolveExecutable();
  const puppeteer = await import("puppeteer-core");

  const browser = await puppeteer.default.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(HTML, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: false });

    const target = join(process.cwd(), "test", "fixtures", "linkedin-profile-synthetic.pdf");
    await writeFile(target, Buffer.from(pdf));
    console.log(`Fixture écrite : ${target} (${(pdf.length / 1024).toFixed(1)} Ko)`);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
