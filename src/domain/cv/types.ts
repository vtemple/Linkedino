/**
 * Types du domaine — inférés depuis les schémas Zod, jamais écrits à la main.
 * Le schéma est la source ; le type en découle. L'inverse produit des dérives
 * silencieuses entre validation et compilation.
 */

import type { z } from "zod";
import type {
  CertificationSchema,
  ContactLinkSchema,
  CustomEntrySchema,
  CustomSectionSchema,
  EducationSchema,
  ExperienceSchema,
  InterestSchema,
  LanguageSchema,
  LocationSchema,
  PersonalSchema,
  ProjectSchema,
  SkillGroupSchema,
  SkillSchema,
} from "./schema";

export type Personal = z.infer<typeof PersonalSchema>;
export type ContactLink = z.infer<typeof ContactLinkSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type SkillGroup = z.infer<typeof SkillGroupSchema>;
export type Language = z.infer<typeof LanguageSchema>;
export type Certification = z.infer<typeof CertificationSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Interest = z.infer<typeof InterestSchema>;
export type CustomSection = z.infer<typeof CustomSectionSchema>;
export type CustomEntry = z.infer<typeof CustomEntrySchema>;

export * from "./schema";
