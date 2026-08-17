/**
 * Template Duo — variante impression A4.
 *
 * Conserve l'identité du PDF du prototype : le partage 35 % / 65 %, les cartes
 * à bord fin, la hiérarchie typographique. Ce qui change :
 *
 *   - le prototype figeait `html,body{width:210mm;height:297mm;overflow:hidden}`
 *     et une grille 2×2 en lignes fixes : tout contenu excédentaire était
 *     silencieusement coupé. Ici le contenu s'écoule et se pagine ;
 *   - marges portées à 13 mm, dans la zone imprimable de toute imprimante ;
 *   - `break-inside: avoid` sur chaque entrée, plus veuves et orphelines ;
 *   - rappel du nom en tête des pages suivantes ;
 *   - lecture humaine assumée : photo, logos, accent conservés. La contrainte
 *     ATS est portée par l'export LaTeX, pas par ce document.
 */

import type { ReactNode } from "react";

import { formatRange } from "../../../domain/cv/dates";
import { toHtml } from "../../../domain/cv/richtext";
import { resolveLocalized } from "../../../domain/cv/schema";
import { renderableSections, resolveSections } from "../../../domain/cv/sections";
import { duoTokens, fontVars, themeVars, type DesignTokens } from "../tokens";
import type {
  AssetRef,
  CVDocument,
  Locale,
  Localized,
} from "../../../domain/cv/types";

