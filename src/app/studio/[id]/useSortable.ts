"use client";

/**
 * Glisser-déposer par événements de pointeur.
 *
 * Écrit à la main plutôt qu'importé : les bibliothèques de DnD pèsent
 * 30 à 50 Ko pour un besoin qui tient en une liste réordonnable. Les
 * `PointerEvent` couvrent souris, tactile et stylet d'un seul jeu de
 * gestionnaires, et `setPointerCapture` évite de perdre le geste quand le
 * curseur sort de l'élément.
 *
 * Ergonomie visée : poignée visible au survol, translation immédiate des
 * voisins, aucune modale, aucun menu.
 */

import { useCallback, useRef, useState } from "react";

export interface DragState {
  /** Identifiant de l'élément saisi. */
  activeId: string | null;
  /** Index d'insertion visé. */
  overIndex: number | null;
}

export interface SortableOptions {
  ids: string[];
  onReorder: (from: number, to: number) => void;
  /** Seuil de déclenchement, pour ne pas confondre clic et glissement. */
  threshold?: number;
}

export interface SortableApi {
  state: DragState;
  /** À poser sur la poignée de déplacement. */
  handleProps: (id: string) => {
    onPointerDown: (event: React.PointerEvent) => void;
    role: string;
    tabIndex: number;
    "aria-label": string;
    onKeyDown: (event: React.KeyboardEvent) => void;
  };
  /** À poser sur l'élément déplaçable. */
  itemProps: (id: string) => {
    ref: (node: HTMLElement | null) => void;
    "data-dragging": boolean;
    "data-over": boolean;
  };
}

export function useSortable({ ids, onReorder, threshold = 4 }: SortableOptions): SortableApi {
  const [state, setState] = useState<DragState>({ activeId: null, overIndex: null });
  const nodes = useRef(new Map<string, HTMLElement>());
  const origin = useRef({ x: 0, y: 0 });
  const started = useRef(false);

  const itemProps = useCallback(
    (id: string) => ({
      ref: (node: HTMLElement | null) => {
        if (node) nodes.current.set(id, node);
        else nodes.current.delete(id);
      },
      "data-dragging": state.activeId === id,
      "data-over": state.overIndex !== null && ids[state.overIndex] === id,
    }),
    [state, ids],
  );

  const handleProps = useCallback(
    (id: string) => ({
      role: "button",
      tabIndex: 0,
      "aria-label": "Déplacer — flèches haut et bas au clavier",

      onKeyDown: (event: React.KeyboardEvent) => {
        // Accessibilité : le clavier doit permettre le même réordonnancement.
        const index = ids.indexOf(id);
        if (index < 0) return;
        if (event.key === "ArrowUp" && index > 0) {
          event.preventDefault();
          onReorder(index, index - 1);
        } else if (event.key === "ArrowDown" && index < ids.length - 1) {
          event.preventDefault();
          onReorder(index, index + 1);
        }
      },

      onPointerDown: (event: React.PointerEvent) => {
        if (event.button !== 0 && event.pointerType === "mouse") return;
        event.preventDefault();

        const startIndex = ids.indexOf(id);
        if (startIndex < 0) return;

        origin.current = { x: event.clientX, y: event.clientY };
        started.current = false;
        const target = event.currentTarget as HTMLElement;
        target.setPointerCapture(event.pointerId);

        let currentOver = startIndex;

        const move = (moveEvent: PointerEvent): void => {
          const dy = moveEvent.clientY - origin.current.y;
          const dx = moveEvent.clientX - origin.current.x;

          if (!started.current && Math.hypot(dx, dy) < threshold) return;
          if (!started.current) {
            started.current = true;
            setState({ activeId: id, overIndex: startIndex });
            document.body.style.cursor = "grabbing";
            document.body.style.userSelect = "none";
          }

          // Cible d'insertion : le voisin dont le centre est dépassé.
          let next = startIndex;
          ids.forEach((otherId, index) => {
            const node = nodes.current.get(otherId);
            if (!node) return;
            const rect = node.getBoundingClientRect();
            const middle = rect.top + rect.height / 2;
            if (moveEvent.clientY > middle) next = Math.max(next, index);
            if (moveEvent.clientY < middle) next = Math.min(next, index);
          });

          if (next !== currentOver) {
            currentOver = next;
            setState({ activeId: id, overIndex: next });
          }
        };

        const finish = (): void => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", finish);
          window.removeEventListener("pointercancel", finish);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";

          if (started.current && currentOver !== startIndex) {
            onReorder(startIndex, currentOver);
          }
          started.current = false;
          setState({ activeId: null, overIndex: null });
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", finish);
      },
    }),
    [ids, onReorder, threshold],
  );

  return { state, handleProps, itemProps };
}

/** Déplace un élément d'un tableau, sans le muter. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}
