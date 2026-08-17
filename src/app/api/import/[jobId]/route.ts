import { NextResponse } from "next/server";

import { getJob, toPublicJob } from "../../../../lib/jobs/import-store";
import { tickJob } from "../../../../lib/jobs/import-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Statut et avancement.
 *
 * Chaque appel fait progresser le travail d'une passe : le client scrute, le
 * CV se complète. Pas de file d'attente séparée à ce stade — le volume ne le
 * justifie pas, et l'interface `tickJob` se déplacera derrière un worker sans
 * changer le contrat.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const existing = await getJob(jobId);
  if (!existing) return NextResponse.json({ error: "Import introuvable." }, { status: 404 });

  const job = await tickJob(jobId);
  if (!job) return NextResponse.json({ error: "Import introuvable." }, { status: 404 });

  return NextResponse.json(toPublicJob(job), {
    headers: { "Cache-Control": "no-store" },
  });
}
