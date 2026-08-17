import { describe, expect, it } from "vitest";

import { CVDocumentSchema, type CVDocument } from "../src/domain/cv/schema";
import { defaultSectionConfig } from "../src/domain/cv/sections";
import { fromPlain } from "../src/domain/cv/richtext";
import { renderLatex } from "../src/lib/renderers/latex/render";
import type { CVData } from "../src/domain/cv/types";

/**
 * Profils fictifs de trois tailles.
 *
 * Un CV court, un CV moyen et un CV très long : ce sont les trois régimes où
 * la pagination, la répartition en colonnes et l'extraction se comportent
 * différemment. Toutes les données sont inventées.
 */

const NOW = "2026-01-01T00:00:00.000Z";

function makeDocument(data: CVData): CVDocument {
  return CVDocumentSchema.parse({
    schemaVersion: 1,
    id: "cv_test",
    locales: { primary: "fr", available: ["fr"] },
    data,
    presentation: {
      templateId: "duo",
      theme: "dark",
      density: "normal",
      palette: "amber",
      fontPair: "editorial",
      sections: defaultSectionConfig(),
    },
    meta: { createdAt: NOW, updatedAt: NOW, revision: 0 },
  });
}

function experience(index: number, bullets: number) {
  return {
    id: `exp_${index}`,
    provenance: "user" as const,
    organization: `Organisation ${index}`,
    logo: null,
    role: { fr: `Poste numéro ${index}` },
    location: { city: "Ville", country: "FR" },
    period: {
      start: `${2008 + (index % 15)}-03`,
      end: `${2009 + (index % 15)}-06`,
      current: false,
    },
    bullets: {
      fr: Array.from({ length: bullets }, (_, i) =>
        fromPlain(`Réalisation ${i + 1} de la mission ${index}, mesurée et vérifiable.`),
      ),
    },
  };
}

function education(index: number) {
  return {
    id: `edu_${index}`,
    provenance: "user" as const,
    institution: `Établissement ${index}`,
    logo: null,
    degree: { fr: `Diplôme ${index}, spécialité fictive` },
    period: { start: `${2005 + index}`, end: `${2007 + index}`, current: false },
  };
}

/** Le strict minimum : un nom, un poste. */
const SHORT: CVData = {
  personal: { firstName: "Alex", lastName: "Petit", photo: null, links: [] },
  experiences: [experience(1, 1)],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  projects: [],
  interests: [],
  customSections: [],
};

const MEDIUM: CVData = {
  personal: {
    firstName: "Camille",
    lastName: "Moyen",
    headline: { fr: "Chargée de projets" },
    email: "camille@exemple-test.fr",
    location: { city: "Nantes", country: "FR" },
    photo: null,
    links: [],
  },
  summary: { fr: fromPlain("Résumé fictif de longueur moyenne pour le contrôle de rendu.") },
  experiences: [experience(1, 3), experience(2, 2), experience(3, 3)],
  education: [education(1), education(2)],
  skills: [
    {
      id: "grp_1",
      provenance: "user",
      name: { fr: "Compétences" },
      skills: ["Analyse", "Pilotage", "Négociation"].map((name, i) => ({
        id: `skl_${i}`,
        provenance: "user" as const,
        name: { fr: name },
      })),
    },
  ],
  languages: [
    { id: "lng_1", provenance: "user", name: { fr: "Français" }, level: "native" },
    { id: "lng_2", provenance: "user", name: { fr: "Anglais" }, level: "C1" },
  ],
  certifications: [
    {
      id: "crt_1",
      provenance: "user",
      issuer: "Organisme Test",
      name: { fr: "Certification fictive" },
      logo: null,
      expires: null,
    },
  ],
  projects: [],
  interests: [{ id: "int_1", provenance: "user", label: { fr: "Sport" } }],
  customSections: [],
};

