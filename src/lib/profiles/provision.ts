/**
 * Approvisionnement d'un profil.
 *
 * Point d'entrée unique pour transformer un fichier LinkedIn en CV enregistré
 * sous un identifiant d'URL. Partagé par la ligne de commande et par la route
 * de téléversement, pour qu'il n'existe qu'un seul chemin de données.
 */

import { randomBytes } from "node:crypto";

import { CVDocumentSchema, type CVDocument } from "../../domain/cv/schema";
import { defaultSectionConfig } from "../../domain/cv/sections";
import { repository, ASSET_DIR } from "../storage/repo";
import { FileSystemAssetStore, processImage } from "../assets/pipeline";
import { normalizeLinkedInProfile } from "../importers/linkedin/normalizer";
import { ArchiveError, readLinkedInArchive } from "../importers/linkedin/archive";
import { PdfImportError, readLinkedInPdf } from "../importers/linkedin/pdf";
import type { NormalizeWarning } from "../normalize";
import type { ProfileSourceId } from "../importers/types";

export interface ImportResult {
  document: CVDocument;
  source: ProfileSourceId;
  coverage: Record<string, number>;
  gaps: string[];
  warnings: NormalizeWarning[];
  detail: Record<string, unknown>;
}

export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFileError";
  }
}

/**
 * Transforme un fichier LinkedIn — archive ZIP ou PDF de profil — en CVData
 * enregistré. Point d'entrée unique des deux importeurs : ils convergent vers
 * le même normaliseur, donc vers le même document.
 */
export async function importFromFile(buffer: Buffer): Promise<ImportResult> {
  const isZip = buffer.subarray(0, 2).toString("latin1") === "PK";
  const isPdf = buffer.subarray(0, 5).toString("latin1") === "%PDF-";

  if (!isZip && !isPdf) {
    throw new UnsupportedFileError(
      "Format non reconnu. Déposez l'archive ZIP LinkedIn ou le PDF de votre profil.",
    );
  }

  const store = new FileSystemAssetStore(ASSET_DIR, "/assets");
  let photoAsset: CVDocument["data"]["personal"]["photo"] = null;
  let detail: Record<string, unknown>;
  let rawProfile;

  if (isZip) {
    const report = await readLinkedInArchive(buffer);
    rawProfile = report.profile;
    detail = { matched: report.matched, ignored: report.ignored.length };

    if (report.photo) {
      try {
        const processed = await processImage(report.photo.bytes, store, {
          role: "photo",
          path: "personal.photo",
        });
        photoAsset = processed.asset;
      } catch {
        // Une photo illisible ne doit pas faire échouer tout l'import.
        detail = { ...detail, photoIgnoree: report.photo.name };
      }
    }
  } else {
    const report = await readLinkedInPdf(buffer);
    rawProfile = report.profile;
    detail = { confidence: report.confidence, unassigned: report.unassigned.length };
  }

  const normalized = normalizeLinkedInProfile(rawProfile);
  if (photoAsset) normalized.data.personal.photo = photoAsset;

  const now = new Date().toISOString();
  const id = `cv_${randomBytes(6).toString("hex")}`;

  const document = CVDocumentSchema.parse({
    schemaVersion: 1,
    id,
    locales: { primary: "fr", available: ["fr"] },
    data: normalized.data,
    presentation: {
      templateId: "duo",
      theme: "dark",
      density: "normal",
      sections: defaultSectionConfig(),
    },
    meta: { createdAt: now, updatedAt: now, revision: 0 },
  });

  await repository.save(document);

  const displayName =
    `${document.data.personal.firstName} ${document.data.personal.lastName}`.trim();
  const headline = document.data.personal.headline?.fr;

  return {
    document,
    source: rawProfile.source,
    coverage: Object.fromEntries(
      Object.entries(normalized.coverage).map(([name, value]) => [name, value.filled]),
    ),
    gaps: normalized.gaps,
    warnings: normalized.warnings,
    detail,
  };
}

export { ArchiveError, PdfImportError };
