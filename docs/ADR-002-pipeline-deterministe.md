# ADR-002 — Pipeline déterministe, sans IA

**Statut** : accepté · **Remplace** : ARCHITECTURE.md §9 (« Import et IA ») et la décision D6

---

## Contexte

La décision produit est qu'aucun LLM n'intervient dans le SaaS. L'utilisateur
fournit son profil, choisit un format, reçoit un fichier. Il ne dialogue avec
rien.

Cela supprime une dépendance, un coût variable et une source d'erreur — mais
déplace la difficulté : la normalisation devient un problème d'ingénierie
explicite, là où un LLM absorbait l'ambiguïté en silence.

## Décision

### 1. La normalisation est un ensemble de règles nommées et testées

Ce que le LLM faisait implicitement, des fonctions pures le font désormais
explicitement, chacune couverte par des tests :

| Entrée du prototype | Sortie structurée | Fonction |
|---|---|---|
| `"📧 email@x.fr\n📞 06…\n📍 Lyon, France"` | `email`, `phone`, `location`, `links` | `parseContactBlock` |
| `"Juin 2025"`, `"2025 – 2026"` | `{ start, end, current }` ISO | `parseLegacyRange` |
| `"Assistant Manager — Stage 2 mois"` | `role` + `contract: "stage"` | `splitRoleAndContract` |
| `"C1 — TOEIC 800/990"` | `level: "C1"` + `certification` | `parseLanguageLevel` |
| `"Identifiant P-DY6XKXG8"` | `credentialId` | `parseCredential` |
| `"🏃 Sports"` | `icon` + `label` séparés | `splitIcon` |
| `"<div>a</div><div>b</div>"` | deux puces `RichText` | `parseLegacyHtml` |

L'ordre des lignes de contact n'a aucune importance : la reconnaissance porte
sur le contenu, jamais sur la position.

### 2. Aucune ambiguïté n'est résolue en silence

Chaque normaliseur reçoit un accumulateur `NormalizeWarning[]`. En cas de doute,
il conserve la valeur d'origine et signale. L'import retourne
`{ document, warnings, stats }` — l'éditeur met les champs concernés en évidence
et l'utilisateur tranche.

C'est la contrepartie honnête de l'absence de LLM : la machine ne devine pas,
elle demande. Sur le fichier de production réel, cela donne **un seul
avertissement** — le numéro de téléphone laissé en gabarit `06 XX XX XX XX`.

### 3. Le pipeline est reproductible

Les identifiants sont dérivés du contenu par hachage FNV-1a, pas d'un compteur
ni d'un aléa. Deux imports du même fichier produisent un document strictement
identique — vérifié par test. C'est ce qui rend le diff de versions lisible et
les instantanés de rendu stables.

### 4. Les trois formats ont des cibles distinctes

C'est le second changement, et il simplifie l'architecture : la contrainte ATS
quitte le PDF pour le LaTeX. La décision D6 (« deux templates PDF ») tombe.

| Format | Lecteur | Optimisé pour |
|---|---|---|
| **HTML** | humain, à l'écran | interaction, responsive, animations sobres |
| **PDF A4** | humain, imprimé ou en pièce jointe | esthétique, hiérarchie, plaisir de lecture |
| **LaTeX** | analyseur automatisé | extraction fidèle du texte |

Le PDF n'a plus à se brider. Il peut garder la grille en cartes, la photo, les
logos, la couleur d'accent — tout ce qui le rend agréable à parcourir pour un
recruteur. Et le LaTeX peut être franchement austère sans que ce soit un
compromis : une colonne, aucune image, aucun pictogramme, intitulés de sections
standards.

Conséquence concrète dans le renderer : **les surcharges de titres définies dans
`Presentation` sont ignorées en LaTeX**. Un CV dont la colonne s'intitule
« PROFIL » plutôt que « Centres d'intérêt » perd du matching. La
personnalisation s'applique aux formats destinés à l'œil ; le format machine
reste canonique.

### 5. L'import LinkedIn reste abstrait

L'interface `ProfileImporter` ne change pas. Sans LLM, l'ordre de priorité des
sources se déplace vers les plus structurées :

| Importer | Source | Qualité sans IA |
|---|---|---|
| `LinkedInArchiveImporter` | archive ZIP LinkedIn (`Positions.csv`, `Education.csv`, `Skills.csv`) | **excellente** — colonnes nommées, dates ISO |
| `LegacyHtmlImporter` | prototype existant | excellente — implémenté, testé |
| `LinkedInPdfImporter` | PDF « Enregistrer au format PDF » | correcte — mise en page stable, parsing par gabarit |
| `ManualImporter` | formulaire | totale |

L'archive ZIP devient la voie principale : elle est déjà tabulaire, donc le
parsing y est fiable sans inférence. C'est la source qui bénéficie le plus de
l'abandon du LLM.

## Conséquences

**Positives.** Coût marginal nul par CV. Exports reproductibles. Aucune donnée
personnelle transmise à un tiers — argument RGPD réel, pas cosmétique. Aucune
hallucination possible par construction. Tests exhaustifs plutôt que prompts
ajustés à l'aveugle.

**Négatives, assumées.** Pas de reformulation automatique des descriptions : ce
que l'utilisateur importe est ce qu'il obtient. Le PDF LinkedIn demandera des
gabarits de parsing à maintenir quand LinkedIn changera sa mise en page — c'est
le point de fragilité à surveiller. Et les formats de dates ou d'intitulés
exotiques produiront des avertissements plutôt que des devinettes réussies.

Ce dernier point mérite d'être vu comme une qualité : un champ signalé se
corrige en cinq secondes, une invention passe inaperçue jusqu'à l'entretien.

## Résultat mesuré sur le fichier de production

```
Fichier source        7,16 Mo
Document CVData        8,5 Ko
Images                    3 traitées
  avant               2,65 Mo
  après              192,1 Ko   (92,9 % de réduction)
Total en base        200,5 Ko

Entrées migrées : 4 expériences, 4 formations, 4 langues,
                  7 certifications, 5 centres d'intérêt

Avertissements : 1 (téléphone laissé en gabarit)
```

Trois pertes de données du prototype sont réparées au passage : les 7 liens de
certification (schéma `link` face à un code lisant `link_html`), les 5 centres
d'intérêt affichés vides (`label` face à `label_fr`), et la duplication du lieu
dans le nom de l'organisme. Chacune fait l'objet d'un test de non-régression.
