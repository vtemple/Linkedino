# Demande d'accès — Member Data Portability API (3rd Party)

Ce document contient tout ce qu'il faut fournir à LinkedIn, et **ce que je ne
peux pas faire à ta place**. Les étapes marquées **ACTION** exigent que tu sois
connecté à ton compte LinkedIn : elles ne sont ni automatisables ni simulables.

---

## 1. Notre cas d'usage est-il compatible ?

Oui, et c'est même le cas d'usage archétypal de la portabilité : un membre
connecte son propre compte pour récupérer ses propres données et les
réutiliser ailleurs.

Un point des *DMA Portability API Terms* lève l'ambiguïté. Ces conditions
précisent que, **à l'exception des obligations de sécurité des données et de
conformité légale, les clauses des API Terms of Use restreignant les types de
cas d'usage commerciaux ne s'appliquent pas aux Portability Data.** Autrement
dit, les limitations habituelles du programme API (marketing, recrutement,
partenariats) ne conditionnent pas cet accès : le programme existe pour
satisfaire une obligation réglementaire, pas pour arbitrer des modèles
d'affaires.

Deux limites demeurent, structurelles :

- **Territoire.** Seuls les membres situés dans l'UE/EEE **et en Suisse**
  peuvent consentir, la localisation étant déterminée par celle déclarée sur
  leur profil LinkedIn. Les membres hors de cette zone reçoivent un message
  d'erreur s'ils tentent de consentir. LinkedIn rappelle en revanche que **tous
  les membres, sans exception territoriale, peuvent demander une copie de leurs
  données depuis leurs réglages** — c'est exactement notre repli par archive.
- **Durée.** Le consentement vaut un an, puis doit être renouvelé.

**À faire valider par un juriste avant lancement commercial :** la section 3
« Storage of Portability Data » des conditions survit à la résiliation et fixe
les règles de conservation. LinkedIn bloque l'accès automatisé à cette page ; je
n'ai pas pu en lire le texte intégral et je ne peux donc pas t'en donner le
contenu. C'est le seul point du dossier que je te transmets comme non vérifié.

---

## 2. Prérequis — **ACTION**

### 2.1 Page LinkedIn d'entreprise

Une application ne peut être créée sans Page. Si tu n'en as pas :
`linkedin.com/company/setup/new`.

Il te faudra une entité juridique : la vérification d'entreprise réclame une
dénomination sociale et une adresse de siège. Une micro-entreprise convient.

### 2.2 Adresse e-mail professionnelle

**Les adresses personnelles échouent à la vérification.** Prévois une adresse
sur ton nom de domaine (`contact@ton-domaine.fr`), pas Gmail.

### 2.3 Politique de confidentialité en ligne

Une URL publique et accessible est demandée dans le formulaire. Le §5 en donne
le contenu minimal.

---

## 3. Créer l'application — **ACTION**

1. `linkedin.com/developers/apps/new`
2. Renseigne le nom, la Page d'entreprise et le logo.
3. **Onglet Settings → « Verify »** : génère l'URL de vérification et fais-la
   valider par le super-administrateur de la Page. Sans cette étape, le bouton
   de demande d'accès reste désactivé.

### Onglet Auth → URL de redirection

Ajoute les deux, à l'identique de la variable `LINKEDIN_REDIRECT_URI` :

```
http://localhost:3000/api/auth/linkedin/callback
https://VOTRE-DOMAINE/api/auth/linkedin/callback
```

La comparaison faite par LinkedIn est stricte : protocole, domaine, port et
chemin doivent correspondre au caractère près.

### Onglet Products

- **Sign In with LinkedIn using OpenID Connect** — libre-service, immédiat.
  Nécessaire pour la photo de profil, absente du domaine `PROFILE`.
- **Member Data Portability API (3rd Party)** — soumis à revue. C'est la
  demande longue : lance-la en premier.

---

## 4. Formulaire de demande — texte à reprendre

### Description de l'application

> Générateur de CV. L'utilisateur connecte son propre compte LinkedIn pour
> récupérer les données de son profil (identité, expériences, formations,
> compétences, langues, certifications) et les transformer automatiquement en un
> CV disponible en trois formats : page web interactive, document PDF A4, et
> source LaTeX optimisée pour les systèmes de suivi de candidatures.

### Cas d'usage et bénéfice pour le membre

> Le membre consent explicitement à partager ses propres données afin de les
> réutiliser dans un document qu'il contrôle et exporte. Le traitement est
> entièrement déterministe : des règles de transformation explicites et
> testées, sans modèle de langage, sans génération de contenu et sans
> reformulation. Le membre conserve la maîtrise éditoriale complète et peut
> corriger chaque champ avant export.
>
> Aucune donnée n'est enrichie, agrégée, revendue ni recoupée avec d'autres
> sources. Aucune donnée relative à des tiers n'est collectée : nous
> n'utilisons ni le domaine CONNECTIONS, ni INBOX, ni aucun domaine
> d'interaction sociale.

### Domaines demandés et justification

