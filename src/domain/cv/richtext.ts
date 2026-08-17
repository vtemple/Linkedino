/**
 * Texte riche — AST inline minimal et ses sérialiseurs.
 *
 * Décision D2 : le CV ne stocke jamais de HTML. `contenteditable` produisait des
 * <div> que le PDF et le LaTeX recrachaient en clair ; ici le format contraint
 * l'éditeur, et non l'inverse.
 *
 * Les trois sérialiseurs sont *totaux* : aucun nœud ne peut échapper au switch,
 * garanti par le `assertNever` final.
 */

import type { InlineNode, RichText, TextNode } from "./schema";

/* ── Sérialisation ─────────────────────────────────────────────────────── */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

function assertNever(value: never): never {
  throw new Error(`Nœud inline non géré : ${JSON.stringify(value)}`);
}

function marksToHtml(text: string, marks: TextNode["marks"]): string {
  let out = escapeHtml(text);
  if (!marks) return out;
  // Ordre stable : le rendu ne doit pas dépendre de l'ordre de saisie.
  if (marks.includes("italic")) out = `<em>${out}</em>`;
  if (marks.includes("bold")) out = `<strong>${out}</strong>`;
  return out;
}

export function toHtml(nodes: RichText): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return marksToHtml(node.text, node.marks);
        case "link": {
          const inner = node.children.map((c) => marksToHtml(c.text, c.marks)).join("");
          return `<a href="${escapeHtml(node.href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
        }
        default:
          return assertNever(node);
      }
    })
    .join("");
}

/** Texte nu. Alimente l'export ATS, les métadonnées et les tests de non-régression PDF. */
export function toPlain(nodes: RichText): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.text;
        case "link":
          return node.children.map((c) => c.text).join("");
        default:
          return assertNever(node);
      }
    })
    .join("");
}

export function isEmpty(nodes: RichText | undefined): boolean {
  return !nodes || toPlain(nodes).trim().length === 0;
}

/* ── Construction ──────────────────────────────────────────────────────── */

export function text(value: string, ...marks: NonNullable<TextNode["marks"]>): RichText {
  const node: TextNode = marks.length ? { type: "text", text: value, marks } : { type: "text", text: value };
  return [node];
}

export function fromPlain(value: string): RichText {
  const trimmed = value.trim();
  return trimmed ? [{ type: "text", text: trimmed }] : [];
}

/** Fusionne les nœuds texte adjacents de même style. Idempotent. */
export function normalize(nodes: RichText): RichText {
  const out: InlineNode[] = [];
  for (const node of nodes) {
    if (node.type === "text" && node.text === "") continue;
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.type === "text" &&
      node.type === "text" &&
      sameMarks(prev.marks, node.marks)
    ) {
      out[out.length - 1] = { ...prev, text: prev.text + node.text };
    } else {
      out.push(node);
    }
  }
  return out;
}

function sameMarks(a: TextNode["marks"], b: TextNode["marks"]): boolean {
  const sa = [...(a ?? [])].sort().join(",");
  const sb = [...(b ?? [])].sort().join(",");
  return sa === sb;
}

/* ── Parsing du HTML hérité ────────────────────────────────────────────── */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  laquo: "«",
  raquo: "»",
  euro: "€",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

const BLOCK_TAGS = new Set(["div", "p", "li", "br", "tr"]);

interface TagToken {
  kind: "tag";
  name: string;
  closing: boolean;
  attrs: Record<string, string>;
}
interface TextToken {
  kind: "text";
  value: string;
}
type Token = TagToken | TextToken;

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const re = /<\/?\s*([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\/?>/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    if (match.index > last) {
      tokens.push({ kind: "text", value: html.slice(last, match.index) });
    }
    const raw = match[0] ?? "";
    const name = (match[1] ?? "").toLowerCase();
    const attrs: Record<string, string> = {};
    const attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"|([a-zA-Z-]+)\s*=\s*'([^']*)'/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRe.exec(match[2] ?? "")) !== null) {
      const key = (attrMatch[1] ?? attrMatch[3] ?? "").toLowerCase();
      attrs[key] = attrMatch[2] ?? attrMatch[4] ?? "";
    }
    tokens.push({ kind: "tag", name, closing: raw.startsWith("</"), attrs });
    last = re.lastIndex;
  }
  if (last < html.length) tokens.push({ kind: "text", value: html.slice(last) });
  return tokens;
}

/**
 * Convertit le HTML produit par `contenteditable` en blocs de RichText.
 *
 * Un bloc = une puce. Les frontières sont `<div>`, `<p>`, `<li>`, `<br>`, et les
 * retours à la ligne du texte brut — le prototype mélangeait les deux conventions
 * dans le même champ (`desc`), d'où l'incohérence entre HTML, PDF et LaTeX.
 *
 * Les balises inconnues sont ignorées mais leur contenu textuel est conservé :
 * on ne perd jamais de texte, c'est la règle non négociable d'une migration.
 */
export function parseLegacyHtml(input: string): RichText[] {
  if (!input) return [];

  const blocks: RichText[] = [];
  let current: InlineNode[] = [];
  const marks = new Set<"bold" | "italic">();
  let linkHref: string | null = null;
  let linkChildren: TextNode[] = [];

  const flushBlock = (): void => {
    const normalized = normalize(current);
    if (toPlain(normalized).trim().length > 0) {
      blocks.push(trimEdges(normalized));
    }
    current = [];
  };

  const pushText = (value: string): void => {
    if (!value) return;
    const node: TextNode =
      marks.size > 0
        ? { type: "text", text: value, marks: [...marks].sort() }
        : { type: "text", text: value };
    if (linkHref !== null) linkChildren.push(node);
    else current.push(node);
  };

  for (const token of tokenize(input)) {
    if (token.kind === "text") {
      const decoded = decodeEntities(token.value).replace(/\u00a0/g, " ");
      // Les retours à la ligne du texte brut sont aussi des frontières de bloc.
      const parts = decoded.split(/\r?\n/);
      parts.forEach((part, index) => {
        if (index > 0) flushBlock();
        pushText(part.replace(/[ \t]+/g, " "));
      });
      continue;
    }

    switch (token.name) {
      case "b":
      case "strong":
        if (token.closing) marks.delete("bold");
        else marks.add("bold");
        break;
      case "i":
      case "em":
        if (token.closing) marks.delete("italic");
        else marks.add("italic");
        break;
      case "a":
        if (token.closing) {
          const href = linkHref;
          const children = linkChildren;
          linkHref = null;
          linkChildren = [];
          if (href && children.length > 0 && isSafeHref(href)) {
            current.push({ type: "link", href, children });
          } else {
            // href non exploitable (data:, javascript:, vide) → on garde le texte.
            current.push(...children);
          }
        } else {
          linkHref = token.attrs["href"] ?? null;
          linkChildren = [];
        }
        break;
      default:
        if (BLOCK_TAGS.has(token.name)) flushBlock();
        break;
    }
  }

  // Lien resté ouvert : on récupère son texte plutôt que de le perdre.
  if (linkChildren.length > 0) current.push(...linkChildren);
  flushBlock();
  return blocks;
}

function trimEdges(nodes: RichText): RichText {
  const out = nodes.map((n) => ({ ...n }));
  const first = out[0];
  if (first && first.type === "text") first.text = first.text.replace(/^\s+/, "");
  const last = out[out.length - 1];
  if (last && last.type === "text") last.text = last.text.replace(/\s+$/, "");
  return out.filter((n) => n.type !== "text" || n.text.length > 0);
}

/** Seuls http(s) et mailto sont conservés : `data:` et `javascript:` sont écartés. */
export function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(href.trim());
}

/**
 * Découpe une chaîne héritée en puces, en retirant les préfixes de liste
 * saisis à la main (« – », « - », « • ») que le prototype reconstruisait
 * ensuite par expression régulière.
 */
export function parseLegacyBullets(input: string): RichText[] {
  return parseLegacyHtml(input)
    .map((block) => stripBulletPrefix(block))
    .filter((block) => toPlain(block).trim().length > 0);
}

function stripBulletPrefix(block: RichText): RichText {
  const first = block[0];
  if (!first || first.type !== "text") return block;
  const stripped = first.text.replace(/^\s*[–—\-•*·]\s*/, "");
  if (stripped === first.text) return block;
  const out = [...block];
  out[0] = { ...first, text: stripped };
  return out.filter((n) => n.type !== "text" || n.text.length > 0);
}
