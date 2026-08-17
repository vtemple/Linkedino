"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * Replis d'import.
 *
 * Proposés quand l'API de portabilité n'est pas ouverte au membre — hors EEE et
 * Suisse — ou quand elle échoue. L'ordre reflète la fiabilité réelle des
 * sources : l'archive est un format de données, le PDF une mise en page.
 */

type State = "idle" | "busy" | "error";

export function FallbackImport({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File): Promise<void> {
    setState("busy");
    setMessage(`Lecture de ${file.name}…`);

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch("/api/import/upload", { method: "POST", body });
      const payload = (await response.json()) as {
        cvId?: string;
        error?: string;
        source?: string;
      };

      if (!response.ok || !payload.cvId) {
        setState("error");
        setMessage(payload.error ?? "L'import a échoué.");
        return;
      }

      router.push(`/generation/${payload.cvId}`);
    } catch {
      setState("error");
      setMessage("L'import a échoué. Réessayez ou saisissez votre CV manuellement.");
    }
  }

  return (
    <section className={compact ? "fallback fallback--compact" : "fallback"}>

      <div
        className="drop"
        data-state={state}
        data-dragging={dragging}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void upload(file);
        }}
      >
        <input
          ref={input}
          type="file"
          accept=".pdf,application/pdf,.zip,application/zip"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />

        <p className="drop__title">
          {state === "busy" ? "Analyse en cours…" : "Déposez votre PDF LinkedIn"}
        </p>
        <button
          className="btn"
          type="button"
          disabled={state === "busy"}
          onClick={() => input.current?.click()}
        >
          Choisir un fichier
        </button>

        {message && (
          <p className="drop__message" data-tone={state === "error" ? "error" : "info"}>
            {message}
          </p>
        )}
      </div>

      <ol className="howto">
        <li>
          <strong>PDF du profil — le plus rapide.</strong> Ouvrez votre profil LinkedIn,
          bouton <em>Plus</em> → <em>Enregistrer au format PDF</em>. Immédiat, trois clics.
        </li>
        <li>
          <strong>Archive ZIP — la plus complète.</strong> Réglages et confidentialité →
          Confidentialité des données → Obtenir une copie de vos données. Elle contient
          aussi votre photo, et arrive en général en moins de dix minutes.
        </li>
      </ol>
    </section>
  );
}
