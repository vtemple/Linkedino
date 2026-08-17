import { describe, expect, it } from "vitest";

import { parseLegacyBullets, parseLegacyHtml, toHtml, toPlain } from "../src/domain/cv/richtext";
import {
  compareRangesDesc,
  formatRange,
  parseDateToken,
  parseLegacyRange,
} from "../src/domain/cv/dates";
import {
  parseContactBlock,
  parseCredential,
  parseLanguageLevel,
  parseLocation,
  splitFullName,
  splitIcon,
  splitRoleAndContract,
  deterministicId,
} from "../src/lib/normalize/index";
import { escapeLatexVerbose } from "../src/lib/renderers/latex/escape";

/* ── Texte riche ───────────────────────────────────────────────────────── */

describe("richtext", () => {
  it("découpe le HTML de contenteditable en puces distinctes", () => {
    // Cas réel du prototype : experiences[1].desc.
    const input =
      "<div>Suivi quotidien des indicateurs.&nbsp;</div><div>Enquête : 72 % d'avis favorables.&nbsp;</div>";
    const blocks = parseLegacyHtml(input);

    expect(blocks).toHaveLength(2);
    expect(toPlain(blocks[0]!)).toBe("Suivi quotidien des indicateurs.");
    expect(toPlain(blocks[1]!)).toBe("Enquête : 72 % d'avis favorables.");
  });

  it("traite les retours à la ligne comme des frontières de puce", () => {
    const blocks = parseLegacyBullets("– Première ligne.\n– Deuxième ligne.");
    expect(blocks.map(toPlain)).toEqual(["Première ligne.", "Deuxième ligne."]);
  });

  it("conserve gras, italique et liens", () => {
    const blocks = parseLegacyHtml(
      '<div>Un <b>résultat</b> et <a href="https://exemple.fr">une source</a>.</div>',
    );
    expect(toHtml(blocks[0]!)).toBe(
      'Un <strong>résultat</strong> et <a href="https://exemple.fr" target="_blank" rel="noopener noreferrer">une source</a>.',
    );
  });

  it("écarte les href dangereux mais garde le texte", () => {
    const blocks = parseLegacyHtml('<div>Voir <a href="javascript:alert(1)">ici</a></div>');
    expect(toPlain(blocks[0]!)).toBe("Voir ici");
    expect(toHtml(blocks[0]!)).not.toContain("javascript");
  });

  it("ne perd jamais de texte sur une balise inconnue", () => {
    const blocks = parseLegacyHtml("<span class='x'>Texte conservé</span>");
    expect(toPlain(blocks[0]!)).toBe("Texte conservé");
  });

  it("échappe le HTML injecté", () => {
    const blocks = parseLegacyHtml("<div>a &lt;script&gt; b</div>");
    expect(toHtml(blocks[0]!)).toBe("a &lt;script&gt; b");
  });
});

/* ── Dates ─────────────────────────────────────────────────────────────── */

describe("dates", () => {
  it.each([
    ["Juin 2025", "2025-06"],
    ["Nov 2024", "2024-11"],
    ["Août 2022", "2022-08"],
    ["Déc 2020", "2020-12"],
    ["June 2025", "2025-06"],
    ["06/2025", "2025-06"],
    ["2020", "2020"],
  ])("interprète « %s »", (input, expected) => {
    expect(parseDateToken(input).iso).toBe(expected);
  });

  it("interprète une plage", () => {
    expect(parseLegacyRange("2025 – 2026")).toEqual({
      start: "2025",
      end: "2026",
      current: false,
    });
  });

  it("reconnaît une période en cours", () => {
    expect(parseLegacyRange("2023 – aujourd'hui")).toEqual({
      start: "2023",
      end: null,
      current: true,
    });
  });

  it("rend une date ponctuelle sans laisser croire à une période ouverte", () => {
    expect(parseLegacyRange("Juin 2025")).toEqual({
      start: "2025-06",
      end: "2025-06",
      current: false,
    });
  });

  it("ne confond pas le « a » d'un nom de mois avec un séparateur de plage", () => {
    // Régression : « Mar 2022 » se scindait en « M » / « r 2022 », et la période
    // devenait « année courante, en cours ».
    expect(parseLegacyRange("Mar 2022")).toEqual({
      start: "2022-03",
      end: "2022-03",
      current: false,
    });
    expect(parseLegacyRange("Apr 2022")?.start).toBe("2022-04");
    expect(parseLegacyRange("Août 2021")?.start).toBe("2021-08");
    // Le séparateur reste reconnu quand il est isolé.
    expect(parseLegacyRange("2020 a 2022")).toEqual({
      start: "2020",
      end: "2022",
      current: false,
    });
  });

  it("signale une date illisible plutôt que d'inventer", () => {
    expect(parseLegacyRange("Mois AAAA")).toBeNull();
  });

  it("formate sans dictionnaire maison", () => {
    const range = { start: "2024-11", end: "2025-01", current: false };
    expect(formatRange(range, "fr")).toBe("Novembre 2024 – Janvier 2025");
    expect(formatRange(range, "en")).toBe("November 2024 – January 2025");
  });

  it("trie en antichronologique, les postes en cours d'abord", () => {
    const ranges = [
      { start: "2020", end: "2022", current: false },
      { start: "2023", end: null, current: true },
      { start: "2022", end: "2023", current: false },
    ];
    const sorted = [...ranges].sort(compareRangesDesc);
    expect(sorted.map((r) => r.start)).toEqual(["2023", "2022", "2020"]);
  });
});

