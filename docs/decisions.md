# Décisions techniques

## Moteur de compilation LaTeX : pdflatex

LuaLaTeX échouait avec `module 'luaotfload-main' not found` : le binaire est
présent dans `texlive-luatex` mais son chargeur de polices OpenType arrive avec
un paquet distinct. Corrigeable, mais cela ajoute une dépendance de déploiement.

**pdflatex est retenu comme moteur principal**, et c'est un choix, pas un repli :

- il est présent dans toute installation TeX, jusqu'à `texlive-latex-base` ;
- l'objection habituelle — mauvaise gestion de l'Unicode — ne s'applique pas
  ici : avec `fontenc T1` et `inputenc utf8`, l'extraction du PDF restitue les
  accents à l'identique, ce que **vérifie la validation ATS après chaque
  compilation** ;
- pour un document d'une colonne en alphabet latin, LuaLaTeX n'apporte rien qui
  justifie sa surface de déploiement.

LuaLaTeX reste en second dans `ENGINES` : une installation qui le fournit sans
pdflatex compile quand même.

## Police auto-hébergée

Jost est servie depuis `public/fonts` en WOFF2 (3 graisses, 30 Ko), via le
paquet `@fontsource/jost`. Le prototype dépendait de Google Fonts, avec deux
conséquences : rendu différent hors ligne, et risque que le PDF se compose avec
la police de repli si le réseau tardait au moment de l'impression.

L'export HTML autonome intègre les polices en base64 : aucune requête réseau.

## Transferts de blocs entre sections

Un bloc peut être transféré **vers une section personnalisée**, qui accueille
des entrées génériques (titre, sous-titre, période, puces). La conversion est
explicite pour chaque type d'origine.

Les transferts entre types incompatibles ne sont pas proposés : transformer une
formation en expérience inventerait un employeur, et une langue en diplôme n'a
aucun sens. L'interface ne montre que les cibles valides.

## Ajustement à une page

Les deux PDF cherchent à tenir sur une seule page A4, par deux mécanismes
distincts adaptés à chaque moteur.

**PDF humain (Chromium).** On mesure la hauteur réelle de la feuille en média
*impression* — mesurer en média écran donnait une hauteur constante de 297 mm à
cause des règles d'aperçu — puis on applique un facteur de zoom CSS, qui
reflowe le texte au lieu de l'écraser. Trois passes de correction absorbent le
reflow.

**PDF ATS (LaTeX).** Une échelle de sept crans typographiques : d'abord les
blancs (`itemsep`, sauts de section), puis les marges, puis l'interligne, puis
le corps. On s'arrête au premier cran qui donne une page. Chaque cran reste un
document composé, pas une photocopie réduite.

**Le plancher est explicite et assumé.** Sous 66 % pour le PDF humain, et
au-delà du dernier cran pour l'ATS, on livre deux pages lisibles plutôt qu'une
page illisible. Un CV de 14 expériences à 4 puces plus 40 compétences ne tient
pas sur une page A4 à une taille lisible : c'est une contrainte physique, pas un
défaut de mise en page.

Dans ce cas, les en-têtes `X-Fit-Overflow` / `X-Ats-Pages` remontent
l'information et le studio invite à réduire le contenu. Réduire automatiquement
le contenu — tronquer des puces, masquer des entrées — serait pire : cela
supprimerait des données sans que l'utilisateur le sache.

## Prévention de surcharge

Le studio estime l'encombrement du CV et formule des conseils. Deux principes :

**L'estimation est ancrée dans le rendu, pas dans un décompte de caractères.**
`domain/cv/density.ts` reprend les métriques du gabarit d'impression — hauteur
utile, largeur des deux colonnes, corps, interligne — et calcule une hauteur en
millimètres d'A4. Les deux colonnes sont comptées **en parallèle** : c'est la
plus haute qui détermine la page, pas leur somme.

Les seuils suivent le mécanisme réel d'ajustement : le PDF humain se resserre
jusqu'à 66 %, soit une capacité utile d'environ 1,5 page. Au-delà, aucune
réduction acceptable ne fera tenir le document — c'est le seuil « critique ».

**La mesure réelle prime sur l'estimation.** `/api/cv/[id]/fit` ouvre la page
d'impression dans Chromium et appelle `fitToOnePage`, exactement le code qu'exécute
l'export. Il est donc impossible qu'un conseil annonce une page et que l'export
en produise deux. L'estimation locale reste instantanée pendant la frappe ; la
mesure la corrige après enregistrement.

**Rien n'est jamais tronqué.** Aucun bouton n'est désactivé, aucune saisie
refusée. Réduire automatiquement le contenu supprimerait des données à l'insu
de l'utilisateur, ce qui serait plus grave qu'une seconde page.
