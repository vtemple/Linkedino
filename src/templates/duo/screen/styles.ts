/**
 * Feuille de style écran du template Duo.
 *
 * Exportée en chaîne : la même CSS alimente la page publique Next.js, l'aperçu
 * de l'éditeur et l'export autonome. Un seul endroit à modifier, aucun risque
 * de divergence entre ce que l'utilisateur voit et ce qu'il télécharge.
 *
 * Ce que le prototype faisait et qui est corrigé ici :
 *   - `html,body{width:100vw;height:100vh;overflow:hidden}` coupait purement le
 *     contenu excédentaire ; les colonnes défilent désormais, avec masques ;
 *   - quatre colonnes en 1fr sur 375 px donnaient des colonnes de 90 px ;
 *   - la révélation des expériences était en `mouseenter` seul, donc
 *     inaccessible au tactile et au clavier.
 */

import { duoTokens, fontVars, themeVars, type DesignTokens } from "../tokens";

export function screenStyles(tokens: DesignTokens = duoTokens, density = 1): string {
  return `
/* ── Police auto-hébergée ───────────────────────────────────────────────
   Jost en WOFF2, servi depuis notre domaine. Le prototype dépendait de
   Google Fonts, avec deux conséquences : le rendu différait hors ligne, et
   le PDF pouvait se composer avec la police de repli si le réseau tardait
   au moment de l'impression. Trois graisses, 30 Ko au total.             */
@font-face{
  font-family:'Jost';font-style:normal;font-weight:400;font-display:swap;
  src:url('/fonts/jost-latin-400-normal.woff2') format('woff2');
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215;
}
@font-face{
  font-family:'Jost';font-style:normal;font-weight:500;font-display:swap;
  src:url('/fonts/jost-latin-500-normal.woff2') format('woff2');
}
@font-face{
  font-family:'Jost';font-style:normal;font-weight:600;font-display:swap;
  src:url('/fonts/jost-latin-600-normal.woff2') format('woff2');
}

/* ── Grammaire du mouvement ─────────────────────────────────────────────
   Trois courbes seulement, réutilisées partout. Un document où chaque
   élément a sa propre courbe paraît nerveux ; une grammaire commune donne
   l'impression d'un seul geste.
     --e-out  : sortie douce, pour les apparitions
     --e-soft : quasi-ressort, sans rebond — pour les ouvertures
     --e-snap : réaction immédiate, pour le survol                        */
:root{
  --e-out:cubic-bezier(.22,.68,.16,1);
  --e-soft:cubic-bezier(.34,.92,.24,1);
  --e-snap:cubic-bezier(.4,0,.2,1);
}
:root{${themeVars(tokens.light)};${fontVars(tokens, density)}}
[data-theme="dark"]{${themeVars(tokens.dark)}}

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{
  font-family:var(--f-body);
  background:var(--bg);color:var(--tx);
  line-height:1.5;
  -webkit-font-smoothing:antialiased;
  transition:background .35s ease,color .35s ease;
}

/* ── Grille ─────────────────────────────────────────────────────────────
   Deux colonnes — bande latérale et corps — alimentées par l'ordre des
   sections. Le gabarit n'impose plus quoi mettre où : chaque section porte
   sa colonne d'accueil, modifiable dans le studio.                        */
.cv-root{
  --gap:calc(1.1rem * var(--d));
  --pad:calc(1.4rem * var(--d));
  padding:var(--gap);
  min-height:100dvh;
  max-width:82rem;margin:0 auto;
}
.cv-grid{display:grid;gap:var(--gap);grid-template-columns:1fr;align-items:start}

@media (min-width:900px){
  .cv-grid{grid-template-columns:minmax(16rem,23rem) minmax(0,1fr)}
  /* La bande latérale suit la lecture : l'identité reste visible pendant
     qu'on parcourt les expériences. */
  .cv-col--aside{position:sticky;top:var(--gap);align-self:start;max-height:calc(100dvh - var(--gap)*2);overflow:auto;scrollbar-width:none}
  .cv-col--aside::-webkit-scrollbar{display:none}
}

.cv-col{display:flex;flex-direction:column;gap:var(--gap);min-width:0}

/* Sous 900 px, les colonnes s'effacent : les sections rejoignent la grille
   parente et suivent l'ordre choisi par l'utilisateur, au lieu de faire passer
   toute la bande latérale avant le corps du CV. */
@media (max-width:899px){
  .cv-col{display:contents}
  .cv-sec{order:var(--order,0)}
}

.cv-sec{
  background:var(--s1);
  border:1px solid var(--bd);
  border-radius:var(--r-lg);
  padding:var(--pad);
  box-shadow:var(--sh);
  transition:background .35s ease,border-color .35s ease,transform .4s cubic-bezier(.2,.8,.2,1);
}
.cv-col--aside .cv-sec{background:var(--s2)}
.cv-sec[data-kind="profile"]{padding-bottom:calc(var(--pad) * .8)}

.cv-sec__title{
  font-family:var(--f-display);
  font-size:.7rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;
  color:var(--ac);
  padding-bottom:.55em;margin-bottom:.9em;
  border-bottom:1px solid var(--ac);
  display:flex;align-items:center;gap:.6em;
}
/* Compteur discret : donne du rythme sans alourdir. */
.cv-sec__title::after{
  content:"";flex:1;height:1px;background:var(--bd);
}

.cv-summary{font-size:.92rem;line-height:1.65;color:var(--mu)}
.cv-summary strong{color:var(--tx)}
.cv-identity{display:flex;flex-direction:column;align-items:center;text-align:center}

/* ── Identité ───────────────────────────────────────────────────────── */
.cv-photo{
  width:min(13rem,72%);aspect-ratio:4/5;
  margin:.2rem auto .9rem;
  border-radius:var(--r-md);overflow:hidden;
  border:1px solid var(--bd);background:var(--s2);
  flex-shrink:0;position:relative;
}
.cv-photo img{
  width:100%;height:100%;object-fit:cover;display:block;
  transition:transform 1.4s var(--e-out),filter .6s var(--e-out);
}
.cv-photo:hover img{transform:scale(1.045)}
/* Vignette discrète : donne de la profondeur sans filtre tape-à-l'œil. */
.cv-photo::after{
  content:"";position:absolute;inset:0;pointer-events:none;
  box-shadow:inset 0 -3rem 3rem -2rem rgba(0,0,0,.35);
}

.cv-name{
  font-family:var(--f-display);
  font-size:clamp(1.35rem,1.1rem + .9vw,1.8rem);
  font-weight:600;letter-spacing:-.005em;line-height:1.1;
  text-align:center;text-wrap:balance;
}
.cv-headline{
  font-family:var(--f-util);
  font-size:.66rem;font-weight:500;letter-spacing:.16em;text-transform:uppercase;
  color:var(--ac);text-align:center;margin-top:.45em;
}

.cv-contact{list-style:none;margin:1em 0 0;display:grid;gap:.3em;font-size:.8rem}
.cv-contact li{display:flex;gap:.55em;align-items:baseline;justify-content:center;text-align:center}
.cv-contact a{color:inherit;text-decoration:none;border-bottom:1px solid var(--bd);transition:border-color .2s}
.cv-contact a:hover{border-color:var(--ac)}
.cv-contact svg{width:.85em;height:.85em;flex-shrink:0;opacity:.55;transform:translateY(.08em)}

/* ── Séparateur ─────────────────────────────────────────────────────── */
.cv-rule{height:1px;background:var(--bd);margin:.9em 0;flex-shrink:0;border:0}

/* ── Timeline des expériences ───────────────────────────────────────────
   L'élément signature. Rendu possible par les dates ISO : la colonne
   temporelle est continue et la durée réellement calculée.               */
.cv-timeline{position:relative;padding-left:1.15rem}
.cv-timeline::before{
  content:"";position:absolute;left:.32rem;top:.9rem;bottom:.9rem;width:1.5px;
  background:linear-gradient(to bottom,var(--ac) 0%,rgba(var(--ar),.45) 55%,rgba(var(--ar),.12) 100%);
  border-radius:1px;
}
.cv-xp{position:relative;padding:.5em 0 .55em}
.cv-xp::before{
  content:"";position:absolute;left:-1.0rem;top:1.05em;
  width:.5rem;height:.5rem;border-radius:50%;
  background:var(--s1);border:1.5px solid rgba(var(--ar),.5);
  transition:transform .3s cubic-bezier(.2,.8,.2,1),background .3s ease,box-shadow .3s ease;
}
.cv-xp[data-open="true"]::before{
  background:var(--ac);border-color:var(--ac);
  box-shadow:0 0 0 3px rgba(var(--ar),.15);
}
.cv-xp + .cv-xp{border-top:1px solid rgba(var(--ar),.07)}

.cv-xp__head{
  display:flex;gap:.7em;align-items:flex-start;width:100%;
  background:none;border:0;padding:0;margin:0;
  font:inherit;color:inherit;text-align:left;cursor:pointer;
}
.cv-xp__head:focus-visible{outline:2px solid var(--ac);outline-offset:4px;border-radius:var(--r-sm)}
.cv-xp__role{transition:color .22s var(--e-snap)}
.cv-xp__head:not(:disabled):hover .cv-xp__role{color:var(--ac)}
/* La pastille de la chronologie se dilate au survol de son entrée. */
.cv-xp__head:not(:disabled):hover ~ *,
.cv-xp:hover::before{transform:scale(1.18)}
.cv-xp[data-open="true"]:hover::before{transform:scale(1.35)}
/* Le chevron signale qu'il reste quelque chose à ouvrir : sans lui, une entrée
   repliée ressemblait à une entrée vide. */
.cv-xp__chev{
  width:.75rem;height:.75rem;flex-shrink:0;margin-top:.35em;
  color:var(--mu);transition:transform .35s cubic-bezier(.3,.9,.2,1),color .2s;
}
.cv-xp[data-open="true"] .cv-xp__chev{transform:rotate(180deg);color:var(--ac)}
.cv-xp__head:not(:disabled):hover .cv-xp__chev{color:var(--ac)}
.cv-xp__main{flex:1;min-width:0}
.cv-xp__meta{
  font-family:var(--f-util);
  font-size:.65rem;font-weight:500;letter-spacing:.09em;text-transform:uppercase;
  color:var(--ac);display:flex;flex-wrap:wrap;gap:.5em;align-items:baseline;
}
.cv-xp__duration{color:var(--mu);letter-spacing:.05em}
.cv-xp__role{
  display:block;
  font-family:var(--f-display);
  font-size:1rem;font-weight:600;line-height:1.24;margin-top:.14em;
  text-wrap:balance;
}
.cv-xp__org{display:block;font-size:.82rem;color:var(--mu);font-style:italic;margin-top:.1em}
.cv-xp__meta{margin-bottom:.05em}
.cv-xp__tag{
  font-family:var(--f-util);font-size:.58rem;font-weight:500;
  letter-spacing:.11em;text-transform:uppercase;
  border:1px solid rgba(var(--ar),.28);border-radius:100px;padding:.12em .5em;
  color:var(--mu);white-space:nowrap;background:rgba(var(--ar),.05);
}
.cv-logo{
  width:2.5em;height:2.5em;flex-shrink:0;
  border-radius:var(--r-sm);overflow:hidden;border:1px solid var(--bd);
  background:var(--bg);display:grid;place-items:center;
}
.cv-logo img,.cv-logo svg{width:100%;height:100%;object-fit:contain;display:block}

.cv-xp__body{
  display:grid;grid-template-rows:0fr;
  transition:grid-template-rows .52s var(--e-soft),opacity .34s var(--e-out);
  opacity:0;
}
/* Les puces glissent légèrement en entrant : l'ouverture se lit comme un
   dépliage, non comme un simple changement de hauteur. */
.cv-xp__bullets li{
  transform:translateY(-4px);opacity:0;
  transition:transform .4s var(--e-soft),opacity .4s var(--e-out);
}
.cv-xp[data-open="true"] .cv-xp__bullets li{transform:none;opacity:1}
.cv-xp[data-open="true"] .cv-xp__bullets li:nth-child(2){transition-delay:.04s}
.cv-xp[data-open="true"] .cv-xp__bullets li:nth-child(3){transition-delay:.08s}
.cv-xp[data-open="true"] .cv-xp__bullets li:nth-child(n+4){transition-delay:.12s}
.cv-xp[data-open="true"] .cv-xp__body{grid-template-rows:1fr;opacity:1}
.cv-xp__bodyInner{overflow:hidden;min-height:0}
.cv-xp__bullets{
  list-style:none;margin:.55em 0 .1em;padding-left:.8em;
  border-left:2px solid rgba(var(--ar),.35);
  display:grid;gap:.3em;font-size:.85rem;color:var(--mu);
}
.cv-xp__bullets li{line-height:1.45}
.cv-xp__bullets a{color:var(--ac)}

/* ── Formations ─────────────────────────────────────────────────────── */
.cv-edu{display:flex;gap:.7em;align-items:flex-start;padding:.55em 0}
.cv-edu + .cv-edu{border-top:1px solid var(--bd)}
.cv-edu__date{
  font-family:var(--f-util);font-size:.65rem;font-weight:500;
  letter-spacing:.09em;text-transform:uppercase;color:var(--ac);
}
.cv-edu__degree{font-family:var(--f-display);font-size:.92rem;font-weight:600;line-height:1.3;margin:.1em 0}
.cv-edu__org{font-size:.8rem;color:var(--mu);font-style:italic}
.cv-edu__note{
  font-size:.74rem;color:var(--ac);margin-top:.25em;
  display:inline-block;border:1px solid var(--bd);border-radius:100px;padding:.1em .6em;
}

/* ── Langues ────────────────────────────────────────────────────────── */
.cv-sublabel{
  font-family:var(--f-util);
  font-size:.6rem;font-weight:600;letter-spacing:.15em;text-transform:uppercase;
  color:var(--ac);opacity:.7;margin:.9em 0 .5em;flex-shrink:0;
}
.cv-lang{display:grid;gap:.5em}
.cv-lang__row{display:grid;grid-template-columns:1fr auto;gap:.5em;align-items:baseline}
.cv-lang__name{font-family:var(--f-display);font-weight:600;font-size:.88rem}
.cv-lang__cert{font-size:.7rem;color:var(--mu);display:block}
.cv-lang__scale{display:flex;gap:2px;align-items:center}
.cv-lang__step{
  width:.5rem;height:.28rem;border-radius:1px;
  background:var(--bd);transition:background .4s ease,transform .4s ease;
}
.cv-lang__step[data-on="true"]{background:var(--ac)}
.cv-lang__level{
  font-family:var(--f-util);font-size:.64rem;letter-spacing:.08em;
  color:var(--ac);margin-left:.4em;
}

/* ── Compétences ────────────────────────────────────────────────────── */
.cv-chips{list-style:none;display:flex;flex-wrap:wrap;gap:.3em;margin:0}
.cv-chip{
  display:inline-flex;align-items:center;gap:.4em;
  font-family:var(--f-display);font-size:.78rem;font-weight:500;
  border:1px solid var(--bd);border-radius:100px;padding:.22em .7em;
  background:rgba(var(--ar),.04);
  transition:border-color .2s,background .2s,transform .2s;
}
.cv-chip:hover{border-color:var(--ac);background:rgba(var(--ar),.1);transform:translateY(-1px)}
.cv-chip__level{display:inline-flex;gap:1.5px}
.cv-chip__level i{width:3px;height:3px;border-radius:50%;background:var(--bd)}
.cv-chip__level i[data-on="true"]{background:var(--ac)}

/* ── Certifications ─────────────────────────────────────────────────── */
.cv-cert{display:flex;gap:.6em;align-items:center;padding:.42em 0}
.cv-cert__issuer{
  font-family:var(--f-util);font-size:.6rem;font-weight:600;
  letter-spacing:.1em;text-transform:uppercase;color:var(--ac);opacity:.8;
}
.cv-cert__name{font-family:var(--f-display);font-size:.84rem;font-weight:600;line-height:1.25}
.cv-cert__detail{font-size:.7rem;color:var(--mu)}
.cv-cert a{
  color:var(--ac);font-size:.72rem;text-decoration:none;
  border-bottom:1px solid transparent;transition:border-color .2s;
}
.cv-cert a:hover{border-color:var(--ac)}

/* ── Centres d'intérêt ──────────────────────────────────────────────── */
.cv-interest{display:flex;gap:.55em;padding:.32em 0;font-size:.83rem;line-height:1.45}
.cv-interest__icon{font-size:.9em;flex-shrink:0;filter:saturate(.85)}
.cv-interest__label{font-family:var(--f-display);font-weight:600;color:var(--ac)}
.cv-interest__text{color:var(--mu)}

/* ── Barre d'outils ─────────────────────────────────────────────────── */
[data-motion="on"] .cv-toolbar{animation:cvRise .6s var(--e-soft) .5s both}
.cv-toolbar{
  position:fixed;right:.9rem;bottom:.9rem;z-index:20;
  display:flex;gap:.4rem;padding:.35rem;
  background:color-mix(in srgb,var(--s1) 88%,transparent);
  backdrop-filter:blur(10px);
  border:1px solid var(--bd);border-radius:100px;box-shadow:var(--sh);
}
.cv-btn{
  width:2.1rem;height:2.1rem;border-radius:50%;
  border:1px solid transparent;background:none;color:var(--tx);
  font-family:var(--f-util);font-size:.7rem;font-weight:600;
  display:grid;place-items:center;cursor:pointer;
  transition:border-color .2s,background .2s,transform .2s;
}
.cv-btn:hover{border-color:var(--ac);background:rgba(var(--ar),.1)}
.cv-btn:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
.cv-btn{transition:border-color .2s var(--e-snap),background .2s var(--e-snap),transform .18s var(--e-soft)}
.cv-btn:active{transform:scale(.92)}
.cv-btn svg{width:1rem;height:1rem}

.cv-nav{display:none}
/* ── Navigation ──────────────────────────────────────────────── */
@media (max-width:899px){
  .cv-nav{
    display:flex;gap:.35rem;overflow-x:auto;scrollbar-width:none;
    position:sticky;top:0;z-index:15;
    padding:.5rem .1rem;margin:-.2rem 0 .4rem;
    background:linear-gradient(to bottom,var(--bg) 72%,transparent);
  }
  .cv-nav::-webkit-scrollbar{display:none}
  .cv-nav a{
    font-family:var(--f-util);font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;
    padding:.4em .8em;border:1px solid var(--bd);border-radius:100px;
    color:var(--mu);text-decoration:none;white-space:nowrap;
    transition:color .2s,border-color .2s;
  }
    .cv-nav a{transition:color .25s var(--e-snap),border-color .25s var(--e-snap),background .25s var(--e-snap)}
  .cv-nav a:hover,.cv-nav a[aria-current="true"]{
    color:var(--ac);border-color:var(--ac);background:rgba(var(--ar),.08);
  }
  .cv-sec{scroll-margin-top:3.4rem}
  .cv-photo{width:min(11rem,58%)}
}

/* ── Motion ─────────────────────────────────────────────────────────────
   Une seule séquence orchestrée à l'entrée, puis révélation au scroll.   */
@keyframes cvRise{
  from{opacity:0;transform:translateY(18px) scale(.988);filter:blur(3px)}
  60%{filter:blur(0)}
  to{opacity:1;transform:none;filter:blur(0)}
}
/* Séquence d'entrée : les sections apparaissent dans l'ordre de lecture,
   avec un décalage court — assez pour être perçu, pas pour faire attendre. */
.cv-col--aside .cv-sec:nth-child(1){animation-delay:.02s}
.cv-col--aside .cv-sec:nth-child(2){animation-delay:.10s}
.cv-col--aside .cv-sec:nth-child(3){animation-delay:.16s}
.cv-col--aside .cv-sec:nth-child(n+4){animation-delay:.22s}
.cv-col--main .cv-sec:nth-child(1){animation-delay:.06s}
.cv-col--main .cv-sec:nth-child(2){animation-delay:.13s}
.cv-col--main .cv-sec:nth-child(n+3){animation-delay:.19s}

/* L'état masqué n'est appliqué que si le runtime a pris la main : sans
   JavaScript, ou s'il échoue, le CV reste intégralement lisible. */
[data-motion="on"] .cv-reveal{
  opacity:0;transform:translateY(12px);
  transition:opacity .6s var(--e-out),transform .6s var(--e-out);
}
[data-motion="on"] .cv-reveal.is-in{opacity:1;transform:none}

/* Cascade à l'intérieur d'une section : les entrées se posent l'une après
   l'autre, décalage court pour rester rapide sur un CV fourni. */
[data-motion="on"] .cv-timeline .cv-xp.is-in{animation:cvSlide .62s var(--e-soft) both}
[data-motion="on"] .cv-timeline .cv-xp:nth-child(2).is-in{animation-delay:.05s}
[data-motion="on"] .cv-timeline .cv-xp:nth-child(3).is-in{animation-delay:.10s}
[data-motion="on"] .cv-timeline .cv-xp:nth-child(4).is-in{animation-delay:.14s}
[data-motion="on"] .cv-timeline .cv-xp:nth-child(n+5).is-in{animation-delay:.18s}
@keyframes cvSlide{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

/* Les pastilles de compétences entrent en éventail. */
[data-motion="on"] .cv-chip{animation:cvPop .5s var(--e-soft) both}
@keyframes cvPop{from{opacity:0;transform:scale(.9) translateY(4px)}to{opacity:1;transform:none}}
[data-motion="on"] .cv-chip:nth-child(1){animation-delay:.02s}
[data-motion="on"] .cv-chip:nth-child(2){animation-delay:.05s}
[data-motion="on"] .cv-chip:nth-child(3){animation-delay:.08s}
[data-motion="on"] .cv-chip:nth-child(4){animation-delay:.11s}
[data-motion="on"] .cv-chip:nth-child(n+5){animation-delay:.14s}

/* Les jauges de langue se remplissent de gauche à droite. */
[data-motion="on"] .cv-lang__step{animation:cvFill .45s var(--e-out) both}
@keyframes cvFill{from{opacity:0;transform:scaleX(.2)}to{opacity:1;transform:none}}
.cv-lang__step{transform-origin:left}
[data-motion="on"] .cv-lang__row .cv-lang__step:nth-child(2){animation-delay:.04s}
[data-motion="on"] .cv-lang__row .cv-lang__step:nth-child(3){animation-delay:.08s}
[data-motion="on"] .cv-lang__row .cv-lang__step:nth-child(4){animation-delay:.12s}
[data-motion="on"] .cv-lang__row .cv-lang__step:nth-child(5){animation-delay:.16s}
[data-motion="on"] .cv-lang__row .cv-lang__step:nth-child(6){animation-delay:.20s}
[data-motion="on"] .cv-sec{animation:cvRise .7s var(--e-out) both;will-change:transform,opacity}

/* Micro-interactions : la carte réagit au survol sans bouger la mise en page. */
@media (hover:hover) and (min-width:900px){
  .cv-sec{transition:border-color .3s var(--e-out),box-shadow .3s var(--e-out)}
  .cv-sec:hover{border-color:rgba(var(--ar),.32);box-shadow:var(--sh),0 0 0 1px rgba(var(--ar),.06)}
  /* Le trait sous le titre de section s'étire au survol. */
  .cv-sec__title::after{transition:background .35s var(--e-out)}
  .cv-sec:hover .cv-sec__title::after{background:rgba(var(--ar),.35)}
}

/* Le trait de la chronologie se dessine à l'entrée en vue. */
@keyframes cvDrawLine{from{transform:scaleY(0)}to{transform:scaleY(1)}}
[data-motion="on"] .cv-timeline::before{transform-origin:top;animation:cvDrawLine .8s cubic-bezier(.4,0,.2,1) .25s both}

@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{
    animation-duration:.001ms!important;animation-delay:0ms!important;
    transition-duration:.001ms!important;transition-delay:0ms!important;
  }
  .cv-reveal{opacity:1!important;transform:none!important;filter:none!important}
  .cv-xp__bullets li{opacity:1!important;transform:none!important}
}

::selection{background:rgba(var(--ar),.25)}

/* ── Impression depuis la page écran ────────────────────────────────────
   Ctrl+P sur le CV public donne un résultat correct sans passer par
   l'export : les colonnes se déplient, la barre d'outils disparaît.      */
@media print{
  .cv-toolbar,.cv-nav{display:none!important}
  .cv-root{height:auto;overflow:visible;padding:0}
  .cv-grid{grid-template-columns:35% 1fr;height:auto}
  .cv-col--aside{position:static;max-height:none;overflow:visible}
  .cv-sec{break-inside:avoid;box-shadow:none;animation:none}
  .cv-col__scroll{overflow:visible!important;mask-image:none!important;-webkit-mask-image:none!important}
  .cv-xp__body{grid-template-rows:1fr!important;opacity:1!important}
  .cv-reveal{opacity:1!important;transform:none!important}
}
`.trim();
}
