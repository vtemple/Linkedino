# Noyau déterministe, SaaS de génération de CV

Étapes 1 à 4 de la feuille de route : modèle de données, import du prototype,
renderer LaTeX. Aucun LLM, aucun appel réseau, aucun aléa.

## Installation

```bash
npm install
npm test          # 54 tests
npm run typecheck # TypeScript strict, 0 erreur
```

## Migrer le prototype

```bash
npx tsx scripts/import-legacy.ts chemin/vers/outil-edition-cv.html out
```

Produit `out/cv.json`, `out/assets/`, `out/latex/` et `out/rapport.txt`.

## Arborescence

```
src/domain/cv/          schéma Zod, texte riche, dates — n'importe que `zod`
src/lib/normalize/      règles de normalisation déterministes
src/lib/importers/      ProfileImporter : prototype HTML implémenté
src/lib/assets/         data URI → variantes WebP/PNG/JPEG dédupliquées
src/lib/renderers/latex renderer ATS, linéaire, sobre
```

## Règle de dépendance

`src/domain/` n'importe rien d'autre que `zod`. À câbler dans ESLint
(`eslint-plugin-boundaries`) pour que toute violation casse le build.

## Reste à faire

Renderers HTML et PDF (React + Playwright), persistance Postgres, éditeur,
importers LinkedIn archive et PDF.

## Parcours LinkedIn

```
Landing → [Connecter mon LinkedIn] → OAuth (consentement LinkedIn)
        → Member Snapshot API (domaine par domaine)
        → normaliseur partagé → CVData → Studio → HTML / PDF / LaTeX
```

### Configuration

```bash
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_REDIRECT_URI=https://votre-domaine/api/auth/linkedin/callback
LINKEDIN_SCOPES="openid profile email r_dma_portability_3rd_party"
OAUTH_STATE_SECRET=...            # aléatoire, 32+ octets
CHROMIUM_PATH=/chemin/vers/chromium
```

Sans `LINKEDIN_CLIENT_ID`, le parcours bascule sur un transport de
démonstration : mêmes routes, même normaliseur, même exécuteur — seule la
source des lignes change.

### Ajouter une source

Implémenter un transport ou un importeur produisant des `RawSection`
(`{ domain, rows }`). Le normaliseur, le studio et les exports ne changent pas.

| Source | État |
|---|---|
| `linkedin-portability` (API DMA) | implémenté |
| `linkedin-archive` (ZIP) | interface prête |
| `linkedin-pdf` | interface prête |
| `manual` | studio |

## Sources de profil

| Source | Portée | Fiabilité | État |
|---|---|---|---|
| API DMA (`r_dma_portability_3rd_party`) | EEE + Suisse | haute | code écrit, **non testé en réel** |
| Archive ZIP | mondiale | haute | testé |
| PDF de profil | mondiale | faible | testé, refuse les PDF non conformes |
| Saisie manuelle | mondiale | totale | studio |

Toutes produisent des `RawSection` → même normaliseur → même `CVData` → mêmes
renderers. Voir `docs/linkedin-access-request.md` pour la demande d'accès.

## Données de test

`npx tsx --tsconfig tsconfig.scripts.json scripts/reset-demo.ts` purge le
stockage local et régénère l'unique asset de test — un visuel marqué « profil
fictif ». Aucune photographie de personne réelle n'est présente dans le dépôt.

## Déploiement

**Lire `docs/deploiement.md` avant de déployer.** Trois fonctions du produit —
stockage, compilation LaTeX, rendu Chromium — ne peuvent pas s'exécuter sur une
plateforme de fonctions serverless. Le `Dockerfile` fourni embarque Chromium et
TeX Live : c'est le chemin le plus court vers un déploiement complet.

```bash
docker build -t cv-saas .
docker run -p 3000:3000 -v cv-data:/app/.data cv-saas
```