| Domaine | Usage dans le CV |
|---|---|
| `PROFILE` | Nom, accroche, résumé, localisation |
| `POSITIONS` | Section Expérience professionnelle |
| `EDUCATION` | Section Formation |
| `SKILLS` | Section Compétences |
| `LANGUAGES` | Section Langues |
| `CERTIFICATIONS` | Section Certifications |
| `PROJECTS`, `HONORS`, `COURSES`, `PUBLICATIONS` | Sections optionnelles |
| `VOLUNTEERING_EXPERIENCES` | Section Bénévolat |
| `EMAIL_ADDRESSES`, `PHONE_NUMBERS` | Bloc de contact du CV |

Cette liste correspond exactement à la constante `CV_DOMAINS` du code. Nous
n'appelons aucun autre domaine.

### Conservation et suppression

> Les données sont conservées le temps que le membre utilise le service, dans
> le seul but de produire et modifier son CV. Le jeton d'accès est détruit dès
> la fin de l'import. Le membre peut supprimer son CV et l'ensemble des données
> associées à tout moment ; la suppression est immédiate et définitive. Le
> membre peut également révoquer notre accès depuis ses réglages LinkedIn.

### Informations de vérification d'entreprise

À préparer avant d'ouvrir le formulaire :

- [ ] Dénomination sociale exacte (telle qu'au registre)
- [ ] Adresse du siège
- [ ] Site web public
- [ ] URL de la politique de confidentialité
- [ ] Adresse e-mail professionnelle sur le domaine — **sera vérifiée par lien**

Si le courriel de vérification n'arrive pas, regarde les spams et les onglets
« promotions » et « réseaux sociaux ».

---

## 5. Politique de confidentialité — contenu minimal

À publier avant de soumettre. Doivent y figurer :

1. **Identité du responsable de traitement** — dénomination, adresse, contact.
2. **Données traitées** — la liste des domaines ci-dessus, nommément.
3. **Finalité** — génération et édition d'un CV à la demande de la personne.
4. **Base légale** — le consentement (RGPD art. 6.1.a), révocable à tout moment.
5. **Absence de traitement automatisé de décision** — mentionner explicitement
   qu'aucun modèle de langage n'intervient et qu'aucun profilage n'est réalisé.
6. **Destinataires** — hébergeur, stockage d'objets. Aucune revente, aucun
   courtage de données.
7. **Durée de conservation** — et suppression à la demande.
8. **Droits** — accès, rectification, effacement, portabilité, opposition, et
   réclamation auprès de la CNIL.
9. **Transferts hors UE** — le cas échéant, avec la garantie applicable.

---

## 6. Après l'octroi de l'accès

1. Renseigne `.env` d'après `.env.example`.
2. Génère le secret d'état : `openssl rand -base64 48`.
3. Redémarre : l'application quitte automatiquement le mode démonstration —
   `readConfig()` renvoie une configuration au lieu de `null`.
4. **Premier test à faire, avant tout le reste** : vérifier que l'en-tête
   `LinkedIn-Version: 202312` est accepté. Cette valeur est figée sur l'endpoint
   `memberSnapshotData` ; toute autre renvoie `426 NONEXISTENT_VERSION`.
5. Teste avec un compte réel situé dans l'EEE ou en Suisse. Un compte hors zone
   recevra une erreur au consentement — c'est le comportement attendu, pas un
   défaut.

---

## 7. En cas de refus

Si LinkedIn refuse l'accès ou restreint certains domaines, **la réponse n'est
pas de contourner**. L'architecture prévoit déjà la dégradation :

| Situation | Comportement |
|---|---|
| Accès refusé | `readConfig()` reste `null`, les replis par fichier prennent le relais |
| Certains domaines refusés | Retirer les entrées de `CV_DOMAINS` ; les sections concernées se remplissent par l'archive ou à la main |
| Membre hors EEE/Suisse | LinkedIn renvoie une erreur au consentement, l'interface bascule sur le dépôt d'archive |

Dans les trois cas, le normaliseur, le studio et les trois renderers restent
identiques : seule la source change.

---

## 8. État réel de l'intégration

**L'intégration n'a pas été testée contre les endpoints LinkedIn réels.** Le
code du flux OAuth et du client Snapshot est écrit d'après la documentation
officielle, typé et compilé, mais aucun appel n'a été émis vers
`linkedin.com/oauth/v2` ni `api.linkedin.com/rest/memberSnapshotData` : nous
n'avons ni identifiants ni accès accordé.

Ce qui est effectivement vérifié :

- le parcours complet, de bout en bout, contre un transport rejouant la forme
  documentée des réponses ;
- le normaliseur, sur des colonnes réelles d'archive LinkedIn ;
- la signature et la vérification du paramètre `state` ;
- les trois exports, depuis le `CVData` produit.

Ce qui ne le sera qu'avec de vrais identifiants :

- l'échange du code contre un jeton et la forme exacte de la réponse ;
- le comportement de `memberSnapshotData` sur un instantané en cours de
  constitution ;
- les en-têtes de colonnes réellement retournés par domaine — la documentation
  ne les publie pas, d'où la tolérance aux alias dans le normaliseur ;
- les limites de débit.
