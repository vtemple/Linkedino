/**
 * CVData v1 — source de vérité du produit.
 *
 * Règles tenues par ce fichier :
 *   - aucun import hors de `zod` ;
 *   - aucune notion de couleur, de thème ou de mise en page (→ Presentation) ;
 *   - aucune chaîne d'affichage préformatée (dates, contacts) ;
 *   - aucun HTML stocké (→ RichText).
 */

import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

/* ── Primitives ────────────────────────────────────────────────────────── */

export const LOCALES = ["fr", "en"] as const;
export const LocaleSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

/** Identifiant stable (nanoid). Clés React, glisser-déposer, diff de versions. */
export const IdSchema = z.string().min(1).max(32);

/**
 * Valeur localisée. Décision D4 : on localise la feuille, pas le document.
 * Les ids, l'ordre, les dates et les assets restent partagés entre langues —
 * le prototype dupliquait le CV entier, logos base64 compris, à chaque bascule.
 */
export const localized = <T extends z.ZodTypeAny>(inner: T) =>
  z
    .object({ fr: inner.optional(), en: inner.optional() })
    .refine((v) => Object.values(v).some((x) => x !== undefined), {
      message: "Au moins une locale doit être renseignée.",
    });

export type Localized<T> = Partial<Record<Locale, T>>;

export function resolveLocalized<T>(
  value: Localized<T> | undefined,
  locale: Locale,
  primary: Locale,
): T | undefined {
  if (!value) return undefined;
  return (
    value[locale] ??
    value[primary] ??
    (Object.values(value).find((v) => v !== undefined) as T | undefined)
  );
}

/* ── Texte riche ───────────────────────────────────────────────────────── */

export const InlineMarkSchema = z.enum(["bold", "italic"]);

export const TextNodeSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  marks: z.array(InlineMarkSchema).optional(),
});

export const LinkNodeSchema = z.object({
  type: z.literal("link"),
  href: z.string().url().max(2048),
  children: z.array(TextNodeSchema).min(1),
});

export const InlineNodeSchema = z.discriminatedUnion("type", [TextNodeSchema, LinkNodeSchema]);

/** Un paragraphe ou une puce. */
export const RichTextSchema = z.array(InlineNodeSchema);

export type TextNode = z.infer<typeof TextNodeSchema>;
export type LinkNode = z.infer<typeof LinkNodeSchema>;
export type InlineNode = z.infer<typeof InlineNodeSchema>;
export type RichText = z.infer<typeof RichTextSchema>;

export const LocalizedRichTextSchema = localized(RichTextSchema);
export const LocalizedBulletsSchema = localized(z.array(RichTextSchema));

/* ── Dates ─────────────────────────────────────────────────────────────── */

const ISO_PARTIAL = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

export const IsoDateSchema = z
  .string()
  .regex(ISO_PARTIAL, "Date attendue au format AAAA, AAAA-MM ou AAAA-MM-JJ.");

export const DateRangeSchema = z
  .object({
    start: IsoDateSchema,
    end: IsoDateSchema.nullable().default(null),
    current: z.boolean().default(false),
  })
  .refine((r) => !(r.current && r.end !== null), {
    message: "Une période en cours ne peut pas avoir de date de fin.",
    path: ["end"],
  })
  .refine((r) => r.end === null || r.end >= r.start, {
    message: "La date de fin précède la date de début.",
    path: ["end"],
  });

export type DateRange = z.infer<typeof DateRangeSchema>;

/* ── Assets ────────────────────────────────────────────────────────────── */

export const AssetVariantSchema = z.object({
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
});

