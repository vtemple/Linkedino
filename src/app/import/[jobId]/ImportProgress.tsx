"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Écran d'import.
 *
 * Il montre l'état réel de chaque domaine LinkedIn, parce que l'instantané ne
 * se constitue pas d'un coup : l'identité et les postes arrivent d'abord, le
 * reste suit. Dès que l'essentiel est là, le studio devient accessible — on
 * n'attend pas les domaines lents pour commencer à travailler.
 */

interface PublicJob {
  id: string;
  status: "created" | "authorizing" | "fetching" | "partial" | "ready" | "error";
  mode: "live" | "demo";
  cvId: string | null;
  domains: Record<string, "pending" | "ok" | "empty" | "error">;
  gaps: string[];
  coverage: Record<string, number>;
  warnings: Array<{ message: string }>;
  error?: string;
}

const DOMAIN_LABELS: Record<string, string> = {
  PROFILE: "Identité",
  EMAIL_ADDRESSES: "Adresse e-mail",
  PHONE_NUMBERS: "Téléphone",
  POSITIONS: "Expériences",
  EDUCATION: "Formations",
  SKILLS: "Compétences",
  LANGUAGES: "Langues",
  CERTIFICATIONS: "Certifications",
  PROJECTS: "Projets",
  COURSES: "Cours",
  HONORS: "Distinctions",
  PUBLICATIONS: "Publications",
  VOLUNTEERING_EXPERIENCES: "Bénévolat",
};

const ORDER = Object.keys(DOMAIN_LABELS);

export function ImportProgress({ initial }: { initial: PublicJob }) {
  const router = useRouter();
  const [job, setJob] = useState<PublicJob>(initial);
  const [autoOpen, setAutoOpen] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (job.status === "ready" || job.status === "error") return;

    timer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/import/${job.id}`, { cache: "no-store" });
        if (response.ok) setJob((await response.json()) as PublicJob);
      } catch {
        /* la passe suivante réessaiera */
      }
    }, 700);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [job]);

  useEffect(() => {
    if (job.status === "ready" && job.cvId && autoOpen) {
      const redirect = setTimeout(() => router.push(`/studio/${job.cvId}`), 600);
      return () => clearTimeout(redirect);
    }
    return undefined;
  }, [job.status, job.cvId, autoOpen, router]);

  const done = ORDER.filter((d) => job.domains[d] === "ok" || job.domains[d] === "empty").length;
  const percent = Math.round((done / ORDER.length) * 100);

  return (
    <main className="pipeline">
      <div className="pipeline__inner pipeline__inner--wide">
        <p className="hero__eyebrow">
          {job.mode === "demo" ? "Import · profil de démonstration" : "Import LinkedIn"}
        </p>
        <h1 className="pipeline__title">Récupération de vos données</h1>

        <div className="gauge" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <span className="gauge__fill" style={{ width: `${percent}%` }} />
        </div>

        <ul className="domains">
          {ORDER.map((domain) => {
            const status = job.domains[domain] ?? "waiting";
            const count = coverageFor(domain, job.coverage);
            return (
              <li key={domain} data-status={status}>
                <span className="domains__mark" aria-hidden="true" />
                <span className="domains__label">{DOMAIN_LABELS[domain]}</span>
                <span className="domains__value">
                  {status === "ok" && count !== null ? `${count} élément${count > 1 ? "s" : ""}` : null}
                  {status === "ok" && count === null ? "reçu" : null}
                  {status === "empty" ? "vide" : null}
                  {status === "pending" ? "en préparation" : null}
                  {status === "error" ? "indisponible" : null}
                </span>
              </li>
            );
          })}
        </ul>

        {job.cvId && job.status !== "ready" && (
          <div className="ready-banner">
            <p>
              L&apos;essentiel est déjà là. Vous pouvez commencer à travailler pendant que le
              reste se complète.
            </p>
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => {
                setAutoOpen(false);
                router.push(`/studio/${job.cvId}`);
              }}
            >
              Ouvrir le studio
            </button>
          </div>
        )}

        {job.status === "error" && (
          <div className="warnings">
            <strong>L&apos;import n&apos;a pas abouti.</strong>
            <p>{job.error ?? "Aucun domaine exploitable n'a été retourné."}</p>
            <p>
              Vous pouvez à la place déposer votre archive LinkedIn ou votre profil en PDF
              depuis le studio.
            </p>
          </div>
        )}

        {job.gaps.length > 0 && (job.status === "ready" || job.status === "partial") && (
          <div className="gaps">
            <p className="gaps__title">Ce que LinkedIn ne fournit pas</p>
            <ul>
              {job.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="pipeline__foot">
          Données obtenues par API officielle, sur votre consentement. Aucun modèle de
          langage, aucune lecture de session, aucune collecte automatisée de pages.
        </p>
      </div>
    </main>
  );
}

const COVERAGE_KEYS: Record<string, string> = {
  POSITIONS: "experiences",
  EDUCATION: "education",
  SKILLS: "skills",
  LANGUAGES: "languages",
  CERTIFICATIONS: "certifications",
  PROJECTS: "projects",
  VOLUNTEERING_EXPERIENCES: "interests",
};

function coverageFor(domain: string, coverage: Record<string, number>): number | null {
  const mapped = COVERAGE_KEYS[domain];
  if (!mapped) return null;
  return coverage[mapped] ?? null;
}
