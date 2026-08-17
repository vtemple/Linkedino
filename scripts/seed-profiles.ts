/**
 * Crée trois profils fictifs pour le contrôle de rendu.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/seed-profiles.ts
 *
 * Court, moyen et très long : les trois régimes où la pagination, la
 * répartition en colonnes et l'ajustement à une page se comportent
 * différemment. Toutes les données sont inventées.
 */

import { CVDocumentSchema } from "../src/domain/cv/schema";
import { defaultSectionConfig } from "../src/domain/cv/sections";
import { fromPlain } from "../src/domain/cv/richtext";
import { repository } from "../src/lib/storage/repo";
import type { CVData } from "../src/domain/cv/types";

const NOW = "2026-01-01T00:00:00.000Z";

const experience = (index: number, bullets: number) => ({
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
    fr: Array.from({ length: bullets }, (_, k) =>
      fromPlain(`Réalisation ${k + 1} de la mission ${index}, mesurée et vérifiable sur la durée.`),
    ),
  },
});

const education = (index: number) => ({
  id: `edu_${index}`,
  provenance: "user" as const,
  institution: `Établissement ${index}`,
  logo: null,
  degree: { fr: `Diplôme ${index}, spécialité fictive` },
  period: { start: `${2005 + index}`, end: `${2007 + index}`, current: false },
});

interface Shape {
  name: string;
  experiences: number;
  education: number;
  skills: number;
  certifications: number;
}

const SHAPES: Shape[] = [
  { name: "court", experiences: 1, education: 0, skills: 0, certifications: 0 },
  { name: "moyen", experiences: 3, education: 2, skills: 3, certifications: 1 },
  { name: "long", experiences: 14, education: 6, skills: 40, certifications: 12 },
];

async function main(): Promise<void> {
  for (const shape of SHAPES) {
    const data: CVData = {
      personal: {
        firstName: "Alex",
        lastName: shape.name.toUpperCase(),
        headline: { fr: "Intitulé fictif" },
        email: "test@exemple-test.fr",
        location: { city: "Nantes", country: "FR" },
        photo: null,
        links: [],
      },
      ...(shape.experiences > 1
        ? { summary: { fr: fromPlain("Résumé fictif pour le contrôle de rendu.") } }
        : {}),
      experiences: Array.from({ length: shape.experiences }, (_, i) => experience(i + 1, 4)),
      education: Array.from({ length: shape.education }, (_, i) => education(i + 1)),
      skills: shape.skills
        ? [
            {
              id: "grp_1",
              provenance: "user",
              name: { fr: "Compétences" },
              skills: Array.from({ length: shape.skills }, (_, i) => ({
                id: `skl_${i}`,
                provenance: "user" as const,
                name: { fr: `Compétence ${i + 1}` },
              })),
            },
          ]
        : [],
      languages: [
        { id: "lng_1", provenance: "user", name: { fr: "Français" }, level: "native" },
        { id: "lng_2", provenance: "user", name: { fr: "Anglais" }, level: "C1" },
      ],
      certifications: Array.from({ length: shape.certifications }, (_, i) => ({
        id: `crt_${i}`,
        provenance: "user" as const,
        issuer: `Organisme ${i}`,
        name: { fr: `Certification ${i + 1}` },
        logo: null,
        expires: null,
      })),
      projects: [],
      interests: [],
      customSections: [],
    };

    const doc = CVDocumentSchema.parse({
      schemaVersion: 1,
      id: `cv_${shape.name}`,
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

    await repository.save(doc);
    console.log(
      `cv_${shape.name.padEnd(6)} ${shape.experiences} xp · ${shape.education} formations · ` +
        `${shape.skills} compétences · ${shape.certifications} certifications`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
