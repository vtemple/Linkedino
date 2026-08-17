import { notFound } from "next/navigation";

import { CVDuoPrint, printStyles } from "../../../../templates/duo/print/CVDuoPrint";
import { duoTokens } from "../../../../templates/duo/tokens";
import { repository } from "../../../../lib/storage/repo";

export const dynamic = "force-dynamic";

/**
 * Route interne visitée par Playwright pour produire le PDF.
 *
 * Elle rend les mêmes données que la page publique, avec le shell d'impression
 * et sa feuille de style. Elle est aussi directement consultable au navigateur
 * pour vérifier la mise en page A4 sans lancer d'export.
 */
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ density?: string }>;
}) {
  const doc = await repository.get((await params).id);
  if (!doc) notFound();

  const override = (await searchParams).density;
  const key = (override ?? doc.presentation.density) as keyof typeof duoTokens.density;
  const density = duoTokens.density[key] ?? 1;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: printStyles(duoTokens, density) }} />
      {/* Simule la feuille A4 à l'écran pour l'aperçu du studio. Ces règles
          disparaissent à l'impression : Chromium n'applique que @media print. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@media screen{
            body{background:#3A3B3F;padding:20px 10px}
            .pg-sheet{width:210mm;min-height:297mm;margin:0 auto;padding:13mm;
              background:var(--bg);box-shadow:0 10px 44px rgba(0,0,0,.45);border-radius:2px}
          }`,
        }}
      />
      <CVDuoPrint doc={doc} />
      <div id="print-ready" data-ready="1" style={{ display: "none" }} />
    </>
  );
}
