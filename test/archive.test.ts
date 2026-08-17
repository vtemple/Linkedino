import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { parseCsv, parseCsvRows, readLinkedInArchive, ArchiveError } from "../src/lib/importers/linkedin/archive";
import { normalizeLinkedInProfile } from "../src/lib/importers/linkedin/normalizer";
import { toPlain } from "../src/domain/cv/richtext";

const POSITIONS_CSV = `Company Name,Title,Description,Location,Started On,Finished On
Société Alpha,Assistant Manager — Stage,"Suivi des indicateurs.
Enquête : 72 % d'avis favorables.",Lyon, France,Nov 2024,Jan 2025
Société Gamma,Conseiller de Vente — CDD,"CA journalier moyen 700 €.","Lyon, France",Oct 2022,Dec 2022
`;

describe("analyse CSV", () => {
  it("respecte les champs multilignes entre guillemets", () => {
    const rows = parseCsv(POSITIONS_CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.["Description"]).toContain("\n");
    expect(rows[0]?.["Description"]).toContain("72 %");
  });

  it("gère les guillemets échappés et le BOM", () => {
    const rows = parseCsvRows('\uFEFFa,b\n"il a dit ""oui""",2\n');
    expect(rows[1]?.[0]).toBe('il a dit "oui"');
  });

  it("saute une ligne de remarque avant l'en-tête", () => {
    const rows = parseCsv('Notes:,"Ce fichier contient..."\nName,Proficiency\nAnglais,Full professional proficiency\n');
    expect(rows[0]?.["Name"]).toBe("Anglais");
  });
});

describe("archive LinkedIn", () => {
  async function buildZip(files: Record<string, string>): Promise<Buffer> {
    const zip = new JSZip();
    for (const [name, content] of Object.entries(files)) zip.file(name, content);
    return zip.generateAsync({ type: "nodebuffer" });
  }

  it("mappe les fichiers vers les domaines et alimente le normaliseur commun", async () => {
    const buffer = await buildZip({
      "Profile.csv": "First Name,Last Name,Headline,Geo Location\nCamille,Dupont,Manager,\"Lyon, France\"\n",
      "Positions.csv": POSITIONS_CSV,
      "Languages.csv": "Name,Proficiency\nAnglais,Full professional proficiency\n",
      "Ad_Targeting.csv": "Ignoré\nx\n",
    });

    const report = await readLinkedInArchive(buffer);
    expect(report.matched.map((m) => m.domain).sort()).toEqual([
      "LANGUAGES",
      "POSITIONS",
      "PROFILE",
    ]);
    expect(report.ignored).toContain("Ad_Targeting.csv");

    // Le même normaliseur que l'API produit le même CVData.
    const { data } = normalizeLinkedInProfile(report.profile);
    expect(data.personal.firstName).toBe("Camille");
    expect(data.experiences).toHaveLength(2);
    expect(data.experiences.map((e) => e.contract)).toContain("cdd");
    expect(data.languages[0]?.level).toBe("C1");

    const bullets = data.experiences.find((e) => e.organization === "Société Alpha")?.bullets?.fr ?? [];
    expect(bullets.map(toPlain)).toEqual([
      "Suivi des indicateurs.",
      "Enquête : 72 % d'avis favorables.",
    ]);
  });

  it("reconnaît les noms de fichiers francisés", async () => {
    const buffer = await buildZip({
      "Competences.csv": "Name\nSQL\n",
      "Formation.csv": "School Name,Degree Name,Start Date,End Date\nLyon 2,Licence,2020,2023\n",
    });
    const report = await readLinkedInArchive(buffer);
    expect(report.matched.map((m) => m.domain).sort()).toEqual(["EDUCATION", "SKILLS"]);
  });

  it("refuse une archive sans fichier exploitable, avec un message actionnable", async () => {
    const buffer = await buildZip({ "Ads_Clicked.csv": "a\n1\n" });
    await expect(readLinkedInArchive(buffer)).rejects.toBeInstanceOf(ArchiveError);
    await expect(readLinkedInArchive(buffer)).rejects.toThrow(/Obtenir une copie/);
  });

  it("refuse un fichier qui n'est pas une archive", async () => {
    await expect(readLinkedInArchive(Buffer.from("pas un zip"))).rejects.toThrow(/archive ZIP/);
  });
});

describe("importeur PDF", () => {
  it("refuse un PDF qui n'est pas un profil LinkedIn", async () => {
    const { readLinkedInPdf, PdfImportError } = await import(
      "../src/lib/importers/linkedin/pdf"
    );
    // Un PDF minimal, sans aucune section LinkedIn.
    const minimal = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
        "trailer<</Root 1 0 R>>",
      "latin1",
    );
    await expect(readLinkedInPdf(minimal)).rejects.toBeInstanceOf(PdfImportError);
  });
});

