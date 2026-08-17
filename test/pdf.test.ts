import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { readLinkedInPdf, PdfImportError, type PdfReport } from "../src/lib/importers/linkedin/pdf";
import { normalizeLinkedInProfile } from "../src/lib/importers/linkedin/normalizer";
import { toPlain } from "../src/domain/cv/richtext";
import type { CVData } from "../src/domain/cv/types";

/**
 * Fixture synthétique — voir `scripts/make-pdf-fixture.ts`.
 * Elle reproduit la mise en page du PDF LinkedIn (deux colonnes, mêmes tailles
 * de police, mêmes conventions de dates) avec des données inventées.
 */
const FIXTURE = fileURLToPath(new URL("./fixtures/linkedin-profile-synthetic.pdf", import.meta.url));

let report: PdfReport;
let data: CVData;

beforeAll(async () => {
  report = await readLinkedInPdf(await readFile(FIXTURE));
  data = normalizeLinkedInProfile(report.profile).data;
});

describe("extraction du PDF LinkedIn", () => {
  it("sépare les deux colonnes de la mise en page", () => {
    // Sans séparation par abscisse, la barre latérale se colle au résumé et
    // produit des lignes du type « GestionProfil de test généré… ».
    const summary = toPlain(data.summary?.fr ?? []);
    expect(summary).toContain("Profil de test");
    expect(summary).not.toContain("Gestion de projet");
    expect(summary).not.toContain("Coordonnées");
  });

  it("détecte les sections des deux colonnes", () => {
    expect(report.sectionsFound).toEqual(
      expect.arrayContaining(["Coordonnées", "Certifications", "Résumé", "Expérience", "Formation"]),
    );
  });

  it("n'abandonne aucune ligne", () => {
    expect(report.unassigned).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });

  it("extrait l'identité et les coordonnées", () => {
    expect(data.personal.firstName).toBe("Alix");
    expect(data.personal.lastName).toBe("Moreau");
    expect(data.personal.headline?.fr).toContain("Responsable de projets");
    expect(data.personal.email).toBe("alix.moreau@exemple-test.fr");
    expect(data.personal.location).toEqual({
      city: "Bordeaux",
      region: "Nouvelle-Aquitaine",
      country: "FR",
    });
  });

  it("recolle une URL coupée en fin de ligne", () => {
    const linkedin = data.personal.links.find((link) => link.kind === "linkedin");
    expect(linkedin?.href).toBe("https://www.linkedin.com/in/alix-moreau-fixture");
  });

  it("extrait les expériences avec organisation, poste, période et lieu", () => {
    expect(data.experiences).toHaveLength(3);

    const first = data.experiences[0];
    expect(first?.organization).toBe("Société Alpha");
    expect(first?.role.fr).toBe("Responsable de projets");
    expect(first?.period).toEqual({ start: "2022-03", end: null, current: true });
    expect(first?.location?.city).toBe("Bordeaux");
    expect((first?.bullets?.fr ?? []).map(toPlain)).toEqual([
      "Coordination de quatre équipes internes.",
      "Réduction du délai de livraison de 22 %.",
    ]);
  });

  it("gère une expérience d'un seul mois", () => {
    const gamma = data.experiences.find((entry) => entry.organization === "Société Gamma");
    expect(gamma?.period).toEqual({ start: "2019-06", end: "2019-06", current: false });
  });

  it("trie les expériences en antichronologique", () => {
    expect(data.experiences.map((entry) => entry.organization)).toEqual([
      "Société Alpha",
      "Société Bêta",
      "Société Gamma",
    ]);
  });

  it("extrait les formations, y compris une date repliée sur deux lignes", () => {
    expect(data.education).toHaveLength(2);
    const master = data.education[0];
    expect(master?.institution).toBe("Institut Fictif des Sciences");
    expect(master?.degree.fr).toBe("Master, Gestion et stratégie");
    expect(master?.period).toEqual({ start: "2017-09", end: "2019-06", current: false });

    // « Baccalauréat, série générale · (juin\n2016) » : la parenthèse est coupée.
    const bac = data.education[1];
    expect(bac?.period.start).toBe("2016-06");
    expect(bac?.degree.fr).toBe("Baccalauréat, série générale");
  });

  it("extrait compétences et langues de la barre latérale", () => {
    expect(data.skills[0]?.skills.map((skill) => skill.name.fr)).toEqual([
      "Gestion de projet",
      "Analyse de données",
      "Négociation",
    ]);
    expect(data.languages.map((lang) => [lang.name.fr, lang.level])).toEqual([
      ["Français", "native"],
      ["Anglais", "C1"],
    ]);
  });

  it("recolle les certifications repliées sur plusieurs lignes", () => {
    const names = data.certifications.map((cert) => cert.name.fr);
    expect(names).toContain("Habilitation sécurité niveau 2 (module avancé)");
    expect(names).toContain("Certificat de gestion budgétaire 842/1000");
    expect(names).toHaveLength(3);
  });

  it("refuse un PDF qui n'est pas un profil LinkedIn", async () => {
    const minimal = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>",
      "latin1",
    );
    await expect(readLinkedInPdf(minimal)).rejects.toBeInstanceOf(PdfImportError);
  });

  it("est déterministe", async () => {
    const again = await readLinkedInPdf(await readFile(FIXTURE));
    expect(again.profile.sections).toEqual(report.profile.sections);
  });
});
