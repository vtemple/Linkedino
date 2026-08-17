/**
 * Exécuteur d'import.
 *
 * Une « sollicitation » (tick) récupère les domaines encore en attente, renormalise
 * l'ensemble et écrit le CV. Appelée en boucle par l'écran de progression, elle
 * fait apparaître le CV par paliers au lieu d'imposer une attente opaque.
 *
 * Le pipeline est strictement déterministe : mêmes entrées, même document.
 */

import { randomBytes } from "node:crypto";

import { CVDocumentSchema, type CVDocument } from "../../domain/cv/schema";
import { defaultSectionConfig } from "../../domain/cv/sections";
import { repository, ASSET_DIR, readLocalAsset } from "../storage/repo";
import { FileSystemAssetStore, processImage } from "../assets/pipeline";
import { normalizeLinkedInProfile } from "../importers/linkedin/normalizer";
import {
  fetchSnapshot,
  FixtureTransport,
  HttpPortabilityTransport,
  type LinkedInTransport,
} from "../importers/linkedin/portability";
import { CV_DOMAINS, mergeRawProfiles, type DomainKey, type RawProfile } from "../importers/types";
import { DEMO_SNAPSHOT, DEMO_READY_AFTER, DEMO_EXTRAS } from "../importers/linkedin/demo-snapshot";
import { getJob, saveJob, discardToken, type ImportJob } from "./import-store";

/** Domaines suffisants pour ouvrir le studio : au-delà, on complète en fond. */
const CORE_DOMAINS: DomainKey[] = ["PROFILE", "POSITIONS"];

const transports = new Map<string, LinkedInTransport>();

function transportFor(job: ImportJob): LinkedInTransport {
  const existing = transports.get(job.id);
  if (existing) return existing;

  const transport: LinkedInTransport =
    job.mode === "demo"
      ? new FixtureTransport(DEMO_SNAPSHOT, DEMO_READY_AFTER)
      : new HttpPortabilityTransport();

  transports.set(job.id, transport);
  return transport;
}

export async function tickJob(jobId: string): Promise<ImportJob | null> {
  const job = await getJob(jobId);
  if (!job) return null;
  if (job.status === "ready" || job.status === "error") return job;

  const pending = CV_DOMAINS.filter(
    (domain) => job.domains[domain] === undefined || job.domains[domain] === "pending",
  );

  if (pending.length === 0) {
    return finish(job);
  }

  try {
    const outcome = await fetchSnapshot(
      transportFor(job),
      job.accessToken ?? "demo",
      pending,
      job.extras as RawProfile["extras"],
    );

    const domains = { ...job.domains, ...outcome.statuses };

    // On renormalise tout à chaque passe : le normaliseur est pur, donc
    // rejouer l'ensemble coûte moins cher qu'une fusion incrémentale fragile.
    const known = await collectSections(job, outcome.profile);
    const normalized = normalizeLinkedInProfile(known);

    const photo = await resolvePhoto(job);
    if (photo) normalized.data.personal.photo = photo;

    const hasCore = CORE_DOMAINS.every(
      (domain) => domains[domain] === "ok" || domains[domain] === "empty",
    );

    let cvId = job.cvId;
    if (hasCore) {
      cvId = await upsertDocument(job, normalized.data, cvId);
    }

    const stillPending = CV_DOMAINS.some((domain) => domains[domain] === "pending");
    const ticks = job.ticks + 1;

    // Filet : au bout de 12 passes, on livre ce qu'on a plutôt que de boucler.
    const exhausted = ticks >= 12;

    const next: ImportJob = {
      ...job,
      cvId,
      domains,
      ticks,
      warnings: normalized.warnings,
      gaps: normalized.gaps,
      coverage: Object.fromEntries(
        Object.entries(normalized.coverage).map(([name, value]) => [name, value.filled]),
      ),
      status:
        stillPending && !exhausted ? (hasCore ? "partial" : "fetching") : hasCore ? "ready" : "error",
      ...(!hasCore && exhausted
        ? { error: "LinkedIn n'a pas livré les domaines essentiels dans le délai imparti." }
        : {}),
    };

    await cacheSections(job.id, known);
    const saved = await saveJob(next);
    return saved.status === "ready" || saved.status === "error"
      ? discardToken(saved)
      : saved;
  } catch (error) {
    const failed = await saveJob({
      ...job,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    return discardToken(failed);
  }
}

async function finish(job: ImportJob): Promise<ImportJob> {
  const done = await saveJob({ ...job, status: job.cvId ? "ready" : "error" });
  return discardToken(done);
}

/* ── Accumulation des sections entre deux passes ───────────────────────── */

const sectionCache = new Map<string, RawProfile>();

async function collectSections(job: ImportJob, incoming: RawProfile): Promise<RawProfile> {
  const previous = sectionCache.get(job.id);
  return previous ? mergeRawProfiles([incoming, previous]) : incoming;
}

async function cacheSections(jobId: string, profile: RawProfile): Promise<void> {
  sectionCache.set(jobId, profile);
}

/* ── Photo de profil ───────────────────────────────────────────────────── */

/**
 * La photo ne vient pas de l'API de portabilité — le domaine PROFILE ne
 * l'expose pas. Elle provient du jeton OpenID Connect (`picture`), demandé
 * dans le même consentement.
 */
async function resolvePhoto(job: ImportJob): Promise<CVDocument["data"]["personal"]["photo"]> {
  const url = job.extras?.["pictureUrl"];
  if (!url) return null;

  try {
    let buffer: Buffer | null = null;

    if (url.startsWith("/assets/")) {
      const local = await readLocalAsset(url);
      buffer = local?.body ?? null;
    } else if (/^https:\/\//.test(url)) {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) buffer = Buffer.from(await response.arrayBuffer());
    }

    if (!buffer) return null;

    const store = new FileSystemAssetStore(ASSET_DIR, "/assets");
    const result = await processImage(buffer, store, { role: "photo", path: "personal.photo" });
    return result.asset;
  } catch {
    return null;
  }
}

/* ── Écriture du document ──────────────────────────────────────────────── */

async function upsertDocument(
  job: ImportJob,
  data: CVDocument["data"],
  existingId: string | null,
): Promise<string> {
  const now = new Date().toISOString();

  if (existingId) {
    const current = await repository.get(existingId);
    if (current) {
      await repository.patch(existingId, { data }, current.meta.revision);
      return existingId;
    }
  }

  const id = `cv_${randomBytes(6).toString("hex")}`;
  const document = CVDocumentSchema.parse({
    schemaVersion: 1,
    id,
    locales: { primary: "fr", available: ["fr"] },
    data,
    presentation: {
      templateId: "duo",
      theme: "dark",
      density: "normal",
      sections: defaultSectionConfig(),
    },
    meta: { createdAt: now, updatedAt: now, revision: 0 },
  });

  await repository.save(document);
  void job;
  return id;
}
