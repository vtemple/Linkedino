import { NextResponse } from "next/server";

import { readLocalAsset } from "../../../lib/storage/repo";

/** Sert les variantes d'images générées par le pipeline d'assets. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const asset = await readLocalAsset(`/assets/${path.join("/")}`);
  if (!asset) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(asset.body), {
    headers: {
      "Content-Type": asset.mime,
      // Les clés d'objet sont dérivées du hachage du contenu : immuable.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
