/**
 * Échappement LaTeX.
 *
 * Le prototype faisait `if (cp > 0x24FF) continue` : toute la typographie
 * hors latin étendu disparaissait sans un mot — emojis, mais aussi grec,
 * cyrillique, CJK et symboles mathématiques.
 *
 * Ici : table explicite, translittération des symboles courants, et toute
 * suppression est remontée dans `dropped`. Rien ne disparaît en silence.
 */

/** Caractères réservés du langage. */
const RESERVED: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "^": "\\textasciicircum{}",
  "~": "\\textasciitilde{}",
};

/**
 * Symboles translittérés plutôt que supprimés.
 * Ces commandes existent en pdfTeX comme en LuaTeX, ce qui garde le `.tex`
 * compilable par les deux moteurs sans condition.
 */
const TRANSLITERATE: Record<string, string> = {
  "—": "---",
  "–": "--",
  "…": "\\ldots{}",
  "’": "'",
  "‘": "`",
  "“": "``",
  "”": "''",
  "«": "\\guillemotleft{}",
  "»": "\\guillemotright{}",
  "·": "\\textperiodcentered{}",
  "•": "\\textbullet{}",
  "€": "\\texteuro{}",
  "£": "\\pounds{}",
  "°": "\\textdegree{}",
  "±": "\\textpm{}",
  "×": "\\texttimes{}",
  "÷": "\\textdiv{}",
  "→": "\\textrightarrow{}",
  "←": "\\textleftarrow{}",
  "↗": "",
  "™": "\\texttrademark{}",
  "©": "\\textcopyright{}",
  "®": "\\textregistered{}",
  "≥": "$\\geq$",
  "≤": "$\\leq$",
  "≈": "$\\approx$",
  "\u00a0": "~",
  "\u202f": "\\,",
  "\u2009": "\\,",
};

/** Latin de base + supplément + étendu-A : compilable par les deux moteurs. */
function isSupported(codePoint: number): boolean {
  return (
    (codePoint >= 0x20 && codePoint <= 0x7e) ||
    (codePoint >= 0xa0 && codePoint <= 0x17f) ||
    codePoint === 0x0152 ||
    codePoint === 0x0153
  );
}

export interface EscapeResult {
  text: string;
  /** Caractères retirés, dédupliqués — alimentent le rapport d'export. */
  dropped: string[];
}

export function escapeLatexVerbose(input: string): EscapeResult {
  const dropped = new Set<string>();
  let out = "";

  for (const char of input) {
    const reserved = RESERVED[char];
    if (reserved !== undefined) {
      out += reserved;
      continue;
    }

    const transliterated = TRANSLITERATE[char];
    if (transliterated !== undefined) {
      out += transliterated;
      continue;
    }

    const codePoint = char.codePointAt(0) ?? 0;
    if (isSupported(codePoint)) {
      out += char;
      continue;
    }

    dropped.add(char);
  }

  return { text: collapseSpaces(out), dropped: [...dropped] };
}

export function escapeLatex(input: string): string {
  return escapeLatexVerbose(input).text;
}

/**
 * Normalise les espaces sans casser la typographie française : l'espace fine
 * insécable avant « : ; ! ? » est requise, seule celle devant « . , » est fautive.
 */
function collapseSpaces(value: string): string {
  return value
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,])/g, "$1")
    .replace(/\s+([:;!?])/g, "\\,$1")
    .trim();
}

/** Accumulateur partagé par un rendu complet. */
export class DropReport {
  private readonly chars = new Set<string>();

  escape(input: string): string {
    const { text, dropped } = escapeLatexVerbose(input);
    for (const char of dropped) this.chars.add(char);
    return text;
  }

  get dropped(): string[] {
    return [...this.chars];
  }

  get summary(): string | null {
    if (this.chars.size === 0) return null;
    const list = [...this.chars].join(" ");
    return `${this.chars.size} caractère(s) non représentable(s) en LaTeX retiré(s) : ${list}`;
  }
}
