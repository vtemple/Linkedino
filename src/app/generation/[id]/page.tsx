import { notFound, redirect } from "next/navigation";

import { repository } from "../../../lib/storage/repo";
import { Pipeline } from "./Pipeline";

export const dynamic = "force-dynamic";

const FORMATS = new Set(["interactif", "pdf", "latex"]);

export default async function GenerationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const { id } = await params;
  const doc = await repository.get(id);
  if (!doc) notFound();

  const requested = (await searchParams).format ?? "interactif";
  if (!FORMATS.has(requested)) redirect(`/generation/${id}?format=interactif`);

  const name = `${doc.data.personal.firstName} ${doc.data.personal.lastName}`.trim();

  return (
    <Pipeline
      id={id}
      format={requested}
      name={name}
      counts={{
        experiences: doc.data.experiences.length,
        education: doc.data.education.length,
        languages: doc.data.languages.length,
        certifications: doc.data.certifications.length,
        interests: doc.data.interests.length,
      }}
    />
  );
}
