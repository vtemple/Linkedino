import { NextResponse } from "next/server";

import { repository, ASSET_DIR } from "../../../../../lib/storage/repo";
import { FileSystemAssetStore, processImage } from "../../../../../lib/assets/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Téléversement d'image — photo de profil ou logo d'entrée.
 *
 * Passe par le pipeline d'assets existant : redimensionnement, variantes
 * WebP et PNG, déduplication par hachage du contenu. Une photo de 4 Mo sortie
 * d'un téléphone devient quelques dizaines de kilo-octets.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await repository.get(id))) {
    return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const role = form?.get("role") === "logo" ? "logo" : "photo";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image trop lourde (12 Mo maximum)." }, { status: 413 });
  }

  try {
    const store = new FileSystemAssetStore(ASSET_DIR, "/assets");
    const result = await processImage(Buffer.from(await file.arrayBuffer()), store, {
      role,
      path: `${id}.${role}`,
    });

    return NextResponse.json({
      asset: result.asset,
      bytesBefore: result.bytesBefore,
      bytesAfter: result.bytesAfter,
    });
  } catch {
    return NextResponse.json(
      { error: "Image illisible. Formats acceptés : JPEG, PNG, WebP." },
      { status: 422 },
    );
  }
}