/* ── Normalisation ─────────────────────────────────────────────────────── */

describe("normalisation", () => {
  it("découpe le blob de contact du prototype", () => {
    const parsed = parseContactBlock(
      "📧 jean@exemple.fr\n📞 06 12 34 56 78\n📍 Lyon, France\n🔗 linkedin.com/in/jean",
    );

    expect(parsed.email).toBe("jean@exemple.fr");
    expect(parsed.phone).toBe("06 12 34 56 78");
    expect(parsed.location).toEqual({ city: "Lyon", country: "FR" });
    expect(parsed.links).toEqual([
      { kind: "linkedin", href: "https://linkedin.com/in/jean" },
    ]);
    expect(parsed.unrecognized).toHaveLength(0);
  });

  it("ne dépend pas de l'ordre des lignes de contact", () => {
    const a = parseContactBlock("📍 Lyon, France\n📧 jean@exemple.fr");
    const b = parseContactBlock("📧 jean@exemple.fr\n📍 Lyon, France");
    expect(a).toEqual(b);
  });

  it("sépare le pictogramme du libellé au lieu de le supprimer", () => {
    expect(splitIcon("🏃 Sports")).toEqual({ icon: "🏃", label: "Sports" });
    expect(splitIcon("Bénévolat")).toEqual({ label: "Bénévolat" });
  });

  it("préserve les caractères non latins hors pictogrammes", () => {
    expect(splitIcon("Λογιστική").label).toBe("Λογιστική");
  });

  it("extrait le niveau et la certification d'une langue", () => {
    expect(parseLanguageLevel("C1 — TOEIC 800/990", "x")).toEqual({
      level: "C1",
      certification: { name: "TOEIC", score: "800/990" },
    });
    expect(parseLanguageLevel("Natif", "x")).toEqual({ level: "native" });
  });

  it("signale un niveau de langue inconnu au lieu de deviner en silence", () => {
    const warnings: Array<{ code: string }> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseLanguageLevel("Bonnes bases", "languages[0]", warnings as any);
    expect(warnings[0]?.code).toBe("niveau_langue_inconnu");
  });

  it("extrait le type de contrat de l'intitulé de poste", () => {
    expect(splitRoleAndContract("Assistant Manager — Stage 2 mois")).toEqual({
      role: "Assistant Manager",
      contract: "stage",
      droppedSegment: "Stage 2 mois",
    });
    expect(splitRoleAndContract("Conseiller de Vente — CDD 5 mois").contract).toBe("cdd");
    expect(splitRoleAndContract("Développeur")).toEqual({ role: "Développeur" });
  });

  it("isole l'identifiant de certification", () => {
    expect(parseCredential("Identifiant P-DY6XKXG8")).toEqual({
      credentialId: "P-DY6XKXG8",
    });
    expect(parseCredential("Spécialisation Coursera")).toEqual({
      detail: "Spécialisation Coursera",
    });
  });

  it("rattache les particules au nom de famille", () => {
    expect(splitFullName("Jean de La Fontaine")).toEqual({
      firstName: "Jean",
      lastName: "de La Fontaine",
    });
    expect(splitFullName("Marie Curie")).toEqual({ firstName: "Marie", lastName: "Curie" });
  });

  it("signale un pays inconnu sans perdre l'information", () => {
    const warnings: Array<{ code: string; raw: string }> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const location = parseLocation("Springfield, Cambodge", "x", warnings as any);
    expect(location?.region).toBe("Cambodge");
    expect(warnings[0]?.code).toBe("pays_inconnu");
  });

  it("produit des identifiants stables entre deux exécutions", () => {
    expect(deterministicId("exp", "Alpha|Analyste|2024")).toBe(
      deterministicId("exp", "Alpha|Analyste|2024"),
    );
  });
});

/* ── Échappement LaTeX ─────────────────────────────────────────────────── */

describe("échappement LaTeX", () => {
  it("échappe les caractères réservés", () => {
    expect(escapeLatexVerbose("100 % & #tag_x").text).toBe("100 \\% \\& \\#tag\\_x");
  });

  it("translittère au lieu de supprimer", () => {
    const result = escapeLatexVerbose("20 k€ — voir « ici »");
    expect(result.text).toBe("20 k\\texteuro{} --- voir \\guillemotleft{} ici \\guillemotright{}");
    expect(result.dropped).toHaveLength(0);
  });

  it("préserve les accents, contrairement au prototype", () => {
    expect(escapeLatexVerbose("Métallurgie à Œuvre").text).toBe("Métallurgie à Œuvre");
  });

  it("signale les caractères retirés au lieu de les avaler", () => {
    const result = escapeLatexVerbose("Sports 🏃 et 🎵");
    expect(result.text).toBe("Sports et");
    expect(result.dropped).toEqual(["🏃", "🎵"]);
  });

  it("respecte l'espace fine française avant les deux-points", () => {
    expect(escapeLatexVerbose("Enquête : 72 %").text).toBe("Enquête\\,: 72 \\%");
  });
});
