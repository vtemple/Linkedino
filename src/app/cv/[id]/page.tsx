import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CVDuo } from "../../../templates/duo/screen/CVDuo";
import { screenStyles } from "../../../templates/duo/screen/styles";
import { screenRuntime } from "../../../templates/duo/screen/runtime";
import { duoTokens } from "../../../templates/duo/tokens";
import { repository } from "../../../lib/storage/repo";
import { resolveLocalized } from "../../../domain/cv/schema";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const doc = await repository.get((await params).id);
  if (!doc) return { title: "CV introuvable" };

  const name = `${doc.data.personal.firstName} ${doc.data.personal.lastName}`.trim();
  const headline = resolveLocalized(
    doc.data.personal.headline,
    doc.locales.primary,
    doc.locales.primary,
  );

  return {
    title: headline ? `${name} — ${headline}` : name,
    description: headline,
    openGraph: { type: "profile", title: name, description: headline },
  };
}

/**
 * Page publique du CV.
 *
 * Composant serveur : aucun JavaScript React n'est envoyé au navigateur. Le
 * seul script est le runtime du template, exactement celui que reçoit
 * l'export autonome — la page et le fichier téléchargé sont identiques.
 */
export default async function PublicCVPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const doc = await repository.get((await params).id);
  if (!doc) notFound();

  const density = duoTokens.density[doc.presentation.density];

  return (
    <>
      {/* Le thème choisi doit être posé avant la peinture, sinon la page
          s'affiche en clair puis bascule. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.setAttribute("data-theme", localStorage.getItem("cv-theme") || ${JSON.stringify(doc.presentation.theme)});`,
        }}
      />
      <style dangerouslySetInnerHTML={{ __html: screenStyles(duoTokens, density) }} />
      <CVDuo doc={doc} />
      <script dangerouslySetInnerHTML={{ __html: screenRuntime() }} />
    </>
  );
}
