"use client";

/**
 * Panneaux d'édition du studio.
 *
 * Regroupe ce qui pilote la *présentation* : organisation des sections,
 * apparence, cadrage de la photo. L'édition du contenu reste dans `Studio`.
 *
 * Toutes les modifications écrivent dans `CVData` ou `Presentation` ; rien
 * n'est stocké ailleurs, et l'aperçu se recharge sur le document enregistré.
 */

import { useRef, useState } from "react";

import { moveItem, useSortable } from "./useSortable";
import { DEFAULT_TITLES, resolveSections, type ResolvedSection } from "../../../domain/cv/sections";
import { FONT_PAIRS, PALETTE_LABELS, PALETTES } from "../../../templates/duo/tokens";
import type { AssetRef, CVData, CVDocument, Presentation } from "../../../domain/cv/types";

type SectionConfig = Presentation["sections"][number];

/* ── Organisation des sections ─────────────────────────────────────────── */

export function SectionManager({
  data,
  presentation,
  onChange,
  onAddCustom,
  onDeleteCustom,
}: {
  data: CVData;
  presentation: Presentation;
  onChange: (sections: SectionConfig[]) => void;
  onAddCustom: (title: string) => void;
  onDeleteCustom: (customId: string) => void;
}) {
  const resolved = resolveSections(data, presentation, "fr");
  const ids = resolved.map((section) => section.key);
  const [renaming, setRenaming] = useState<string | null>(null);

  // La configuration matérialisée : les sections implicites deviennent
  // explicites dès la première manipulation, sinon l'ordre ne tiendrait pas.
  const materialise = (): SectionConfig[] =>
    resolved.map((section) => ({
      key: section.key,
      visible: section.visible,
      column: section.column,
      ...(presentation.sections.find((entry) => entry.key === section.key)?.title
        ? { title: presentation.sections.find((entry) => entry.key === section.key)!.title }
        : {}),
    })) as SectionConfig[];

  const patch = (key: string, changes: Partial<SectionConfig>): void => {
    onChange(
      materialise().map((entry) => (entry.key === key ? { ...entry, ...changes } : entry)),
    );
  };

  const { state, handleProps, itemProps } = useSortable({
    ids,
    onReorder: (from, to) => onChange(moveItem(materialise(), from, to)),
  });

  return (
    <div className="sections">
      {resolved.map((section) => (
        <div
          className="srow"
          key={section.key}
          {...itemProps(section.key)}
          data-hidden={!section.visible}
        >
          <span className="srow__grip" {...handleProps(section.key)}>
            <GripIcon />
          </span>

          {renaming === section.key ? (
            <input
              className="srow__input"
              defaultValue={section.title}
              autoFocus
              onBlur={(event) => {
                const value = event.target.value.trim();
                patch(section.key, value ? { title: { fr: value } } : { title: undefined });
                setRenaming(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setRenaming(null);
              }}
            />
          ) : (
            <button
              className="srow__title"
              type="button"
              onClick={() => setRenaming(section.key)}
              title="Renommer"
            >
              {section.title}
              <span className="srow__count">{section.count}</span>
            </button>
          )}

          <button
            className="srow__col"
            type="button"
            title={section.column === "aside" ? "Déplacer dans le corps" : "Déplacer en bande latérale"}
            onClick={() =>
              patch(section.key, { column: section.column === "aside" ? "main" : "aside" })
            }
          >
            {section.column === "aside" ? "◧" : "◨"}
          </button>

          <button
            className="icon-btn"
            type="button"
            aria-label={section.visible ? "Masquer" : "Afficher"}
            data-active={section.visible}
            onClick={() => patch(section.key, { visible: !section.visible })}
          >
            {section.visible ? <EyeIcon /> : <EyeOffIcon />}
          </button>

          {section.customId && (
            <button
              className="icon-btn"
              type="button"
              data-danger=""
              aria-label="Supprimer la section"
              onClick={() => onDeleteCustom(section.customId!)}
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {state.activeId && <p className="hint">Relâchez pour déposer.</p>}

      <button
        className="btn"
        type="button"
        style={{ width: "100%", justifyContent: "center", marginTop: ".4rem" }}
        onClick={() => onAddCustom("Nouvelle section")}
      >
        + Section personnalisée
      </button>

      <p className="hint">
        Cliquez sur un intitulé pour le renommer. L&apos;œil masque une section sans
        supprimer ses données. ◧ / ◨ la déplace entre la bande latérale et le corps.
      </p>
    </div>
  );
}

/* ── Apparence ─────────────────────────────────────────────────────────── */

export function AppearancePanel({
  presentation,
  onChange,
}: {
  presentation: Presentation;
  onChange: (changes: Partial<Presentation>) => void;
}) {
  const palettes = Object.keys(PALETTES) as Array<keyof typeof PALETTES>;

  return (
    <div className="appearance">
      <p className="field-label">Palette</p>
      <div className="swatches">
        {palettes.map((id) => {
          const tone = PALETTES[id][presentation.theme === "dark" ? "dark" : "light"];
          return (
            <button
              key={id}
              type="button"
              className="swatch"
              data-active={presentation.palette === id && !presentation.accent}
              title={PALETTE_LABELS[id]}
              onClick={() => onChange({ palette: id, accent: undefined })}
            >
              <span style={{ background: tone.accent }} />
              <span style={{ background: tone.bg }} />
              {PALETTE_LABELS[id]}
            </button>
          );
        })}
      </div>

      <p className="field-label">Accent personnalisé</p>
      <div className="accent-row">
        <input
          type="color"
          value={presentation.accent ?? PALETTES[presentation.palette].dark.accent}
          onChange={(event) => onChange({ accent: event.target.value })}
          aria-label="Couleur d'accent"
        />
        <code>{presentation.accent ?? "palette"}</code>
        {presentation.accent && (
          <button className="linklike" type="button" onClick={() => onChange({ accent: undefined })}>
            réinitialiser
          </button>
        )}
      </div>

      <p className="field-label">Typographie</p>
      <div className="segmented segmented--wide">
        {(Object.keys(FONT_PAIRS) as Array<keyof typeof FONT_PAIRS>).map((id) => (
          <button
            key={id}
            type="button"
            data-active={presentation.fontPair === id}
            onClick={() => onChange({ fontPair: id })}
            style={{ fontFamily: FONT_PAIRS[id].display }}
          >
            {FONT_PAIRS[id].label}
          </button>
        ))}
      </div>

      <p className="field-label">Densité</p>
      <div className="segmented segmented--wide">
        {(["compact", "normal", "spacious"] as const).map((id) => (
          <button
            key={id}
            type="button"
            data-active={presentation.density === id}
            onClick={() => onChange({ density: id })}
          >
            {id === "compact" ? "Compacte" : id === "normal" ? "Normale" : "Aérée"}
          </button>
        ))}
      </div>

      <p className="field-label">Thème</p>
      <div className="segmented segmented--wide">
        {(["light", "dark"] as const).map((id) => (
          <button
            key={id}
            type="button"
            data-active={presentation.theme === id}
            onClick={() => onChange({ theme: id })}
          >
            {id === "light" ? "Clair" : "Sombre"}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Photo et cadrage ──────────────────────────────────────────────────── */

/**
 * Outil de cadrage.
 *
 * L'image est affichée dans un cadre au format du rendu ; on la déplace à la
 * souris ou au doigt et on l'agrandit à la molette ou au curseur. Ce qui est
 * enregistré n'est pas une image recadrée mais un point focal et un facteur
 * d'échelle : l'original reste intact et le cadrage se rejoue à l'identique
 * dans les trois formats.
 */
export function PhotoEditor({
  docId,
  photo,
  onChange,
}: {
  docId: string;
  photo: AssetRef | null;
  onChange: (photo: AssetRef | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const focal = photo?.focal ?? { x: 50, y: 50 };
  const zoom = (photo as (AssetRef & { zoom?: number }) | null)?.zoom ?? 1;

  async function upload(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    body.append("role", "photo");

    try {
      const response = await fetch(`/api/cv/${docId}/asset`, { method: "POST", body });
      const payload = (await response.json()) as { asset?: AssetRef; error?: string };
      if (!response.ok || !payload.asset) {
        setError(payload.error ?? "Import impossible.");
        return;
      }
      onChange(payload.asset);
    } catch {
      setError("Import impossible.");
    } finally {
      setBusy(false);
    }
  }

  function drag(event: React.PointerEvent): void {
    if (!photo || !frame.current) return;
    event.preventDefault();
    const rect = frame.current.getBoundingClientRect();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent): void => {
      const x = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      const y = ((moveEvent.clientY - rect.top) / rect.height) * 100;
      onChange({
        ...photo,
        focal: { x: clamp(x), y: clamp(y) },
      });
    };
    const stop = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <div className="photo-editor">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {photo ? (
        <>
          <div className="crop" ref={frame} onPointerDown={drag} data-busy={busy}>
            <img
              src={photo.url}
              alt="Cadrage de la photo"
              style={{
                objectPosition: `${focal.x}% ${focal.y}%`,
                transform: `scale(${zoom})`,
              }}
              draggable={false}
            />
            <span className="crop__hint">Glissez pour recadrer</span>
          </div>

          <label className="zoom">
            Zoom
            <input
              type="range"
              min="1"
              max="2.4"
              step="0.02"
              value={zoom}
              onChange={(event) =>
                onChange({ ...photo, zoom: Number(event.target.value) } as AssetRef)
              }
            />
          </label>

          <div className="photo-actions">
            <button className="btn" type="button" onClick={() => input.current?.click()}>
              Remplacer
            </button>
            <button className="btn" type="button" onClick={() => onChange(null)}>
              Supprimer
            </button>
          </div>
        </>
      ) : (
        <button
          className="btn"
          type="button"
          style={{ width: "100%", justifyContent: "center" }}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Traitement…" : "+ Importer une photo"}
        </button>
      )}

      {error && <p className="hint" style={{ color: "#F0A08C" }}>{error}</p>}
      <p className="hint">
        L&apos;image est redimensionnée et compressée automatiquement. Le cadrage est
        enregistré comme point focal : l&apos;original n&apos;est jamais rogné.
      </p>
    </div>
  );
}

/** Import de logo pour une entrée — expérience, formation, certification. */
export function LogoPicker({
  docId,
  logo,
  onChange,
}: {
  docId: string;
  logo: AssetRef | null;
  onChange: (logo: AssetRef | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File): Promise<void> {
    setBusy(true);
    const body = new FormData();
    body.append("file", file);
    body.append("role", "logo");
    try {
      const response = await fetch(`/api/cv/${docId}/asset`, { method: "POST", body });
      const payload = (await response.json()) as { asset?: AssetRef };
      if (payload.asset) onChange(payload.asset);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="logo-picker">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        className="logo-picker__slot"
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        title={logo ? "Remplacer le logo" : "Importer un logo"}
      >
        {logo ? <img src={logo.url} alt="" /> : <span>+</span>}
      </button>
      {logo && (
        <button className="linklike" type="button" onClick={() => onChange(null)}>
          retirer
        </button>
      )}
    </div>
  );
}

/* ── Icônes ────────────────────────────────────────────────────────────── */

function GripIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      {[4, 8, 12].map((y) =>
        [5, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.35" />),
      )}
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M2 2l12 12M6.2 6.3A2 2 0 008 10a2 2 0 001.7-1M3.5 4.6C2.2 5.7 1.5 8 1.5 8S4 12.5 8 12.5c1 0 1.9-.3 2.7-.7M13 10.2c1-1 1.5-2.2 1.5-2.2S12 3.5 8 3.5c-.4 0-.8 0-1.2.1" />
    </svg>
  );
}

export const DEFAULT_SECTION_TITLES = DEFAULT_TITLES;
export type { ResolvedSection, CVDocument };

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
