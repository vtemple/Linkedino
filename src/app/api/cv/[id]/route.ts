import { NextResponse } from "next/server";
import { z } from "zod";

import { repository } from "../../../../lib/storage/repo";
import { CVDataSchema, PresentationSchema } from "../../../../domain/cv/schema";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  expectedRevision: z.number().int().nonnegative(),
  data: CVDataSchema.optional(),
  presentation: PresentationSchema.optional(),
});

/**
 * Autosave.
 *
 * Le client envoie la révision qu'il croit détenir. Si le serveur a bougé
 * entre-temps, on répond 409 avec le document courant plutôt que d'écraser
 * en silence — la sauvegarde du prototype, elle, échouait sans un mot.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const parsed = PatchBody.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Corps de requête invalide.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { expectedRevision, ...changes } = parsed.data;
  const result = await repository.patch(id, changes, expectedRevision);

  if (result.ok) {
    return NextResponse.json({
      revision: result.document.meta.revision,
      updatedAt: result.document.meta.updatedAt,
    });
  }

  if (result.reason === "not_found") {
    return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
  }
  if (result.reason === "conflict") {
    const current = await repository.get(id);
    return NextResponse.json(
      { error: "Le CV a été modifié ailleurs.", document: current },
      { status: 409 },
    );
  }
  return NextResponse.json({ error: result.detail ?? "Document invalide." }, { status: 422 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const doc = await repository.get((await params).id);
  if (!doc) return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
  return NextResponse.json(doc);
}
