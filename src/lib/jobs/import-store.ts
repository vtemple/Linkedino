/**
 * Travaux d'import.
 *
 * L'instantané LinkedIn ne se constitue pas d'un coup : certains domaines
 * arrivent avant d'autres. Plutôt que de faire patienter devant un écran vide,
 * on ouvre le studio dès que l'identité et les postes sont là, et on complète
 * ensuite — chaque domaine qui arrive devient une révision de plus du CV.
 *
 * Le jeton d'accès ne quitte jamais le serveur et est effacé dès la fin du
 * travail : il n'a aucune raison de survivre à l'import.
 */

import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

import type { DomainStatus } from "../importers/linkedin/portability";
import type { DomainKey } from "../importers/types";
import type { NormalizeWarning } from "../normalize";

const JOB_DIR = join(process.cwd(), ".data", "jobs");

export type JobStatus =
  | "created"
  | "authorizing"
  | "fetching"
  | "partial"
  | "ready"
  | "error";

export interface ImportJob {
  id: string;
  status: JobStatus;
  mode: "live" | "demo";
  cvId: string | null;
  domains: Partial<Record<DomainKey, DomainStatus>>;
  warnings: NormalizeWarning[];
  gaps: string[];
  coverage: Record<string, number>;
  ticks: number;
  error?: string;
  /** Éphémère : supprimé dès que le travail atteint `ready` ou `error`. */
  accessToken?: string;
  extras?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

function path(id: string): string {
  return join(JOB_DIR, `${id.replace(/[^a-zA-Z0-9_-]/g, "")}.json`);
}

export async function createJob(mode: "live" | "demo"): Promise<ImportJob> {
  await mkdir(JOB_DIR, { recursive: true });
  const now = new Date().toISOString();

  const job: ImportJob = {
    id: `job_${randomBytes(8).toString("hex")}`,
    status: "created",
    mode,
    cvId: null,
    domains: {},
    warnings: [],
    gaps: [],
    coverage: {},
    ticks: 0,
    createdAt: now,
    updatedAt: now,
  };

  await saveJob(job);
  return job;
}

export async function getJob(id: string): Promise<ImportJob | null> {
  const file = path(id);
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, "utf8")) as ImportJob;
}

export async function saveJob(job: ImportJob): Promise<ImportJob> {
  await mkdir(JOB_DIR, { recursive: true });
  const next = { ...job, updatedAt: new Date().toISOString() };
  await writeFile(path(job.id), JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Le jeton est retiré du disque dès qu'il n'a plus d'usage. */
export async function discardToken(job: ImportJob): Promise<ImportJob> {
  if (!job.accessToken) return job;
  const { accessToken: _discarded, ...rest } = job;
  return saveJob(rest as ImportJob);
}

export async function deleteJob(id: string): Promise<void> {
  const file = path(id);
  if (existsSync(file)) await unlink(file);
}

/** Vue publique : ce que le client peut voir, jeton exclu. */
export function toPublicJob(job: ImportJob): Omit<ImportJob, "accessToken"> {
  const { accessToken: _hidden, ...rest } = job;
  return rest;
}