export function printStyles(tokens: DesignTokens = duoTokens, density = 1): string {
  const lead = density < 1 ? 1.35 : 1.45;
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

:root{${themeVars(tokens.light)};${fontVars(tokens, density)}}
[data-theme="dark"]{${themeVars(tokens.dark)}}

@page{
  size:A4 portrait;
  margin:13mm 13mm 14mm;
}
@page:first{margin-top:12mm}

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--tx)}
body{
  font-family:var(--f-body);
  font-size:calc(9.4pt * var(--d));
  line-height:${lead};
  orphans:3;widows:3;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

/* Rappel discret du nom à partir de la deuxième page. */
.pg-runner{
  display:none;
  font-family:var(--f-util);font-size:7pt;letter-spacing:.14em;text-transform:uppercase;
  color:var(--mu);padding-bottom:2mm;margin-bottom:3mm;border-bottom:.4pt solid var(--bd);
}
.pg-sheet{display:grid;grid-template-columns:35% 1fr;gap:6mm;align-items:start}

/* ── Colonne latérale ───────────────────────────────────────────────── */
.pg-aside{display:flex;flex-direction:column;gap:4mm}
.pg-card{
  background:var(--s1);border:.4pt solid var(--bd);border-radius:3mm;
  padding:4mm;break-inside:avoid;
}
.pg-photo{
  width:100%;aspect-ratio:4/5;border-radius:2.5mm;overflow:hidden;
  border:.4pt solid var(--bd);margin-bottom:3mm;
}
.pg-photo img{width:100%;height:100%;object-fit:cover;display:block}
.pg-name{
  font-family:var(--f-display);font-size:15pt;font-weight:600;
  line-height:1.12;letter-spacing:-.01em;text-wrap:balance;
}
.pg-headline{
  font-family:var(--f-util);font-size:6.8pt;font-weight:500;
  letter-spacing:.13em;text-transform:uppercase;color:var(--ac);margin-top:1mm;
}
.pg-contact{list-style:none;margin-top:2.5mm;font-size:8pt;display:grid;gap:.8mm}
.pg-contact a{color:inherit;text-decoration:none}
.pg-contact li{word-break:break-word}

.pg-label{
  font-family:var(--f-util);font-size:6.4pt;font-weight:600;
  letter-spacing:.16em;text-transform:uppercase;color:var(--ac);
  padding-bottom:1mm;margin-bottom:2mm;border-bottom:.5pt solid var(--ac);
}

/* Compétences en pastilles : compact et lisible en colonne étroite, là où une
   liste verticale mangerait une demi-page sur un profil fourni. */
.pg-chips{list-style:none;display:flex;flex-wrap:wrap;gap:1mm;margin:0}
.pg-chips li{
  font-size:7.4pt;line-height:1.25;
  border:.4pt solid var(--bd);border-radius:100px;padding:.3mm 1.6mm;
  break-inside:avoid;
}
.pg-subgroup{
  font-family:var(--f-util);font-size:6.4pt;letter-spacing:.1em;
  text-transform:uppercase;color:var(--mu);margin:1.5mm 0 1mm;
}

.pg-lang{display:grid;gap:1.2mm}
.pg-lang__row{display:flex;justify-content:space-between;gap:2mm;align-items:baseline}
.pg-lang__name{font-family:var(--f-display);font-weight:600;font-size:8.4pt}
.pg-lang__lvl{font-family:var(--f-util);font-size:7.4pt;color:var(--ac)}
.pg-lang__cert{display:block;font-size:6.8pt;color:var(--mu)}

.pg-cert{display:flex;gap:2mm;align-items:center;padding:1mm 0;break-inside:avoid}
.pg-cert + .pg-cert{border-top:.3pt solid var(--bd)}
.pg-cert__logo{
  width:6mm;height:6mm;flex-shrink:0;border-radius:1.5mm;overflow:hidden;
  border:.4pt solid var(--bd);background:var(--bg);
}
.pg-cert__logo img{width:100%;height:100%;object-fit:contain}
.pg-cert__issuer{
  font-family:var(--f-util);font-size:6.2pt;font-weight:600;
  letter-spacing:.08em;text-transform:uppercase;color:var(--ac);
}
.pg-cert__name{font-family:var(--f-display);font-size:8pt;font-weight:600;line-height:1.2}
.pg-cert__detail{font-size:6.8pt;color:var(--mu)}

.pg-certgrid{display:grid;grid-template-columns:1fr 1fr;gap:1mm 5mm}
.pg-certitem{padding:1.1mm 0;break-inside:avoid;border-top:.3pt solid var(--bd)}
.pg-certitem:nth-child(-n+2){border-top:0}

.pg-interest{font-size:8pt;line-height:1.35;padding:.7mm 0;break-inside:avoid}
.pg-interest b{font-family:var(--f-display);color:var(--ac);font-weight:600}
.pg-interest span{color:var(--mu)}

/* ── Colonne principale ─────────────────────────────────────────────── */
.pg-main{display:flex;flex-direction:column;gap:5mm}
.pg-section{break-inside:auto}
.pg-section__title{
  font-family:var(--f-util);font-size:8pt;font-weight:600;
  letter-spacing:.18em;text-transform:uppercase;color:var(--ac);
  padding-bottom:1.2mm;margin-bottom:2.5mm;border-bottom:.6pt solid var(--ac);
  break-after:avoid;
}

.pg-entry{break-inside:avoid;padding:1.6mm 0;position:relative}
.pg-entry + .pg-entry{border-top:.3pt solid var(--bd)}
.pg-entry__head{display:flex;gap:3mm;align-items:flex-start}
.pg-entry__logo{
  width:7.5mm;height:7.5mm;flex-shrink:0;border-radius:2mm;overflow:hidden;
  border:.4pt solid var(--bd);background:var(--bg);
}
.pg-entry__logo img{width:100%;height:100%;object-fit:contain}
.pg-entry__role{
  font-family:var(--f-display);font-size:10pt;font-weight:600;line-height:1.2;
}
.pg-entry__org{font-size:8.4pt;color:var(--mu);font-style:italic;margin-top:.3mm}
.pg-entry__meta{
  font-family:var(--f-util);font-size:7pt;font-weight:500;
  letter-spacing:.09em;text-transform:uppercase;color:var(--ac);
  white-space:nowrap;text-align:right;padding-top:.6mm;
}
.pg-entry__tag{
  display:block;font-size:6.4pt;color:var(--mu);letter-spacing:.08em;margin-top:.4mm;
}
.pg-bullets{
  list-style:none;margin:1.4mm 0 0;padding-left:3mm;
  border-left:1pt solid rgba(var(--ar),.3);
  display:grid;gap:.7mm;font-size:8.6pt;color:var(--mu);
}
.pg-bullets li{line-height:1.38}
.pg-bullets a{color:var(--ac);text-decoration:none}
.pg-note{
  display:inline-block;font-size:7.4pt;color:var(--ac);margin-top:.8mm;
  border:.4pt solid var(--bd);border-radius:100px;padding:.2mm 2mm;
}

@media print{
  .pg-runner{display:block}
  /* La première occurrence est masquée : le rappel ne concerne que les
     pages suivantes, où l'en-tête complet n'est plus visible. */
  .pg-sheet > .pg-runner:first-child{display:none}
}
`.trim();
}

export interface PrintProps {
  doc: CVDocument;
  locale?: Locale;
}

export function CVDuoPrint({ doc, locale }: PrintProps): ReactNode {
  const active = locale ?? doc.locales.primary;
  const primary = doc.locales.primary;
  const t = <T,>(v: Localized<T> | undefined): T | undefined =>
    resolveLocalized(v, active, primary);
  const { data } = doc;
  // Même registre que l'écran : l'ordre et la visibilité choisis dans le
  // studio s'appliquent aussi au PDF.
  const sections = renderableSections(resolveSections(data, doc.presentation, active, primary));
  const shows = (key: string): boolean => sections.some((section) => section.key === key);
  const titleOf = (key: string, fallback: string): string =>
    sections.find((section) => section.key === key)?.title ?? fallback;
  const fullName = `${data.personal.firstName} ${data.personal.lastName}`.trim();

  const L =
    active === "fr"
      ? {
          experiences: "Expérience professionnelle",
          education: "Formation",
          skills: "Compétences",
          languages: "Langues",
          certifications: "Certifications",
          interests: "Centres d'intérêt",
        }
      : {
          experiences: "Professional Experience",
          education: "Education",
          skills: "Skills",
          languages: "Languages",
          certifications: "Certifications",
          interests: "Interests",
        };

  return (
    <div className="pg-sheet">
      <div className="pg-runner">{fullName}</div>

      <aside className="pg-aside">
        <div className="pg-card">
          {data.personal.photo && (
            <div className="pg-photo">
              <PrintImg asset={data.personal.photo} alt={fullName} width={512} />
            </div>
          )}
          <h1 className="pg-name">{fullName}</h1>
          {t(data.personal.headline) && (
            <p className="pg-headline">{t(data.personal.headline)}</p>
          )}
          <ul className="pg-contact">
            {data.personal.email && <li>{data.personal.email}</li>}
            {data.personal.phone && <li>{data.personal.phone}</li>}
            {data.personal.location && (
              <li>
                {[data.personal.location.city, data.personal.location.region]
                  .filter(Boolean)
                  .join(", ")}
              </li>
            )}
            {data.personal.links.map((link) => (
              <li key={link.id}>
                <a href={link.href}>{link.href.replace(/^https?:\/\/(www\.)?/, "")}</a>
              </li>
            ))}
          </ul>
        </div>

        {data.skills.length > 0 && shows("skills") && (
          <div className="pg-card">
            <p className="pg-label">{titleOf("skills", L.skills)}</p>
            {data.skills.map((group) => (
              <div key={group.id}>
                {data.skills.length > 1 && <p className="pg-subgroup">{t(group.name)}</p>}
                <ul className="pg-chips">
                  {group.skills.map((skill) => (
                    <li key={skill.id}>{t(skill.name)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {data.languages.length > 0 && shows("languages") && (
          <div className="pg-card">
            <p className="pg-label">{titleOf("languages", L.languages)}</p>
            <div className="pg-lang">
              {data.languages.map((lang) => (
                <div className="pg-lang__row" key={lang.id}>
                  <span>
                    <span className="pg-lang__name">{t(lang.name)}</span>
                    {lang.certification && (
                      <span className="pg-lang__cert">
                        {lang.certification.name}
                        {lang.certification.score ? ` ${lang.certification.score}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="pg-lang__lvl">
                    {lang.level === "native" ? (active === "fr" ? "Natif" : "Native") : lang.level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.interests.length > 0 && shows("interests") && (
          <div className="pg-card">
            <p className="pg-label">{titleOf("interests", L.interests)}</p>
            {data.interests.map((interest) => {
              const nodes = t(interest.text);
              return (
                <p className="pg-interest" key={interest.id}>
                  <b>{t(interest.label)} </b>
                  {nodes && <span dangerouslySetInnerHTML={{ __html: toHtml(nodes) }} />}
                </p>
              );
            })}
          </div>
        )}
      </aside>

      <main className="pg-main">
        {data.experiences.length > 0 && shows("experiences") && (
          <section className="pg-section">
            <h2 className="pg-section__title">{titleOf("experiences", L.experiences)}</h2>
            {data.experiences.map((entry) => {
              const bullets = t(entry.bullets) ?? [];
              return (
                <article className="pg-entry" key={entry.id}>
                  <div className="pg-entry__head">
                    {entry.logo && (
                      <span className="pg-entry__logo">
                        <PrintImg asset={entry.logo} alt="" width={128} />
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 className="pg-entry__role">{t(entry.role)}</h3>
                      <p className="pg-entry__org">
                        {entry.organization}
                        {entry.location ? ` · ${entry.location.city}` : ""}
                      </p>
                    </div>
                    <p className="pg-entry__meta">
                      {formatRange(entry.period, active, "short")}
                      {entry.contract && <span className="pg-entry__tag">{entry.contract}</span>}
                    </p>
                  </div>
                  {bullets.length > 0 && (
                    <ul className="pg-bullets">
                      {bullets.map((bullet, index) => (
                        <li key={index} dangerouslySetInnerHTML={{ __html: toHtml(bullet) }} />
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </section>
        )}

        {data.education.length > 0 && shows("education") && (
          <section className="pg-section">
            <h2 className="pg-section__title">{titleOf("education", L.education)}</h2>
            {data.education.map((entry) => (
              <article className="pg-entry" key={entry.id}>
                <div className="pg-entry__head">
                  {entry.logo && (
                    <span className="pg-entry__logo">
                      <PrintImg asset={entry.logo} alt="" width={128} />
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="pg-entry__role">{t(entry.degree)}</h3>
                    <p className="pg-entry__org">
                      {entry.institution}
                      {entry.location ? ` · ${entry.location.city}` : ""}
                    </p>
                    {t(entry.distinction) && <p className="pg-note">{t(entry.distinction)}</p>}
                  </div>
                  <p className="pg-entry__meta">{formatRange(entry.period, active, "year")}</p>
                </div>
              </article>
            ))}
          </section>
        )}

        {data.certifications.length > 0 && shows("certifications") && (
          <section className="pg-section">
            <h2 className="pg-section__title">{titleOf("certifications", L.certifications)}</h2>
            <div className="pg-certgrid">
              {data.certifications.map((cert) => (
                <div className="pg-certitem" key={cert.id}>
                  {cert.issuer && <p className="pg-cert__issuer">{cert.issuer}</p>}
                  <p className="pg-cert__name">{t(cert.name)}</p>
                  {t(cert.detail) && <p className="pg-cert__detail">{t(cert.detail)}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function PrintImg({
  asset,
  alt,
  width,
}: {
  asset: AssetRef;
  alt: string;
  width: number;
}): ReactNode {
  const variant =
    Object.entries(asset.variants)
      .filter(([key]) => key.startsWith("webp-"))
      .map(([, value]) => value)
      .sort((a, b) => a.width - b.width)
      .find((v) => v.width >= width) ?? asset;

  return (
    <img
      src={variant.url}
      alt={alt}
      style={{
        objectPosition: `${asset.focal.x}% ${asset.focal.y}%`,
        ...(asset.zoom > 1 ? { transform: `scale(${asset.zoom})` } : {}),
      }}
    />
  );
}
