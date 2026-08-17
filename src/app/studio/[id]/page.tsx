import { notFound } from "next/navigation";

import { repository } from "../../../lib/storage/repo";
import { Studio, type Vue } from "./Studio";

export const dynamic = "force-dynamic";

const VUES: Vue[] = ["interactif", "pdf", "latex"];

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vue?: string }>;
}) {
  const doc = await repository.get((await params).id);
  if (!doc) notFound();

  const requested = (await searchParams).vue as Vue | undefined;
  const vue = requested && VUES.includes(requested) ? requested : "interactif";

  return <Studio initial={doc} vue={vue} />;
}
