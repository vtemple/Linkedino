"use client";

/**
 * Panneau de densité.
 *
 * Affiche l'encombrement estimé du CV et des conseils contextuels. C'est un
 * indicateur, jamais une barrière : aucun bouton n'est désactivé, aucune
 * saisie n'est refusée, rien n'est tronqué. L'utilisateur reste libre
 * d'ignorer l'avis.
 *
 * Deux sources se complètent :
 *   - l'analyse locale, instantanée, recalculée à chaque frappe ;
 *   - la mesure réelle dans Chromium, appelée après enregistrement, qui
 *     confirme ou corrige l'estimation de pagination.
 */

import { useEffect, useState } from "react";

import { analyseDensity, type DensityLevel, type DensityReport } from "../../../domain/cv/density";
import type { CVData, Locale, Presentation } from "../../../domain/cv/types";

const LEVEL_LABEL: Record<DensityLevel, string> = {
  normal: "Bonne densité",
  attention: "CV dense",
  recommandation: "Lisibilité en baisse",
  critique: "Au-delà d'une page",
};

interface Measurement {
  available: boolean;
  scale?: number;
  overflow?: boolean;
  pages?: number;
}

export function DensityPanel({
  docId,
  data,
  presentation,
  locale,
  /** Change à chaque enregistrement : déclenche la mesure réelle. */
  revision,
}: {
  docId: string;
  data: CVData;
  presentation: Presentation;
  locale: Locale;
  revision: number;
}) {
  const report: DensityReport = analyseDensity(data, presentation, locale);
  const [measured, setMeasured] = useState<Measurement | null>(null);
  const [open, setOpen] = useState(false);

  // La mesure réelle coûte un aller-retour Chromium : on ne la demande
  // qu'après un enregistrement, pas à chaque caractère saisi.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetch(`/api/cv/${docId}/fit`)
        .then((response) => response.json())
        .then((payload: Measurement) => {
          if (!cancelled) setMeasured(payload);
        })
        .catch(() => {
          if (!cancelled) setMeasured({ available: false });
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [docId, revision]);

  // La mesure prime sur l'estimation quand elle est disponible.
  const pageEstimate =
    measured?.available && measured.pages !== undefined
      ? measured.overflow
        ? "plus d'une page"
        : measured.scale !== undefined && measured.scale < 0.995
          ? "une page, resserrée"
          : "une page"
      : report.pageEstimate;

  const count = report.advices.length;

  return (
    <section className="density" data-level={report.level}>
      <button
        className="density__head"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="density__dot" aria-hidden="true" />
        <span className="density__label">{LEVEL_LABEL[report.level]}</span>
        <span className="density__estimate">Estimation&nbsp;: {pageEstimate}</span>
        {count > 0 && <span className="density__badge">{count}</span>}
        <svg
          className="density__chev"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M4 6.5L8 10.5L12 6.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="density__gauge" role="presentation">
        <span
          className="density__fill"
          style={{ width: `${Math.min(100, report.fillRatio * 100).toFixed(1)}%` }}
        />
        <span className="density__limit" />
      </div>

      {open && (
        <div className="density__body">
          {count === 0 ? (
            <p className="density__ok">
              Rien à signaler. Le contenu tient confortablement sur une page.
            </p>
          ) : (
            <ul className="density__list">
              {report.advices.map((advice) => (
                <li key={advice.id} data-level={advice.level}>
                  {advice.message}
                </li>
              ))}
            </ul>
          )}

          <p className="density__counts">
            {report.counts.experiences} expériences · {report.counts.bullets} puces ·{" "}
            {report.counts.education} formations · {report.counts.skills} compétences ·{" "}
            {report.counts.certifications} certifications
          </p>

          <p className="density__note">
            Ce sont des conseils. Vous pouvez continuer à ajouter du contenu : rien n&apos;est
            supprimé ni raccourci automatiquement.
          </p>
        </div>
      )}
    </section>
  );
}
