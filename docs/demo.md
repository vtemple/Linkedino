# Démonstration investisseur — mode d'emploi

## Une fois, la veille

```bash
npm install
npm run build

# 1. Récupérer votre archive LinkedIn
#    Réglages et confidentialité → Confidentialité des données
#    → Obtenir une copie de vos données → cocher les rubriques de profil
#    (arrive en général en moins de 10 minutes)

# 2. Associer l'archive à votre URL
npx tsx --tsconfig tsconfig.scripts.json scripts/provision.ts \
  https://www.linkedin.com/in/votre-profil ~/Téléchargements/Basic_LinkedInDataExport.zip

# 3. Relire et corriger dans le studio — c'est le moment de le faire,
#    pas pendant la démonstration.
```

Vérifier ensuite que `CHROMIUM_PATH` pointe vers un Chromium ou Chrome
installé, sinon l'export PDF renverra un 503.

## Le jour J

```bash
CHROMIUM_PATH=/chemin/vers/chromium npm start
```

**Ouvrir la page d'accueil et attendre cinq secondes avant de commencer.**
Elle déclenche le préchauffage de Chromium en tâche de fond : le premier PDF
passe alors de 11,6 s à 1,2 s.

### Déroulé, environ 90 secondes

| Temps | Action | Ce qui se voit |
|---|---|---|
| 0:00 | Coller votre URL LinkedIn | Le profil est reconnu pendant la frappe : nom et intitulé s'affichent, le bouton s'active |
| 0:10 | « Générer mon CV » | Le pipeline se déroule : profil, lecture, normalisation, CVData, rendu |
| 0:15 | Le studio s'ouvre | CV interactif à droite, formulaire à gauche |
| 0:25 | Modifier un intitulé de poste | L'aperçu se met à jour, l'état passe à « Enregistré à … » |
| 0:40 | Onglet **PDF A4** | La feuille A4 réelle, paginée |
| 0:50 | « Télécharger le PDF » | Fichier en ~1,2 s |
| 1:05 | Onglet **LaTeX ATS** | La source `.tex`, une colonne, sans image |
| 1:15 | Onglet **Interactif** → « Voir la page publique » | Thème sombre/clair, chronologie dépliable |

### La phrase qui porte le produit

> Les trois formats sortent du même objet de données. Aucun modèle de langage
> n'intervient : deux générations du même profil produisent le même document,
> octet pour octet.

## Ce que la démonstration ne montre pas

À dire avant qu'on vous le demande — c'est plus solide que d'être pris en défaut :

- **L'URL ne récupère rien depuis LinkedIn.** Le profil est importé une fois
  depuis vos propres données, puis associé à l'adresse. Aucune donnée n'est
  aspirée, aucune protection contournée. En production, l'API officielle de
  portabilité DMA alimentera le même registre — le code du flux OAuth est déjà
  écrit, il attend l'accès LinkedIn.
- **Pas de comptes ni de paiement.** Stockage sur fichiers, mono-utilisateur.
- **Un seul modèle visuel.** Le système de templates existe, il n'a qu'une
  entrée.

## Si quelque chose casse

| Symptôme | Cause probable | Réponse |
|---|---|---|
| Export PDF en 503 | Chromium introuvable | Onglet PDF A4 puis Ctrl+P : le rendu est identique |
| PDF lent au premier essai | Navigateur froid | Ouvrir la page d'accueil et attendre 5 s |
| « Profil pas encore importé » | Identifiant différent | `scripts/provision.ts` sans argument liste les profils enregistrés |
| Polices approximatives | Jost non chargée | Sans réseau, la pile de repli s'applique ; auto-héberger avant tout usage sérieux |

## Repli ultime

Si le poste de démonstration lâche, ouvrez le fichier HTML autonome exporté
depuis le studio : il contient sa CSS, son JavaScript et ses images, et
fonctionne sans serveur, hors ligne.
