"use client";

/**
 * Éditeur.
 *
 * La source de vérité est `CVData` : chaque frappe modifie l'arbre de données,
 * jamais le HTML. Le prototype faisait l'inverse — il relisait le DOM par
 * index positionnel (`all[0]`, `all[1]`…), ce qui absorbait le lieu dans le
 * nom de l'organisme et rendait impossible l'ajout d'un champ optionnel vide.
 *
 * L'aperçu est un iframe sur la vraie page publique, rafraîchi après chaque
 * enregistrement : ce qu'on voit ici est littéralement ce qui sera publié.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { fromPlain, toPlain } from "../../../domain/cv/richtext";
import { AppearancePanel, LogoPicker, PhotoEditor, SectionManager } from "./panels";
import { DensityPanel } from "./DensityPanel";
import { moveItem, useSortable } from "./useSortable";
import type {
  AssetRef,
  CustomEntry,
  CVData,
  CVDocument,
  Presentation,
  Experience,
  Locale,
  Localized,
  RichText,
} from "../../../domain/cv/types";

/* ── État ──────────────────────────────────────────────────────────────── */

type Action =
  | { type: "personal"; field: keyof CVData["personal"]; value: unknown }
  | { type: "headline"; value: string }
  | { type: "entry"; section: ListSection; id: string; patch: Record<string, unknown> }
  | { type: "localized"; section: ListSection; id: string; field: string; value: string }
  | { type: "bullets"; id: string; value: string }
  | { type: "move"; section: ListSection; id: string; delta: number }
  | { type: "remove"; section: ListSection; id: string }
  | { type: "add"; section: ListSection }
  | { type: "duplicate"; section: ListSection; id: string }
  | { type: "reorder"; section: ListSection; ids: string[] }
  | { type: "moveToCustom"; section: ListSection; id: string; sectionId: string }
  | { type: "addCustomSection"; id: string; title: string }
  | { type: "removeCustomSection"; id: string }
  | { type: "renameCustomSection"; id: string; title: string }
  | { type: "addCustomEntry"; sectionId: string }
  | { type: "customEntry"; sectionId: string; entryId: string; patch: Record<string, unknown> }
  | { type: "customEntryBullets"; sectionId: string; entryId: string; value: string }
  | { type: "removeCustomEntry"; sectionId: string; entryId: string }
  | { type: "duplicateCustomEntry"; sectionId: string; entryId: string }
  | { type: "reorderCustomEntries"; sectionId: string; ids: string[] }
  | { type: "replace"; data: CVData };

type ListSection = "experiences" | "education" | "languages" | "interests" | "certifications";

