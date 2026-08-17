# Déploiement

## Résumé

Le dépôt est propre et prêt à être poussé. **En revanche, l'application telle
qu'elle est écrite ne peut pas fonctionner entièrement sur Netlify** : trois de
ses fonctions reposent sur des capacités que la plateforme n'offre pas.

Ce n'est pas un défaut de préparation du dépôt, c'est une inadéquation entre
l'architecture du produit et le modèle d'exécution de Netlify. Mieux vaut le
savoir avant le premier déploiement qu'après.

---

## Ce qui fonctionnera sur Netlify

- La page d'accueil et la page publique `/cv/[slug]`
- Le rendu du CV interactif et l'export HTML autonome
- Le studio, à l'affichage
- Les polices auto-hébergées, la mise en cache des assets

## Ce qui ne fonctionnera pas

### 1. Le stockage — blocage le plus grave

`FileCVRepository` écrit dans `process.cwd()/.data`. Sur Netlify, le système de
fichiers d'une fonction est **en lecture seule**, à l'exception de `/tmp`, qui
est éphémère et propre à chaque instance.

Conséquence concrète : **déposer un PDF échoue immédiatement**. Import,
autosave, téléversement d'image, travaux d'import — tout ce qui écrit est
inopérant. Le produit ne fait plus rien d'utile.

*Remédiation* : remplacer `FileCVRepository` par une implémentation Postgres
(Neon, Supabase) et `FileSystemAssetStore` par un stockage objet (Cloudflare R2,
S3). L'interface `CVRepository` a été conçue pour ça — c'est le corps des deux
classes qui change, pas le reste de l'application.

### 2. La compilation LaTeX

L'export ATS exécute `pdflatex`. Aucune distribution TeX n'est présente dans
l'image de build ni dans le runtime des fonctions Netlify, et rien ne permet de
l'y installer durablement.

*Remédiation* : déporter la compilation vers un service externe. Il n'y a pas de
contournement côté Netlify.

### 3. Le rendu PDF par Chromium

Deux obstacles indépendants :

- **La taille.** `@sparticuz/chromium` pèse environ 65 Mo. Les fonctions
  Netlify héritent de la limite AWS Lambda de 50 Mo compressés par bundle.
- **La durée.** Les fonctions synchrones Netlify sont coupées à 10 secondes.
  Un démarrage à froid de Chromium prend environ 12 secondes — mesuré sur ce
  projet. Le `maxDuration = 60` déclaré dans les routes n'a **aucun effet** sur
  Netlify ; c'est une directive Vercel.

Le mécanisme de navigateur maintenu chaud, qui ramène le rendu à 1,2 seconde en
local, ne s'applique pas non plus : chaque invocation de fonction peut atterrir
sur une instance neuve.

*Remédiation* : déporter le rendu vers un worker conteneurisé.

---

## Deux chemins

### A — Conteneur unique (recommandé)

Déployer l'application entière sur une plateforme qui exécute un conteneur :
**Fly.io**, **Railway** ou **Render**. Le `Dockerfile` fourni installe Chromium
et TeX Live ; tout fonctionne comme en local, sans réécrire une ligne.

C'est de loin le chemin le plus court vers un produit qui marche. Le stockage
sur fichiers reste utilisable au début avec un volume persistant, ce qui laisse
le temps de migrer vers Postgres sans urgence.

### B — Netlify + services externes

Garder Netlify pour le front et les routes légères, et sortir tout le reste :

| Besoin | Service |
|---|---|
| Base de données | Neon ou Supabase (Postgres) |
| Stockage d'images | Cloudflare R2 ou S3 |
| Rendu PDF + LaTeX | Worker conteneurisé (Fly.io, Railway) appelé en HTTP |

Plus de pièces, plus de configuration, et deux plateformes à surveiller. À
réserver au cas où Netlify est imposé par ailleurs.

---

## Avant le premier `git push`

```bash
# Vérifier que rien de sensible ne partirait
git init
git add -A
git status --short          # relire la liste
git ls-files | grep -iE "\.data|\.env$|Profile\.pdf"   # doit être vide
```

Points de vigilance :

- **`.data/` contient vos données personnelles** — les CV importés depuis votre
  PDF LinkedIn. Le répertoire est ignoré par `.gitignore` et a été supprimé,
  mais ne le forcez jamais avec `git add -f`.
- **Ne commitez jamais votre PDF LinkedIn.** La seule fixture du dépôt,
  `test/fixtures/linkedin-profile-synthetic.pdf`, est entièrement inventée et
  régénérable par `npm run make:fixture`.
- `.env.example` est versionné ; `.env` ne l'est pas.

## Variables d'environnement en production

À renseigner dans l'interface de la plateforme, jamais dans le dépôt :

```
CHROMIUM_PATH          chemin du binaire Chromium (inutile avec le Dockerfile)
OAUTH_STATE_SECRET     openssl rand -base64 48
LINKEDIN_CLIENT_ID     si l'accès à l'API de portabilité est accordé
LINKEDIN_CLIENT_SECRET
LINKEDIN_REDIRECT_URI  https://votre-domaine/api/auth/linkedin/callback
```

En leur absence, le parcours LinkedIn bascule en mode démonstration et l'export
PDF renvoie un 503 explicite plutôt qu'une erreur opaque.
