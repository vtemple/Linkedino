/**
 * Design tokens du template « Duo ».
 *
 * Extraits du prototype puis affinés. Tout ce qui relève de l'apparence vit
 * ici : les composants ne contiennent aucune couleur ni taille en dur, et le
 * même jeu de tokens alimente l'écran, l'impression et l'export autonome.
 *
 * Note sur l'accent. Le prototype utilisait `#4ade80` — le `green-400` de
 * Tailwind — sur fond quasi noir. La combinaison est très répandue et lit
 * « valeur par défaut ». L'ambre repris ici vient du monde du sujet
 * (lumière tungstène, amorce de pellicule) et tient le contraste AA sur les
 * deux thèmes. Le jeu d'origine reste disponible : `PALETTES.emerald`.
 */

export interface ThemeTokens {
  bg: string;
  surface1: string;
  surface2: string;
  text: string;
  textMuted: string;
  accent: string;
  accentRgb: string;
  border: string;
  shadow: string;
}

export interface DesignTokens {
  light: ThemeTokens;
  dark: ThemeTokens;
  font: {
    display: string;
    body: string;
    /** Chiffres et libellés courts : même famille que l'affichage, plus serrée. */
    utility: string;
  };
  radius: { sm: string; md: string; lg: string };
  /** Multiplicateurs appliqués aux espacements selon la densité choisie. */
  density: Record<"compact" | "normal" | "spacious", number>;
}

const JOST = `'Jost', 'Futura', 'Century Gothic', 'Avenir Next', system-ui, sans-serif`;
const SERIF = `'Iowan Old Style', 'Charter', 'Palatino Linotype', 'Book Antiqua', Georgia, serif`;
const GROTESK = `'Inter', 'Helvetica Neue', 'Segoe UI', system-ui, sans-serif`;
const SERIF_DISPLAY = `'Hoefler Text', Baskerville, 'Times New Roman', Georgia, serif`;

export type PaletteId = "amber" | "emerald" | "ink" | "plum";
export type FontPairId = "editorial" | "grotesk" | "classic";

export interface FontPairTokens {
  display: string;
  body: string;
  utility: string;
}

/**
 * Chaque appariement oppose une famille d'affichage à une famille de lecture :
 * un seul caractère pour tout le document donne un rendu plat, c'est le
 * contraste qui produit la hiérarchie.
 */
export const FONT_PAIRS: Record<FontPairId, FontPairTokens & { label: string }> = {
  editorial: { label: "Éditorial", display: JOST, body: SERIF, utility: JOST },
  grotesk: { label: "Contemporain", display: GROTESK, body: GROTESK, utility: GROTESK },
  classic: { label: "Classique", display: SERIF_DISPLAY, body: SERIF, utility: GROTESK },
};

export const PALETTES = {
  amber: {
    light: {
      bg: "#FCFCFB",
      surface1: "#F6F5F2",
      surface2: "#F1F0EC",
      text: "#14171C",
      textMuted: "rgba(20, 23, 28, 0.62)",
      accent: "#8F5A1E",
      accentRgb: "143, 90, 30",
      border: "rgba(20, 23, 28, 0.10)",
      shadow: "0 1px 2px rgba(20,23,28,.04), 0 8px 24px rgba(20,23,28,.05)",
    },
    dark: {
      bg: "#0E1013",
      surface1: "#16191E",
      surface2: "#1A1E24",
      text: "#ECEDEF",
      textMuted: "rgba(236, 237, 239, 0.60)",
      accent: "#E3AC63",
      accentRgb: "227, 172, 99",
      border: "rgba(227, 172, 99, 0.18)",
      shadow: "0 1px 2px rgba(0,0,0,.35), 0 12px 32px rgba(0,0,0,.42)",
    },
  },
  /** Palette d'origine du prototype, conservée telle quelle. */
  emerald: {
    light: {
      bg: "#ffffff",
      surface1: "#f9f9f9",
      surface2: "#f4f4f4",
      text: "#111111",
      textMuted: "rgba(17, 17, 17, 0.62)",
      accent: "#0d152d",
      accentRgb: "13, 21, 45",
      border: "rgba(13, 21, 45, 0.10)",
      shadow: "0 2px 12px rgba(0,0,0,.06)",
    },
    dark: {
      bg: "#141416",
      surface1: "#1e1e21",
      surface2: "#18181b",
      text: "#efefef",
      textMuted: "rgba(239, 239, 239, 0.60)",
      accent: "#4ade80",
      accentRgb: "74, 222, 128",
      border: "rgba(74, 222, 128, 0.15)",
      shadow: "0 2px 18px rgba(0,0,0,.45)",
    },
  },
  ink: {
    light: {
      bg: "#FCFCFD", surface1: "#F2F4F8", surface2: "#ECEFF5",
      text: "#101522", textMuted: "rgba(16, 21, 34, 0.62)",
      accent: "#26417E", accentRgb: "38, 65, 126",
      border: "rgba(16, 21, 34, 0.10)",
      shadow: "0 1px 2px rgba(16,21,34,.05), 0 8px 24px rgba(16,21,34,.06)",
    },
    dark: {
      bg: "#0C0F17", surface1: "#141926", surface2: "#171D2C",
      text: "#E9ECF3", textMuted: "rgba(233, 236, 243, 0.60)",
      accent: "#8FAEEB", accentRgb: "143, 174, 235",
      border: "rgba(143, 174, 235, 0.18)",
      shadow: "0 1px 2px rgba(0,0,0,.4), 0 12px 32px rgba(0,0,0,.45)",
    },
  },
  plum: {
    light: {
      bg: "#FDFBFC", surface1: "#F7F2F5", surface2: "#F2ECF0",
      text: "#1A121A", textMuted: "rgba(26, 18, 26, 0.62)",
      accent: "#7A2F5C", accentRgb: "122, 47, 92",
      border: "rgba(26, 18, 26, 0.10)",
      shadow: "0 1px 2px rgba(26,18,26,.04), 0 8px 24px rgba(26,18,26,.06)",
    },
    dark: {
      bg: "#110D12", surface1: "#1A141C", surface2: "#1F1821",
      text: "#EFE9EF", textMuted: "rgba(239, 233, 239, 0.60)",
      accent: "#D89AC4", accentRgb: "216, 154, 196",
      border: "rgba(216, 154, 196, 0.18)",
      shadow: "0 1px 2px rgba(0,0,0,.4), 0 12px 32px rgba(0,0,0,.45)",
    },
  },
} satisfies Record<string, { light: ThemeTokens; dark: ThemeTokens }>;