function reducer(state: CVData, action: Action): CVData {
  switch (action.type) {
    case "replace":
      return action.data;

    case "personal":
      return { ...state, personal: { ...state.personal, [action.field]: action.value } };

    case "headline":
      return {
        ...state,
        personal: { ...state.personal, headline: action.value ? { fr: action.value } : undefined },
      };

    case "entry":
      return mapSection(state, action.section, (item) =>
        item.id === action.id ? { ...item, ...action.patch, provenance: "user" } : item,
      );

    case "localized":
      return mapSection(state, action.section, (item) =>
        item.id === action.id
          ? { ...item, [action.field]: { fr: action.value }, provenance: "user" }
          : item,
      );

    case "bullets": {
      const bullets = action.value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map(fromPlain);
      return mapSection(state, "experiences", (item) =>
        item.id === action.id
          ? { ...item, bullets: bullets.length > 0 ? { fr: bullets } : undefined, provenance: "user" }
          : item,
      );
    }

    case "move": {
      const list = [...state[action.section]];
      const index = list.findIndex((item) => item.id === action.id);
      const target = index + action.delta;
      if (index < 0 || target < 0 || target >= list.length) return state;
      const [entry] = list.splice(index, 1);
      if (entry) list.splice(target, 0, entry);
      return { ...state, [action.section]: list };
    }

    case "remove":
      return {
        ...state,
        [action.section]: state[action.section].filter((item) => item.id !== action.id),
      };

    case "add": {
      const id = `${action.section.slice(0, 3)}_${Date.now().toString(36)}`;
      return { ...state, [action.section]: [...state[action.section], BLANKS[action.section](id)] };
    }

    case "reorder": {
      const byId = new Map(state[action.section].map((item) => [item.id, item]));
      const next = action.ids.map((id) => byId.get(id)).filter(Boolean);
      return next.length === state[action.section].length
        ? { ...state, [action.section]: next }
        : state;
    }

    /**
     * Transfert d'un bloc vers une section personnalisée.
     *
     * Une section personnalisée accueille des entrées génériques — titre,
     * sous-titre, période, puces — donc n'importe quel bloc peut s'y convertir
     * sans perte de sens. L'inverse n'est pas vrai : transformer une formation
     * en expérience inventerait un employeur, et transformer une langue en
     * diplôme n'a aucun sens. Ces transferts-là ne sont pas proposés.
     */
    case "moveToCustom": {
      const list = state[action.section];
      const source = list.find((item) => item.id === action.id);
      if (!source) return state;

      const generic = toGenericEntry(action.section, source);
      if (!generic) return state;

      return {
        ...state,
        [action.section]: list.filter((item) => item.id !== action.id),
        customSections: state.customSections.map((section) =>
          section.id === action.sectionId
            ? { ...section, entries: [...section.entries, generic] }
            : section,
        ),
      };
    }

    case "duplicate": {
      const list = state[action.section];
      const index = list.findIndex((item) => item.id === action.id);
      if (index < 0) return state;
      const source = list[index]!;
      const copy = { ...source, id: `${action.section.slice(0, 3)}_${Date.now().toString(36)}` };
      const next = [...list];
      next.splice(index + 1, 0, copy);
      return { ...state, [action.section]: next };
    }

    case "addCustomSection":
      return {
        ...state,
        customSections: [
          ...state.customSections,
          { id: action.id, provenance: "user", title: { fr: action.title }, entries: [] },
        ],
      };

    case "removeCustomSection":
      return {
        ...state,
        customSections: state.customSections.filter((section) => section.id !== action.id),
      };

    case "renameCustomSection":
      return {
        ...state,
        customSections: state.customSections.map((section) =>
          section.id === action.id ? { ...section, title: { fr: action.title } } : section,
        ),
      };

    case "customEntry":
      return mapCustom(state, action.sectionId, (entries) =>
        entries.map((entry) =>
          entry.id === action.entryId ? { ...entry, ...action.patch, provenance: "user" } : entry,
        ),
      );

    case "customEntryBullets": {
      const bullets = action.value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map(fromPlain);
      return mapCustom(state, action.sectionId, (entries) =>
        entries.map((entry) =>
          entry.id === action.entryId
            ? { ...entry, bullets: bullets.length > 0 ? { fr: bullets } : undefined }
            : entry,
        ),
      );
    }

    case "removeCustomEntry":
      return mapCustom(state, action.sectionId, (entries) =>
        entries.filter((entry) => entry.id !== action.entryId),
      );

    case "duplicateCustomEntry":
      return mapCustom(state, action.sectionId, (entries) => {
        const index = entries.findIndex((entry) => entry.id === action.entryId);
        if (index < 0) return entries;
        const next = [...entries];
        next.splice(index + 1, 0, {
          ...entries[index]!,
          id: `ce_${Date.now().toString(36)}`,
        });
        return next;
      });

    case "reorderCustomEntries":
      return mapCustom(state, action.sectionId, (entries) => {
        const byId = new Map(entries.map((entry) => [entry.id, entry]));
        const next = action.ids.map((id) => byId.get(id)).filter(Boolean);
        return next.length === entries.length ? (next as typeof entries) : entries;
      });

    case "addCustomEntry":
      return {
        ...state,
        customSections: state.customSections.map((section) =>
          section.id === action.sectionId
            ? {
                ...section,
                entries: [
                  ...section.entries,
                  {
                    id: `ce_${Date.now().toString(36)}`,
                    provenance: "user" as const,
                    title: { fr: "Nouvel élément" },
                  },
                ],
              }
            : section,
        ),
      };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSection(state: CVData, section: ListSection, fn: (item: any) => any): CVData {
  return { ...state, [section]: state[section].map(fn) };
}

/**
 * Convertit un bloc typé en entrée générique.
 *
 * La conversion est explicite pour chaque type : on choisit ce qui devient le
 * titre, ce qui devient le sous-titre, et on conserve la période et les puces
 * quand elles existent. Rien n'est deviné, rien n'est perdu en silence.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGenericEntry(section: ListSection, source: any): CustomEntry | null {
  const id = `ce_${Date.now().toString(36)}`;
  const base = { id, provenance: "user" as const };

  switch (section) {
    case "experiences":
      return {
        ...base,
        title: source.role,
        subtitle: { fr: [source.organization, source.location?.city].filter(Boolean).join(" · ") },
        ...(source.period ? { period: source.period } : {}),
        ...(source.bullets ? { bullets: source.bullets } : {}),
      };

    case "education":
      return {
        ...base,
        title: source.degree,
        subtitle: { fr: [source.institution, source.location?.city].filter(Boolean).join(" · ") },
        ...(source.period ? { period: source.period } : {}),
        ...(source.bullets ? { bullets: source.bullets } : {}),
      };

    case "certifications":
      return {
        ...base,
        title: source.name,
        ...(source.issuer ? { subtitle: { fr: source.issuer } } : {}),
      };

    case "languages":
      return { ...base, title: source.name, subtitle: { fr: String(source.level ?? "") } };

    case "interests":
      return {
        ...base,
        title: source.label,
        ...(source.text ? { bullets: { fr: [source.text.fr ?? []] } } : {}),
      };

    default:
      return null;
  }
}

/** Applique une transformation aux entrées d'une section personnalisée. */
function mapCustom(
  state: CVData,
  sectionId: string,
  fn: (entries: CVData["customSections"][number]["entries"]) => CVData["customSections"][number]["entries"],
): CVData {
  return {
    ...state,
    customSections: state.customSections.map((section) =>
      section.id === sectionId ? { ...section, entries: fn(section.entries) } : section,
    ),
  };
}

const BLANKS: Record<ListSection, (id: string) => Record<string, unknown>> = {
  experiences: (id) => ({
    id,
    provenance: "user",
    organization: "Organisation",
    logo: null,
    role: { fr: "Intitulé du poste" },
    period: { start: String(new Date().getFullYear()), end: null, current: true },
  }),
  education: (id) => ({
    id,
    provenance: "user",
    institution: "Établissement",
    logo: null,
    degree: { fr: "Diplôme" },
    period: { start: String(new Date().getFullYear()), end: null, current: true },
  }),
  languages: (id) => ({ id, provenance: "user", name: { fr: "Langue" }, level: "B1" }),
  interests: (id) => ({ id, provenance: "user", label: { fr: "Rubrique" } }),
  certifications: (id) => ({
    id,
    provenance: "user",
    issuer: "Organisme",
    name: { fr: "Certification" },
    logo: null,
    expires: null,
  }),
};

/* ── Composant ─────────────────────────────────────────────────────────── */

export type Vue = "interactif" | "pdf" | "latex";

const VIEWS: Array<{ id: Vue; label: string }> = [
  { id: "interactif", label: "Interactif" },
  { id: "pdf", label: "PDF A4" },
  { id: "latex", label: "PDF ATS" },
];

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

const STATUS: Record<SaveState, string> = {
  idle: "Aucune modification",
  dirty: "Modifications non enregistrées",
  saving: "Enregistrement…",
  saved: "Enregistré",
  error: "Échec de l'enregistrement",
  conflict: "Modifié ailleurs — rechargez",
};

export function Studio({ initial, vue }: { initial: CVDocument; vue: Vue }) {
  const [data, dispatch] = useReducer(reducer, initial.data);
  const [presentation, setPresentation] = useState<Presentation>(initial.presentation);
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedRevision, setSavedRevision] = useState(initial.meta.revision);
  const revision = useRef(initial.meta.revision);
  const frame = useRef<HTMLIFrameElement>(null);
  const first = useRef(true);

  const [view, setView] = useState<Vue>(vue);
  const [tex, setTex] = useState<string | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "working" | "error">("idle");
  const [pdfError, setPdfError] = useState<string | null>(null);

  const locale = initial.locales.primary;
  const t = useCallback(
    <T,>(v: Localized<T> | undefined): T | undefined => v?.[locale] ?? v?.fr ?? v?.en,
    [locale],
  );

  const save = useCallback(async () => {
    setState("saving");
    try {
      const response = await fetch(`/api/cv/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: revision.current, data, presentation }),
      });

      if (response.status === 409) {
        setState("conflict");
        return;
      }
      if (!response.ok) {
        setState("error");
        return;
      }

      const body = (await response.json()) as { revision: number; updatedAt: string };
      revision.current = body.revision;
      setSavedRevision(body.revision);
      setSavedAt(new Date(body.updatedAt).toLocaleTimeString("fr-FR"));
      setState("saved");
      // L'aperçu recharge la page publique réelle, pas une simulation.
      frame.current?.contentWindow?.location.reload();
    } catch {
      setState("error");
    }
  }, [data, presentation, initial.id]);

  // Autosave debounce. Le prototype écrivait dans localStorage sans try/catch
  // et dépassait le quota de 5 Mo à chaque frappe, en silence.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setState("dirty");
    const timer = setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
  }, [data, presentation, save]);

  // Avertit avant de quitter avec des modifications en attente.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (state === "dirty" || state === "saving") event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state]);

  useEffect(() => {
    if (view !== "latex") return;
    let cancelled = false;
    void fetch(`/api/cv/${initial.id}/export/latex?inline=1`)
      .then((response) => response.text())
      .then((text) => {
        if (!cancelled) setTex(text);
      })
      .catch(() => {
        if (!cancelled) setTex("Source indisponible.");
      });
    return () => {
      cancelled = true;
    };
  }, [view, initial.id, savedAt]);

  const downloadPdf = useCallback(async (kind: "pdf" | "ats" = "pdf") => {
    setPdfState("working");
    setPdfError(null);
    try {
      const response = await fetch(`/api/cv/${initial.id}/export/${kind}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { hint?: string } | null;
        setPdfError(body?.hint ?? "Le rendu PDF a échoué.");
        setPdfState("error");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cv-${data.personal.lastName || "profil"}${kind === "ats" ? "-ats" : ""}.pdf`.toLowerCase();
      // Les contrôles voyagent dans les en-têtes : extraction ATS d'un côté,
      // ajustement à une page de l'autre.
      if (kind === "ats") {
        if (response.headers.get("X-Ats-Valid") === "false") {
          setPdfError(
            `PDF généré, mais ${response.headers.get("X-Ats-Missing")} information(s) ne sont pas extractibles. Vérifiez le contenu.`,
          );
        } else if (Number(response.headers.get("X-Ats-Pages") ?? 1) > 1) {
          setPdfError(
            "Le contenu ne tient pas sur une page, même au réglage le plus dense. Réduisez le nombre de puces ou masquez une section.",
          );
        }
      } else if (response.headers.get("X-Fit-Overflow") === "true") {
        setPdfError(
          `Mise en page réduite à ${Math.round(Number(response.headers.get("X-Fit-Scale") ?? 1) * 100)} % : le contenu dépasse encore une page. Réduisez-le pour tenir sur une seule.`,
        );
      }
      link.click();
      URL.revokeObjectURL(url);
      setPdfState("idle");
    } catch {
      setPdfError("Le rendu PDF a échoué.");
      setPdfState("error");
    }
  }, [initial.id, data.personal.lastName]);

  // Cibles de transfert : uniquement les sections personnalisées, qui
  // accueillent des entrées génériques sans conversion hasardeuse.
  const customTargets = useMemo(
    () =>
      data.customSections.map((section) => ({
        id: section.id,
        label: t(section.title) ?? "Section",
      })),
    [data.customSections, t],
  );

  const statusLabel = useMemo(
    () => (state === "saved" && savedAt ? `Enregistré à ${savedAt}` : STATUS[state]),
    [state, savedAt],
  );

  return (
    <div className="app-shell">
      <header className="app-bar">
        <a className="app-brand" href="/">
          <span className="app-brand__mark" aria-hidden="true" />
          <span>
            {data.personal.firstName} {data.personal.lastName} <small>studio</small>
          </span>
        </a>
        <span
          className="status"
          data-state={
            state === "saving" ? "saving" : state === "error" || state === "conflict" ? "error" : "idle"
          }
          role="status"
          aria-live="polite"
        >
          {statusLabel}
        </span>
        <span className="app-spacer" />

        <div className="segmented" role="tablist" aria-label="Format affiché">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={view === item.id}
              data-active={view === item.id}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {view === "pdf" ? (
          <button
            className="btn btn--primary"
            type="button"
            disabled={pdfState === "working" || state === "saving"}
            onClick={() => void downloadPdf("pdf")}
          >
            {pdfState === "working" ? "Rendu…" : "Télécharger le PDF"}
          </button>
        ) : view === "latex" ? (
          <button
            className="btn btn--primary"
            type="button"
            disabled={pdfState === "working" || state === "saving"}
            onClick={() => void downloadPdf("ats")}
          >
            {pdfState === "working" ? "Compilation…" : "Télécharger le PDF ATS"}
          </button>
        ) : (
          <a className="btn btn--primary" href={`/api/cv/${initial.id}/export/html`}>
            Télécharger le HTML
          </a>
        )}
      </header>

      <div className="editor">
        <div className="editor__panel">
          <DensityPanel
            docId={initial.id}
            data={data}
            presentation={presentation}
            locale={locale}
            revision={savedRevision}
          />

          {state === "conflict" && (
            <p className="warnings">
              Ce CV a été modifié dans un autre onglet. Rechargez la page pour récupérer la
              dernière version — vos modifications en cours ne sont pas encore enregistrées.
            </p>
          )}

          <details className="group" open>
            <summary>Sections · organisation</summary>
            <div className="group__body">
              <SectionManager
                data={data}
                presentation={presentation}
                onChange={(sections) => setPresentation((p) => ({ ...p, sections }))}
                onAddCustom={(title) => {
                  const id = `cus_${Date.now().toString(36)}`;
                  dispatch({ type: "addCustomSection", id, title });
                  setPresentation((p) => ({
                    ...p,
                    sections: [
                      ...p.sections,
                      { key: `custom:${id}`, visible: true, column: "main" as const },
                    ],
                  }));
                }}
                onDeleteCustom={(customId) => {
                  dispatch({ type: "removeCustomSection", id: customId });
                  setPresentation((p) => ({
                    ...p,
                    sections: p.sections.filter((entry) => entry.key !== `custom:${customId}`),
                  }));
                }}
              />
            </div>
          </details>

          <details className="group">
            <summary>Apparence</summary>
            <div className="group__body">
              <AppearancePanel
                presentation={presentation}
                onChange={(changes) => setPresentation((p) => ({ ...p, ...changes }))}
              />
            </div>
          </details>

          <details className="group" open>
            <summary>Identité</summary>
            <div className="group__body">
              <div className="row">
                <Field
                  label="Prénom"
                  value={data.personal.firstName}
                  onChange={(v) => dispatch({ type: "personal", field: "firstName", value: v })}
                />
                <Field
                  label="Nom"
                  value={data.personal.lastName}
                  onChange={(v) => dispatch({ type: "personal", field: "lastName", value: v })}
                />
              </div>
              <Field
                label="Accroche"
                value={t(data.personal.headline) ?? ""}
                onChange={(v) => dispatch({ type: "headline", value: v })}
              />
              <div className="row">
                <Field
                  label="E-mail"
                  value={data.personal.email ?? ""}
                  onChange={(v) =>
                    dispatch({ type: "personal", field: "email", value: v || undefined })
                  }
                />
                <Field
                  label="Téléphone"
                  value={data.personal.phone ?? ""}
                  onChange={(v) =>
                    dispatch({ type: "personal", field: "phone", value: v || undefined })
                  }
                />
              </div>
              <PhotoEditor
                docId={initial.id}
                photo={data.personal.photo}
                onChange={(photo) => dispatch({ type: "personal", field: "photo", value: photo })}
              />
              <Field
                label="Ville"
                value={data.personal.location?.city ?? ""}
                onChange={(v) =>
                  dispatch({
                    type: "personal",
                    field: "location",
                    value: { ...data.personal.location, city: v },
                  })
                }
              />
            </div>
          </details>

          <details className="group" open>
            <summary>Expériences · {data.experiences.length}</summary>
            <div className="group__body">
              <BlockList
                section="experiences"
                ids={data.experiences.map((entry) => entry.id)}
                dispatch={dispatch}
              >
                {(id, handle) => {
                  const entry = data.experiences.find((item) => item.id === id);
                  if (!entry) return null;
                  return (
                    <ExperienceCard
                      entry={entry}
                      locale={locale}
                      dispatch={dispatch}
                      t={t}
                      docId={initial.id}
                      handle={handle}
                      targets={customTargets}
                    />
                  );
                }}
              </BlockList>
              <AddButton onClick={() => dispatch({ type: "add", section: "experiences" })}>
                Ajouter une expérience
              </AddButton>
            </div>
          </details>

          <details className="group">
            <summary>Formations · {data.education.length}</summary>
            <div className="group__body">
              <BlockList section="education" ids={data.education.map((item) => item.id)} dispatch={dispatch}>
              {(blockId, handle) => {
                const entry = data.education.find((item) => item.id === blockId);
                if (!entry) return null;
                return (
                <article className="card">
                  <CardHead
                    title={t(entry.degree) ?? "Formation"}
                    section="education"
                    id={entry.id}
                    dispatch={dispatch}
                  />
                  <Field
                    label="Diplôme"
                    value={t(entry.degree) ?? ""}
                    onChange={(v) =>
                      dispatch({ type: "localized", section: "education", id: entry.id, field: "degree", value: v })
                    }
                  />
                  <Field
                    label="Établissement"
                    value={entry.institution}
                    onChange={(v) =>
                      dispatch({ type: "entry", section: "education", id: entry.id, patch: { institution: v } })
                    }
                  />
                  <PeriodFields
                    period={entry.period}
                    onChange={(period) =>
                      dispatch({ type: "entry", section: "education", id: entry.id, patch: { period } })
                    }
                  />
                  <Field
                    label="Mention"
                    value={t(entry.distinction) ?? ""}
                    onChange={(v) =>
                      dispatch({
                        type: "entry",
                        section: "education",
                        id: entry.id,
                        patch: { distinction: v ? { fr: v } : undefined },
                      })
                    }
                  />
                </article>
                );
              }}
              </BlockList>
              <AddButton onClick={() => dispatch({ type: "add", section: "education" })}>
                Ajouter une formation
              </AddButton>
            </div>
          </details>

          <details className="group">
            <summary>Langues · {data.languages.length}</summary>
            <div className="group__body">
              <BlockList section="languages" ids={data.languages.map((item) => item.id)} dispatch={dispatch}>
              {(blockId, handle) => {
                const lang = data.languages.find((item) => item.id === blockId);
                if (!lang) return null;
                return (
                <article className="card">
                  <CardHead
                    title={t(lang.name) ?? "Langue"}
                    section="languages"
                    id={lang.id}
                    dispatch={dispatch}
                  />
                  <div className="row">
                    <Field
                      label="Langue"
                      value={t(lang.name) ?? ""}
                      onChange={(v) =>
                        dispatch({ type: "localized", section: "languages", id: lang.id, field: "name", value: v })
                      }
                    />
                    <div className="field">
                      <label htmlFor={`lvl-${lang.id}`}>Niveau</label>
                      <select
                        id={`lvl-${lang.id}`}
                        value={lang.level}
                        onChange={(e) =>
                          dispatch({
                            type: "entry",
                            section: "languages",
                            id: lang.id,
                            patch: { level: e.target.value },
                          })
                        }
                        style={{
                          padding: ".44rem .6rem",
                          borderRadius: 7,
                          border: "1px solid var(--app-bd)",
                          background: "var(--app-bg)",
                        }}
                      >
                        {["A1", "A2", "B1", "B2", "C1", "C2", "native"].map((level) => (
                          <option key={level} value={level}>
                            {level === "native" ? "Langue maternelle" : level}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </article>
                );
              }}
              </BlockList>
              <AddButton onClick={() => dispatch({ type: "add", section: "languages" })}>
                Ajouter une langue
              </AddButton>
            </div>
          </details>

          <details className="group">
            <summary>Centres d&apos;intérêt · {data.interests.length}</summary>
            <div className="group__body">
              <BlockList section="interests" ids={data.interests.map((item) => item.id)} dispatch={dispatch}>
              {(blockId, handle) => {
                const interest = data.interests.find((item) => item.id === blockId);
                if (!interest) return null;
                return (
                <article className="card">
                  <CardHead
                    title={t(interest.label) ?? "Rubrique"}
                    section="interests"
                    id={interest.id}
                    dispatch={dispatch}
                  />
                  <div className="row">
                    <Field
                      label="Pictogramme"
                      value={interest.icon ?? ""}
                      onChange={(v) =>
                        dispatch({
                          type: "entry",
                          section: "interests",
                          id: interest.id,
                          patch: { icon: v || undefined },
                        })
                      }
                    />
                    <Field
                      label="Libellé"
                      value={t(interest.label) ?? ""}
                      onChange={(v) =>
                        dispatch({ type: "localized", section: "interests", id: interest.id, field: "label", value: v })
                      }
                    />
                  </div>
                  <Field
                    label="Texte"
                    multiline
                    value={richToText(t(interest.text))}
                    onChange={(v) =>
                      dispatch({
                        type: "entry",
                        section: "interests",
                        id: interest.id,
                        patch: { text: v ? { fr: fromPlain(v) } : undefined },
                      })
                    }
                  />
                </article>
                );
              }}
              </BlockList>
              <AddButton onClick={() => dispatch({ type: "add", section: "interests" })}>
                Ajouter une rubrique
              </AddButton>
            </div>
          </details>

          {data.customSections.map((section) => (
            <details className="group" key={section.id} open>
              <summary>
                {t(section.title) ?? "Section"} · {section.entries.length}
              </summary>
              <div className="group__body">
                <Field
                  label="Titre de la section"
                  value={t(section.title) ?? ""}
                  onChange={(value) =>
                    dispatch({ type: "renameCustomSection", id: section.id, title: value })
                  }
                />

                <CustomEntries section={section} dispatch={dispatch} t={t} />

                <AddButton onClick={() => dispatch({ type: "addCustomEntry", sectionId: section.id })}>
                  Ajouter un élément
                </AddButton>
              </div>
            </details>
          ))}

          <p className="hint">
            Le pictogramme est stocké séparément du libellé : les exports PDF et LaTeX
            peuvent l&apos;omettre sans amputer le texte.
          </p>
        </div>

        <div className="editor__preview" data-view={view}>
          {view === "latex" ? (
            <div className="tex">
              <div className="tex__bar">
                <span>cv.tex</span>
                <span className="tex__hint">
                  Source interne · le téléchargement produit un PDF compilé, dont
                  l&apos;extraction est vérifiée
                </span>
              </div>
              <pre className="tex__body">{tex ?? "Chargement de la source…"}</pre>
            </div>
          ) : (
            <>
              <iframe
                ref={frame}
                src={view === "pdf" ? `/render/print/${initial.id}` : `/cv/${initial.id}`}
                title={view === "pdf" ? "Aperçu A4" : "Aperçu du CV interactif"}
                loading="eager"
              />
              {pdfError && <p className="preview__error">{pdfError}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sous-composants ───────────────────────────────────────────────────── */

function ExperienceCard({
  entry,
  locale,
  dispatch,
  t,
  docId,
  handle,
  targets,
}: {
  entry: Experience;
  locale: Locale;
  dispatch: React.Dispatch<Action>;
  t: <T>(v: Localized<T> | undefined) => T | undefined;
  docId: string;
  handle: Record<string, unknown>;
  targets: Array<{ id: string; label: string }>;
}) {
  return (
    <article className="card">
      <CardHead
        title={t(entry.role) ?? "Expérience"}
        section="experiences"
        id={entry.id}
        dispatch={dispatch}
        handle={handle}
        targets={targets}
      />
      <div className="card__logo">
        <LogoPicker
          docId={docId}
          logo={entry.logo}
          onChange={(logo) =>
            dispatch({ type: "entry", section: "experiences", id: entry.id, patch: { logo } })
          }
        />
        <span className="hint" style={{ margin: 0 }}>Logo de l&apos;organisation</span>
      </div>
      <Field
        label="Poste"
        value={t(entry.role) ?? ""}
        onChange={(v) =>
          dispatch({ type: "localized", section: "experiences", id: entry.id, field: "role", value: v })
        }
      />
      <div className="row">
        <Field
          label="Organisation"
          value={entry.organization}
          onChange={(v) =>
            dispatch({ type: "entry", section: "experiences", id: entry.id, patch: { organization: v } })
          }
        />
        <Field
          label="Ville"
          value={entry.location?.city ?? ""}
          onChange={(v) =>
            dispatch({
              type: "entry",
              section: "experiences",
              id: entry.id,
              patch: { location: v ? { ...entry.location, city: v } : undefined },
            })
          }
        />
      </div>
      <PeriodFields
        period={entry.period}
        onChange={(period) =>
          dispatch({ type: "entry", section: "experiences", id: entry.id, patch: { period } })
        }
      />
      <Field
        label="Réalisations — une par ligne"
        multiline
        value={(t(entry.bullets) ?? []).map(toPlain).join("\n")}
        onChange={(v) => dispatch({ type: "bullets", id: entry.id, value: v })}
      />
      <p className="hint">
        Locale active : {locale}. Chaque ligne devient une puce structurée, identique dans
        les trois formats.
      </p>
    </article>
  );
}

function PeriodFields({
  period,
  onChange,
}: {
  period: { start: string; end: string | null; current: boolean };
  onChange: (period: { start: string; end: string | null; current: boolean }) => void;
}) {
  return (
    <>
      <div className="row">
        <Field
          label="Début (AAAA ou AAAA-MM)"
          value={period.start}
          onChange={(v) => onChange({ ...period, start: v || period.start })}
        />
        <Field
          label="Fin"
          value={period.end ?? ""}
          disabled={period.current}
          onChange={(v) => onChange({ ...period, end: v || null })}
        />
      </div>
      <label style={{ display: "flex", gap: ".4rem", alignItems: "center", fontSize: ".76rem", marginBottom: ".5rem" }}>
        <input
          type="checkbox"
          checked={period.current}
          onChange={(e) =>
            onChange({ ...period, current: e.target.checked, end: e.target.checked ? null : period.end })
          }
        />
        En cours
      </label>
    </>
  );
}

/**
 * En-tête d'un bloc.
 *
 * Poignée à gauche, actions à droite : dupliquer et supprimer. Les flèches ont
 * disparu au profit du glisser-déposer, mais la poignée reste actionnable au
 * clavier — flèches haut et bas — pour ne pas perdre l'accessibilité.
 */
function CardHead({
  title,
  section,
  id,
  dispatch,
  handle,
  targets = [],
}: {
  title: string;
  section: ListSection;
  id: string;
  dispatch: React.Dispatch<Action>;
  handle?: Record<string, unknown>;
  /** Sections personnalisées vers lesquelles ce bloc peut être transféré. */
  targets?: Array<{ id: string; label: string }>;
}) {
  return (
    <div className="card__head">
      <span className="card__grip" {...handle}>
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
          {[4, 8, 12].map((y) =>
            [5, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />),
          )}
        </svg>
      </span>
      <span className="card__title">{title}</span>
      {targets.length > 0 && (
        <select
          className="card__move"
          value=""
          aria-label="Déplacer vers une section"
          title="Déplacer vers une section personnalisée"
          onChange={(event) => {
            const sectionId = event.target.value;
            if (sectionId) dispatch({ type: "moveToCustom", section, id, sectionId });
          }}
        >
          <option value="">⇥</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.label}
            </option>
          ))}
        </select>
      )}
      <button
        className="icon-btn"
        type="button"
        aria-label="Dupliquer"
        onClick={() => dispatch({ type: "duplicate", section, id })}
      >
        ⧉
      </button>
      <button
        className="icon-btn"
        type="button"
        data-danger=""
        aria-label="Supprimer"
        onClick={() => dispatch({ type: "remove", section, id })}
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Liste de blocs réordonnables.
 *
 * Un seul composant sert toutes les sections : expériences, formations,
 * langues, centres d'intérêt. Le glisser-déposer et les actions sont donc
 * identiques partout, ce qui rend la manipulation prévisible.
 */
function BlockList({
  section,
  ids,
  dispatch,
  children,
}: {
  section: ListSection;
  ids: string[];
  dispatch: React.Dispatch<Action>;
  children: (id: string, handle: Record<string, unknown>) => React.ReactNode;
}) {
  const { handleProps, itemProps, state } = useSortable({
    ids,
    onReorder: (from, to) => {
      const reordered = moveItem(ids, from, to);
      dispatch({ type: "reorder", section, ids: reordered });
    },
  });

  return (
    <div className="blocks" data-dragging={state.activeId !== null}>
      {ids.map((id) => (
        <div key={id} className="block" {...itemProps(id)}>
          {children(id, handleProps(id) as unknown as Record<string, unknown>)}
        </div>
      ))}
    </div>
  );
}

/**
 * Entrées d'une section personnalisée.
 *
 * Même ergonomie que les sections standards — poignée, duplication,
 * suppression, réordonnancement — pour qu'une section créée par l'utilisateur
 * ne soit pas un citoyen de seconde zone.
 */
function CustomEntries({
  section,
  dispatch,
  t,
}: {
  section: CVData["customSections"][number];
  dispatch: React.Dispatch<Action>;
  t: <T>(v: Localized<T> | undefined) => T | undefined;
}) {
  const ids = section.entries.map((entry) => entry.id);
  const { handleProps, itemProps } = useSortable({
    ids,
    onReorder: (from, to) =>
      dispatch({
        type: "reorderCustomEntries",
        sectionId: section.id,
        ids: moveItem(ids, from, to),
      }),
  });

  return (
    <div className="blocks">
      {section.entries.map((entry) => (
        <div key={entry.id} className="block" {...itemProps(entry.id)}>
          <article className="card">
            <div className="card__head">
              <span className="card__grip" {...handleProps(entry.id)}>
                <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
                  {[4, 8, 12].map((y) =>
                    [5, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />),
                  )}
                </svg>
              </span>
              <span className="card__title">{t(entry.title) ?? "Élément"}</span>
              <button
                className="icon-btn"
                type="button"
                aria-label="Dupliquer"
                onClick={() =>
                  dispatch({ type: "duplicateCustomEntry", sectionId: section.id, entryId: entry.id })
                }
              >
                ⧉
              </button>
              <button
                className="icon-btn"
                type="button"
                data-danger=""
                aria-label="Supprimer"
                onClick={() =>
                  dispatch({ type: "removeCustomEntry", sectionId: section.id, entryId: entry.id })
                }
              >
                ✕
              </button>
            </div>

            <Field
              label="Titre"
              value={t(entry.title) ?? ""}
              onChange={(value) =>
                dispatch({
                  type: "customEntry",
                  sectionId: section.id,
                  entryId: entry.id,
                  patch: { title: { fr: value } },
                })
              }
            />
            <Field
              label="Sous-titre"
              value={t(entry.subtitle) ?? ""}
              onChange={(value) =>
                dispatch({
                  type: "customEntry",
                  sectionId: section.id,
                  entryId: entry.id,
                  patch: { subtitle: value ? { fr: value } : undefined },
                })
              }
            />
            <Field
              label="Détails — une ligne par puce"
              multiline
              value={(t(entry.bullets) ?? []).map(toPlain).join("\n")}
              onChange={(value) =>
                dispatch({
                  type: "customEntryBullets",
                  sectionId: section.id,
                  entryId: entry.id,
                  value,
                })
              }
            />
          </article>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}-${useId()}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} type="text" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="btn" type="button" onClick={onClick} style={{ width: "100%", justifyContent: "center" }}>
      + {children}
    </button>
  );
}

function richToText(nodes: RichText | undefined): string {
  return nodes ? toPlain(nodes) : "";
}

let idCounter = 0;
function useId(): string {
  const ref = useRef<string>("");
  if (!ref.current) {
    idCounter += 1;
    ref.current = String(idCounter);
  }
  return ref.current;
}