export const AssetRefSchema = z.object({
  id: IdSchema,
  /** Variante par défaut. Les renderers choisissent dans `variants`. */
  url: z.string(),
  mime: z.enum(["image/webp", "image/png", "image/jpeg", "image/svg+xml"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Point focal en %, réglé par l'outil de cadrage du studio. */
  focal: z
    .object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
    .default({ x: 50, y: 50 }),
  /** Facteur d'agrandissement du cadrage. L'original n'est jamais rogné :
   *  focal et zoom se rejouent à l'identique dans les trois formats. */
  zoom: z.number().min(1).max(3).default(1),
  /** Clés : "webp-256", "png-512"… Le LaTeX exige du PNG, le web préfère WebP. */
  variants: z.record(z.string(), AssetVariantSchema).default({}),
  alt: localized(z.string()).optional(),
});

export type AssetRef = z.infer<typeof AssetRefSchema>;

/* ── Provenance ────────────────────────────────────────────────────────── */

/**
 * `import` = produit par le pipeline déterministe et jamais revu par l'humain.
 * L'éditeur peut proposer une relecture ciblée des champs à faible confiance
 * (voir `ImportWarning`), sans jamais bloquer l'utilisateur.
 */
export const ProvenanceSchema = z.enum(["user", "import"]);

const entryBase = {
  id: IdSchema,
  provenance: ProvenanceSchema.optional(),
};

/* ── Identité ──────────────────────────────────────────────────────────── */

export const LocationSchema = z.object({
  city: z.string().max(80),
  region: z.string().max(80).optional(),
  /** ISO 3166-1 alpha-2. */
  country: z.string().length(2).optional(),
});

export const ContactLinkSchema = z.object({
  ...entryBase,
  kind: z.enum(["linkedin", "github", "website", "portfolio", "other"]),
  href: z.string().url(),
  label: localized(z.string()).optional(),
});

/**
 * Le prototype stockait le contact en un blob : « 📧 email@…\n📞 06…\n📍 Lyon ».
 * Chaque renderer le redécoupait puis filtrait les emojis par plage de codepoints.
 * Ici les données sont propres ; le template décide de ses icônes.
 */
export const PersonalSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  /** Ex-`subtitle` : « Management · Commerce · Audiovisuel ». */
  headline: localized(z.string().max(160)).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(32).optional(),
  location: LocationSchema.optional(),
  photo: AssetRefSchema.nullable().default(null),
  links: z.array(ContactLinkSchema).default([]),
});

/* ── Sections ──────────────────────────────────────────────────────────── */

export const ContractSchema = z.enum([
  "cdi",
  "cdd",
  "stage",
  "alternance",
  "freelance",
  "interim",
  "benevolat",
]);

export const ExperienceSchema = z.object({
  ...entryBase,
  organization: z.string().min(1).max(160),
  logo: AssetRefSchema.nullable().default(null),
  role: localized(z.string().max(160)),
  contract: ContractSchema.optional(),
  /** Champ distinct de `organization` : le prototype les rendait dans le même
   *  nœud éditable, d'où la duplication « Lyon, France — Lyon, France ». */
  location: LocationSchema.optional(),
  period: DateRangeSchema,
  summary: LocalizedRichTextSchema.optional(),
  bullets: LocalizedBulletsSchema.optional(),
});

export const EducationSchema = z.object({
  ...entryBase,
  institution: z.string().min(1).max(160),
  logo: AssetRefSchema.nullable().default(null),
  degree: localized(z.string().max(240)),
  field: localized(z.string().max(160)).optional(),
  location: LocationSchema.optional(),
  period: DateRangeSchema,
  /** « 15,83/20 · Major de promo ». */
  distinction: localized(z.string().max(160)).optional(),
  bullets: LocalizedBulletsSchema.optional(),
});

export const SkillSchema = z.object({
  ...entryBase,
  name: localized(z.string().max(80)),
  level: z.number().int().min(1).max(5).optional(),
});

export const SkillGroupSchema = z.object({
  ...entryBase,
  name: localized(z.string().max(80)),
  skills: z.array(SkillSchema).default([]),
});

/**
 * LinkedIn livre « C1 — TOEIC 800/990 » en une seule chaîne.
 * Séparé ici : le LaTeX ATS n'affiche que le niveau CECRL, le HTML les deux.
 */
export const LanguageSchema = z.object({
  ...entryBase,
  name: localized(z.string().max(60)),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2", "native"]),
  certification: z
    .object({
      name: z.string().max(60),
      score: z.string().max(40).optional(),
      year: z.string().regex(/^\d{4}$/).optional(),
    })
    .optional(),
});

export const CertificationSchema = z.object({
  ...entryBase,
  issuer: z.string().max(160),
  name: localized(z.string().max(200)),
  logo: AssetRefSchema.nullable().default(null),
  /** Ex-« Identifiant P-DY6XKXG8 », extrait du champ `detail` libre. */
  credentialId: z.string().max(80).optional(),
  /** Remplace `link_html`, qui stockait du HTML brut réinjecté en innerHTML. */
  url: z.string().url().optional(),
  issued: IsoDateSchema.optional(),
  expires: IsoDateSchema.nullable().default(null),
  detail: localized(z.string().max(200)).optional(),
});