export const PALETTE_LABELS: Record<PaletteId, string> = {
  amber: "Ambre",
  emerald: "Émeraude",
  ink: "Encre",
  plum: "Prune",
};

export interface TokenOptions {
  palette?: PaletteId;
  fontPair?: FontPairId;
  /** Accent imposé par l'utilisateur, appliqué aux deux thèmes. */
  accent?: string | undefined;
}

export function buildTokens(options: TokenOptions = {}): DesignTokens {
  const palette = PALETTES[options.palette ?? "amber"];
  const pair = FONT_PAIRS[options.fontPair ?? "editorial"];

  const light: ThemeTokens = { ...palette.light };
  const dark: ThemeTokens = { ...palette.dark };

  if (options.accent && /^#[0-9a-fA-F]{6}$/.test(options.accent)) {
    const rgb = hexToRgb(options.accent);
    for (const theme of [light, dark]) {
      theme.accent = options.accent;
      theme.accentRgb = rgb;
      theme.border = `rgba(${rgb}, 0.22)`;
    }
  }

  return {
    light,
    dark,
    font: { display: pair.display, body: pair.body, utility: pair.utility },
    radius: { sm: "0.4em", md: "0.7em", lg: "1em" },
    density: { compact: 0.85, normal: 1, spacious: 1.18 },
  };
}

function hexToRgb(hex: string): string {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)).join(", ");
}

/** Tokens dérivés d'une présentation : point d'entrée des renderers. */
export function tokensFor(presentation: {
  palette?: PaletteId;
  fontPair?: FontPairId;
  accent?: string | undefined;
}): DesignTokens {
  return buildTokens({
    ...(presentation.palette ? { palette: presentation.palette } : {}),
    ...(presentation.fontPair ? { fontPair: presentation.fontPair } : {}),
    ...(presentation.accent ? { accent: presentation.accent } : {}),
  });
}

/** Jeu par défaut, pour les appels sans présentation. */
export const duoTokens: DesignTokens = buildTokens();

/** Sérialise un thème en variables CSS. */
export function themeVars(theme: ThemeTokens): string {
  return [
    `--bg:${theme.bg}`,
    `--s1:${theme.surface1}`,
    `--s2:${theme.surface2}`,
    `--tx:${theme.text}`,
    `--mu:${theme.textMuted}`,
    `--ac:${theme.accent}`,
    `--ar:${theme.accentRgb}`,
    `--bd:${theme.border}`,
    `--sh:${theme.shadow}`,
  ].join(";");
}

export function fontVars(tokens: DesignTokens, densityScale: number): string {
  return [
    `--f-display:${tokens.font.display}`,
    `--f-body:${tokens.font.body}`,
    `--f-util:${tokens.font.utility}`,
    `--r-sm:${tokens.radius.sm}`,
    `--r-md:${tokens.radius.md}`,
    `--r-lg:${tokens.radius.lg}`,
    `--d:${densityScale}`,
  ].join(";");
}
