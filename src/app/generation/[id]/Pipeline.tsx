"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Étape « récupération → normalisation → CVData → génération ».
 *
 * Cet écran montre le pipeline réel plutôt qu'une barre de progression
 * décorative : chaque ligne correspond à une étape qui existe dans le code.
 * C'est aussi l'endroit où l'absence de modèle de langage se voit — on annonce
 * un nombre d'entrées vérifiable, pas une « analyse intelligente ».
 */

interface Counts {
  experiences: number;
  education: number;
  languages: number;
  certifications: number;
  interests: number;
}

const DESTINATION: Record<string, string> = {
  interactif: "interactif",
  pdf: "pdf",
  latex: "latex",
};

export function Pipeline({
  id,
  format,
  name,
  counts,
}: {
  id: string;
  format: string;
  name: string;
  counts: Counts;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const total =
    counts.experiences + counts.education + counts.languages + counts.certifications;

  const steps = [
    { label: "Profil identifié", detail: name },
    { label: "Lecture des données", detail: `${total} entrées` },
    { label: "Normalisation", detail: "Dates ISO · contacts séparés · contrats extraits" },
    {
      label: "CVData",
      detail: `${counts.experiences} expériences · ${counts.education} formations · ${counts.languages} langues`,
    },
    { label: "Rendu", detail: "HTML · PDF · LaTeX depuis la même source" },
  ];

  useEffect(() => {
    if (step >= steps.length) {
      const timer = setTimeout(
        () => router.push(`/studio/${id}?vue=${DESTINATION[format] ?? "interactif"}`),
        280,
      );
      return () => clearTimeout(timer);
    }
    // Cadence courte : la génération est réellement instantanée, l'écran ne
    // sert qu'à rendre le pipeline lisible, pas à masquer une attente.
    const timer = setTimeout(() => setStep((value) => value + 1), step === 0 ? 150 : 190);
    return () => clearTimeout(timer);
  }, [step, steps.length, router, id, format]);

  return (
    <main className="pipeline">
      <div className="pipeline__inner">
        <p className="hero__eyebrow">Génération en cours</p>
        <h1 className="pipeline__title">{name}</h1>

        <ol className="pipeline__steps">
          {steps.map((item, index) => (
            <li
              key={item.label}
              data-state={index < step ? "done" : index === step ? "active" : "todo"}
            >
              <span className="pipeline__mark" aria-hidden="true" />
              <span className="pipeline__label">{item.label}</span>
              <span className="pipeline__detail">{index <= step ? item.detail : ""}</span>
            </li>
          ))}
        </ol>

        <p className="pipeline__foot">
          Aucun modèle de langage n&apos;intervient. Deux générations du même profil
          produisent le même document, octet pour octet.
        </p>
      </div>
    </main>
  );
}
