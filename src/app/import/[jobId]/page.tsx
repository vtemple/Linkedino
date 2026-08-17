import { notFound } from "next/navigation";

import { getJob, toPublicJob } from "../../../lib/jobs/import-store";
import { ImportProgress } from "./ImportProgress";

export const dynamic = "force-dynamic";

export default async function ImportPage({ params }: { params: Promise<{ jobId: string }> }) {
  const job = await getJob((await params).jobId);
  if (!job) notFound();
  return <ImportProgress initial={toPublicJob(job)} />;
}
