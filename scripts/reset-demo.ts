/**
 * Réinitialise le jeu de démonstration.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/reset-demo.ts
 *
 * Supprime tous les CV et assets stockés localement, puis régénère l'unique
 * asset de test : un visuel neutre marqué « profil fictif ». Aucune photo de
 * personne réelle ne subsiste dans le dépôt ni dans le stockage.
 *
 * À n'exécuter que sur un environnement de développement.
 */

import { readdir, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { ASSET_DIR } from "../src/lib/storage/repo";
import { FileSystemAssetStore } from "../src/lib/assets/pipeline";
import { createPlaceholderPhoto } from "../src/lib/assets/placeholder";

const DATA_DIR = join(process.cwd(), ".data");

async function main(): Promise<void> {
  if (process.env["NODE_ENV"] === "production") {
    console.error("Refus : ce script ne doit pas tourner en production.");
    process.exit(1);
  }

  for (const dir of ["cv", "versions", "jobs", "assets"]) {
    const target = join(DATA_DIR, dir);
    if (existsSync(target)) {
      const before = (await readdir(target)).length;
      await rm(target, { recursive: true, force: true });
      console.log(`supprimé  ${dir}/ (${before} entrées)`);
    }
  }

  await mkdir(ASSET_DIR, { recursive: true });
  const store = new FileSystemAssetStore(ASSET_DIR, "/assets");
  const asset = await createPlaceholderPhoto(store, "PN");

  await writeFile(
    join(ASSET_DIR, "LISEZMOI.txt"),
    "Assets de développement.\n" +
      "L'image de profil présente ici est générée par scripts/reset-demo.ts.\n" +
      "Elle est fictive et ne représente aucune personne réelle.\n",
    "utf8",
  );

  console.log(`\nasset de test : ${asset.url}`);
  console.log(`variantes     : ${Object.keys(asset.variants).length}`);
  console.log("\nÀ reporter dans src/lib/importers/linkedin/demo-snapshot.ts :");
  console.log(`  pictureUrl: "${asset.url}"`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