/** Volontairement excessif : 14 expériences, 6 formations, 40 compétences. */
const LONG: CVData = {
  ...MEDIUM,
  personal: { ...MEDIUM.personal, firstName: "Dominique", lastName: "Long" },
  experiences: Array.from({ length: 14 }, (_, i) => experience(i + 1, 4)),
  education: Array.from({ length: 6 }, (_, i) => education(i + 1)),
  skills: [
    {
      id: "grp_1",
      provenance: "user",
      name: { fr: "Compétences" },
      skills: Array.from({ length: 40 }, (_, i) => ({
        id: `skl_${i}`,
        provenance: "user" as const,
        name: { fr: `Compétence ${i + 1}` },
      })),
    },
  ],
  certifications: Array.from({ length: 12 }, (_, i) => ({
    id: `crt_${i}`,
    provenance: "user" as const,
    issuer: `Organisme ${i}`,
    name: { fr: `Certification ${i + 1}` },
    logo: null,
    expires: null,
  })),
  customSections: [
    {
      id: "cus_1",
      provenance: "user",
      title: { fr: "Publications" },
      entries: Array.from({ length: 4 }, (_, i) => ({
        id: `ce_${i}`,
        provenance: "user" as const,
        title: { fr: `Publication ${i + 1}` },
      })),
    },
  ],
};

const PROFILES: Array<[string, CVData, number]> = [
  ["court", SHORT, 1],
  ["moyen", MEDIUM, 3],
  ["long", LONG, 14],
];

describe.each(PROFILES)("profil %s", (name, data, experienceCount) => {
  const doc = makeDocument(data);

  it("produit un document valide", () => {
    expect(doc.data.experiences).toHaveLength(experienceCount);
  });

  it("génère un LaTeX complet et échappé", () => {
    const bundle = renderLatex(doc);
    const tex = bundle.files.find((file) => file.path === "cv.tex")?.content ?? "";

    expect(tex).toContain("\\begin{document}");
    expect(tex).toContain("\\end{document}");
    expect(tex).toContain(data.personal.lastName);

    // Toutes les organisations doivent apparaître, quelle que soit la taille.
    for (const entry of data.experiences) expect(tex).toContain(entry.organization);

    // Aucune accolade orpheline : signe d'un échappement manquant.
    const open = (tex.match(/(?<!\\)\{/g) ?? []).length;
    const close = (tex.match(/(?<!\\)\}/g) ?? []).length;
    expect(open).toBe(close);
  });

  it("expose le texte nu de toutes les entrées pour la validation ATS", () => {
    const { plainText } = renderLatex(doc);
    for (const entry of data.experiences) expect(plainText).toContain(entry.organization);
    for (const entry of data.education) expect(plainText).toContain(entry.institution);
    expect(plainText).toContain(data.personal.lastName);
  });

  it("reste déterministe", () => {
    const first = renderLatex(doc).files.map((file) => file.content).join("");
    const second = renderLatex(doc).files.map((file) => file.content).join("");
    expect(first).toBe(second);
  });

  void name;
});

describe("propagation d'une modification", () => {
  it("se répercute sur les trois sorties depuis le même CVData", () => {
    const before = makeDocument(MEDIUM);
    const after = makeDocument({
      ...MEDIUM,
      personal: { ...MEDIUM.personal, lastName: "Modifié" },
      experiences: [
        { ...MEDIUM.experiences[0]!, organization: "Organisation Renommée" },
        ...MEDIUM.experiences.slice(1),
      ],
    });

    const texBefore = renderLatex(before).plainText;
    const texAfter = renderLatex(after).plainText;

    expect(texBefore).not.toContain("Modifié");
    expect(texAfter).toContain("Modifié");
    expect(texAfter).toContain("Organisation Renommée");
    expect(texAfter).not.toContain("Organisation 1,");
  });

  it("respecte le masquage d'une section dans le LaTeX", () => {
    const hidden = makeDocument(MEDIUM);
    hidden.presentation.sections = hidden.presentation.sections.map((section) =>
      section.key === "certifications" ? { ...section, visible: false } : section,
    );

    expect(renderLatex(hidden).plainText).not.toContain("Certification fictive");
    expect(renderLatex(makeDocument(MEDIUM)).plainText).toContain("Certification fictive");
  });

  it("respecte un intitulé de section renommé... sauf en ATS, par conception", () => {
    const renamed = makeDocument(MEDIUM);
    renamed.presentation.sections = renamed.presentation.sections.map((section) =>
      section.key === "experiences" ? { ...section, title: { fr: "Mon parcours" } } : section,
    );

    // Le format ATS impose des intitulés standards : la personnalisation
    // s'applique à l'écran et au PDF humain, pas ici.
    const tex = renderLatex(renamed).files.find((f) => f.path === "cv.tex")?.content ?? "";
    expect(tex).toContain("Expérience professionnelle");
    expect(tex).not.toContain("Mon parcours");
  });
});
