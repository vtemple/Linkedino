import { describe, expect, it } from "vitest";

import { analyseDensity } from "../src/domain/cv/density";
import { defaultSectionConfig } from "../src/domain/cv/sections";
import { fromPlain } from "../src/domain/cv/richtext";
import { PresentationSchema } from "../src/domain/cv/schema";
import type { CVData, Presentation } from "../src/domain/cv/types";

const presentation: Presentation = PresentationSchema.parse({
  templateId: "duo",
  sections: defaultSectionConfig(),
});

function base(): CVData {
  return {
    personal: { firstName: "Alex", lastName: "Test", photo: null, links: [] },
    experiences: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    projects: [],
    interests: [],
    customSections: [],
  };
}

const experience = (index: number, bullets: number, length = 80) => ({
  id: `exp_${index}`,
  provenance: "user" as const,
  organization: `Organisation ${index}`,
  logo: null,
  role: { fr: `Poste ${index}` },
  period: { start: "2020-01", end: "2021-01", current: false },
  bullets: { fr: Array.from({ length: bullets }, () => fromPlain("x".repeat(length))) },
});

describe("analyse de densité", () => {
  it("ne signale rien sur un CV court", () => {
    const data = { ...base(), experiences: [experience(1, 3)] };
    const report = analyseDensity(data, presentation, "fr");

    expect(report.level).toBe("normal");
    expect(report.advices).toHaveLength(0);
    expect(report.pageEstimate).toBe("une page");
  });

  it("passe en critique sur un CV manifestement trop long", () => {
    const data = {
      ...base(),
      experiences: Array.from({ length: 14 }, (_, i) => experience(i + 1, 4, 110)),
    };
    const report = analyseDensity(data, presentation, "fr");

    expect(report.level).toBe("critique");
    expect(report.pageEstimate).toBe("plus d'une page");
    expect(report.advices[0]?.id).toBe("page-overflow");
  });

  it("conseille de réduire les puces d'une expérience trop détaillée", () => {
    const data = { ...base(), experiences: [experience(1, 9)] };
    const advices = analyseDensity(data, presentation, "fr").advices;

    const advice = advices.find((entry) => entry.id.startsWith("bullets-"));
    expect(advice?.message).toContain("9 puces");
    expect(advice?.scope).toBe("experiences:exp_1");
  });

  it("signale une puce trop longue sans la modifier", () => {
    const data = { ...base(), experiences: [experience(1, 2, 260)] };
    const report = analyseDensity(data, presentation, "fr");

    expect(report.advices.some((entry) => entry.id.startsWith("bullet-long-"))).toBe(true);
    // Le contenu est intact : le module conseille, il ne touche à rien.
    expect(data.experiences[0]?.bullets?.fr?.[0]).toBeDefined();
  });

  it("contextualise le conseil sur le nombre d'expériences", () => {
    const data = {
      ...base(),
      experiences: Array.from({ length: 10 }, (_, i) => experience(i + 1, 2)),
    };
    const advice = analyseDensity(data, presentation, "fr").advices.find(
      (entry) => entry.id === "experiences-count",
    );

    expect(advice?.message).toContain("10 expériences");
    expect(advice?.message).toMatch(/anciennes/);
  });

  it("conseille sur les compétences et les certifications", () => {
    const data: CVData = {
      ...base(),
      skills: [
        {
          id: "grp",
          provenance: "user",
          name: { fr: "Compétences" },
          skills: Array.from({ length: 30 }, (_, i) => ({
            id: `s${i}`,
            provenance: "user" as const,
            name: { fr: `Compétence ${i}` },
          })),
        },
      ],
      certifications: Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`,
        provenance: "user" as const,
        issuer: "Organisme",
        name: { fr: `Certification ${i}` },
        logo: null,
        expires: null,
      })),
    };
    const ids = analyseDensity(data, presentation, "fr").advices.map((entry) => entry.id);

    expect(ids).toContain("skills-count");
    expect(ids).toContain("certifications-count");
  });

  it("ignore les sections masquées dans l'estimation", () => {
    const data = {
      ...base(),
      experiences: Array.from({ length: 12 }, (_, i) => experience(i + 1, 4, 110)),
    };

    const withAll = analyseDensity(data, presentation, "fr");
    const hidden: Presentation = {
      ...presentation,
      sections: presentation.sections.map((section) =>
        section.key === "experiences" ? { ...section, visible: false } : section,
      ),
    };
    const withHidden = analyseDensity(data, hidden, "fr");

    expect(withHidden.estimatedMm).toBeLessThan(withAll.estimatedMm);
    expect(withHidden.level).toBe("normal");
  });

  it("compte les deux colonnes en parallèle, pas en cumul", () => {
    // Les compétences vont en bande latérale : elles ne doivent pas gonfler
    // la hauteur estimée de la colonne principale.
    const data: CVData = {
      ...base(),
      experiences: [experience(1, 3)],
      skills: [
        {
          id: "grp",
          provenance: "user",
          name: { fr: "Compétences" },
          skills: Array.from({ length: 6 }, (_, i) => ({
            id: `s${i}`,
            provenance: "user" as const,
            name: { fr: `Compétence ${i}` },
          })),
        },
      ],
    };
    const report = analyseDensity(data, presentation, "fr");
    expect(report.level).toBe("normal");
  });

  it("reste déterministe", () => {
    const data = { ...base(), experiences: [experience(1, 4)] };
    expect(analyseDensity(data, presentation, "fr")).toEqual(
      analyseDensity(data, presentation, "fr"),
    );
  });
});
