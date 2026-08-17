import { NextResponse } from "next/server";

import {
  ArchiveError,
  PdfImportError,
  UnsupportedFileError,
  importFromFile,
} from "../../../../lib/profiles/provision";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 60 * 1024 * 1024;

/**
 * Import par fichier — PDF de profil ou archive ZIP.
 *
 * Les deux sources convergent vers le même normaliseur et produisent le même
 * CVData ; rien en aval ne sait de laquelle vient le CV.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Fichier trop volumineux (${Math.round(file.size / 1048576)} Mo, maximum 60 Mo).` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await importFromFile(buffer);
    return NextResponse.json({
      cvId: result.document.id,
      source: result.source,
      coverage: result.coverage,
      gaps: result.gaps,
      warnings: result.warnings.slice(0, 20),
      detail: result.detail,
    });
  } catch (error) {
    if (
      error instanceof ArchiveError ||
      error instanceof PdfImportError ||
      error instanceof UnsupportedFileError
    ) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
