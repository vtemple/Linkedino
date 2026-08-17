import { NextResponse } from "next/server";

import { repository } from "../../../../../lib/storage/repo";
import { measureFit } from "../../../../../lib/pdf/render";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Mesure réelle de l'encombrement.
 *
 * Ouvre la page d'impression dans Chromium et mesure la hauteur du document,
 * exactement comme le fait l'export PDF — c'est le même code. L'estimation
 * affichée dans le studio n'est donc pas une extrapolation parallèle, mais le
 * verdict du moteur qui produira le fichier.
 *
 * Le studio s'en sert pour affiner son estimation locale, qui reste
 * instantanée pendant la frappe.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await repository.get(id))) {
    return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
  }

  try {
    const origin = new URL(request.url).origin;
    const fit = await measureFit(`${origin}/render/print/${id}`);
    return NextResponse.json(fit, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Chromium indisponible : le studio conserve son estimation locale.
    return NextResponse.json({ available: false }, { status: 200 });
  }
}