export const ProjectSchema = z.object({
  ...entryBase,
  name: localized(z.string().max(160)),
  role: localized(z.string().max(120)).optional(),
  url: z.string().url().optional(),
  period: DateRangeSchema.optional(),
  summary: LocalizedRichTextSchema.optional(),
  bullets: LocalizedBulletsSchema.optional(),
  tags: z.array(z.string().max(40)).default([]),
});

/**
 * Ex-`activites`. L'emoji est stocké à part du libellé : le LaTeX ATS le
 * supprime sans mutiler le texte — le prototype filtrait par codepoint et
 * rognait au passage tout caractère non latin.
 */
export const InterestSchema = z.object({
  ...entryBase,
  icon: z.string().max(8).optional(),
  label: localized(z.string().max(60)),
  text: LocalizedRichTextSchema.optional(),
});

export const CustomEntrySchema = z.object({
  ...entryBase,
  title: localized(z.string().max(200)),
  subtitle: localized(z.string().max(200)).optional(),
  period: DateRangeSchema.optional(),
  bullets: LocalizedBulletsSchema.optional(),
});

export const CustomSectionSchema = z.object({
  ...entryBase,
  title: localized(z.string().max(80)),
  entries: z.array(CustomEntrySchema).default([]),
});

/* ── CVData ────────────────────────────────────────────────────────────── */

export const CVDataSchema = z.object({
  personal: PersonalSchema,
  summary: LocalizedRichTextSchema.optional(),
  experiences: z.array(ExperienceSchema).default([]),
  education: z.array(EducationSchema).default([]),
  skills: z.array(SkillGroupSchema).default([]),
  languages: z.array(LanguageSchema).default([]),
  certifications: z.array(CertificationSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  interests: z.array(InterestSchema).default([]),
  customSections: z.array(CustomSectionSchema).default([]),
});

export type CVData = z.infer<typeof CVDataSchema>;

/* ── Presentation ──────────────────────────────────────────────────────── */

export const ThemeSchema = z.enum(["light", "dark"]);
export const DensitySchema = z.enum(["compact", "normal", "spacious"]);

export const SECTION_KEYS = [
  "profile",
  "summary",
  "experiences",
  "education",
  "skills",
  "languages",
  "certifications",
  "projects",
  "interests",
] as const;

export const SectionKeySchema = z.union([
  z.enum(SECTION_KEYS),
  z.string().regex(/^custom:.+$/),
]);

export const SectionConfigSchema = z.object({
  key: SectionKeySchema,
  visible: z.boolean().default(true),
  /** Surcharge de l'intitulé, éditable dans le studio. */
  title: localized(z.string().max(60)).optional(),
  /** Colonne d'accueil : c'est ce qui permet de déplacer une section entière
   *  entre la bande latérale et le corps du CV. */
  column: z.enum(["main", "aside"]).default("main"),
});

/** Palettes proposées. L'utilisateur peut aussi imposer son propre accent. */
export const PaletteSchema = z.enum(["amber", "emerald", "ink", "plum"]);

/** Appariements typographiques : une famille d'affichage, une de lecture. */
export const FontPairSchema = z.enum(["editorial", "grotesk", "classic"]);

export const PresentationSchema = z.object({
  templateId: z.string().min(1),
  theme: ThemeSchema.default("dark"),
  density: DensitySchema.default("normal"),
  palette: PaletteSchema.default("amber"),
  fontPair: FontPairSchema.default("editorial"),
  /** Surcharge de l'accent de la palette. */
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale à 6 chiffres attendue.")
    .optional(),
  sections: z.array(SectionConfigSchema).default([]),
});

export type Presentation = z.infer<typeof PresentationSchema>;

/* ── Document ──────────────────────────────────────────────────────────── */

export const CVDocumentSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: IdSchema,
    locales: z.object({
      primary: LocaleSchema,
      available: z.array(LocaleSchema).min(1),
    }),
    data: CVDataSchema,
    presentation: PresentationSchema,
    meta: z.object({
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      /** Concurrence optimiste de l'autosave : PATCH la renvoie, 409 si obsolète. */
      revision: z.number().int().nonnegative(),
    }),
  })
  .superRefine((doc, ctx) => {
    if (!doc.locales.available.includes(doc.locales.primary)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["locales", "primary"],
        message: "La locale principale doit figurer dans les locales disponibles.",
      });
    }
  });

export type CVDocument = z.infer<typeof CVDocumentSchema>;
