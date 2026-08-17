/**
 * Template Duo — arbre de composants.
 *
 * Un seul arbre alimente la page publique Next.js, l'aperçu de l'éditeur et
 * l'export HTML autonome. Aucun `use client`, aucun accès au DOM : le
 * comportement interactif vient du runtime injecté séparément, ce qui rend
 * ces composants utilisables en RSC comme en `renderToStaticMarkup`.
 */

import type { ReactNode } from "react";

import { formatDuration, formatRange, durationInMonths } from "../../../domain/cv/dates";
import { toHtml } from "../../../domain/cv/richtext";
import { resolveLocalized } from "../../../domain/cv/schema";
import { renderableSections, resolveSections, type ResolvedSection } from "../../../domain/cv/sections";
import type {
  AssetRef,
  Certification,
  CVDocument,
  Education,
  Experience,
  Interest,
  Language,
  Locale,
  Localized,
  RichText,
} from "../../../domain/cv/types";

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "native"] as const;

const SECTION_FALLBACK: Record<Locale, Record<string, string>> = {
  fr: {
    experiences: "Expériences",
    education: "Formations",
    languages: "Compétences",
    interests: "Profil",
    certifications: "Certifications",
  },
  en: {
    experiences: "Experience",
    education: "Education",
    languages: "Skills",
    interests: "Profile",
    certifications: "Certifications",
  },
};

const LABELS: Record<Locale, Record<string, string>> = {
  fr: { languages: "Langues", certifications: "Certificats", present: "en cours" },
  en: { languages: "Languages", certifications: "Certifications", present: "current" },
};

export interface DuoProps {
  doc: CVDocument;
  locale?: Locale;
  /** Masque la barre d'outils dans l'aperçu de l'éditeur. */
  withToolbar?: boolean;
}

export function CVDuo({ doc, locale, withToolbar = true }: DuoProps): ReactNode {
  const active = locale ?? doc.locales.primary;
  const primary = doc.locales.primary;
  const t = <T,>(v: Localized<T> | undefined): T | undefined =>
    resolveLocalized(v, active, primary);
  const { data, presentation } = doc;

  const title = (key: string): string => {
    const override = presentation.sections.find((s) => s.key === key)?.title;
    return (
      (override ? resolveLocalized(override, active, primary) : undefined) ??
      SECTION_FALLBACK[active][key] ??
      key
    );
  };

  const fullName = `${data.personal.firstName} ${data.personal.lastName}`.trim();

  // L'ordre, la visibilité, les intitulés et la colonne d'accueil viennent
  // tous de `Presentation.sections` : le gabarit n'impose plus rien.
  const sections = renderableSections(resolveSections(data, presentation, active, primary));
  const aside = sections.filter((section) => section.column === "aside");
  const main = sections.filter((section) => section.column === "main");

  const render = (section: ResolvedSection): ReactNode => (
    <section
      className="cv-sec cv-reveal"
      id={`sec-${section.key.replace(":", "-")}`}
      key={section.key}
      data-kind={section.kind}
      style={{ ["--order" as string]: sections.indexOf(section) }}
    >
      {section.kind !== "profile" && <h2 className="cv-sec__title">{section.title}</h2>}
      <div className="cv-sec__body">{renderContent(section)}</div>
    </section>
  );

  const renderContent = (section: ResolvedSection): ReactNode => {
    switch (section.kind) {
      case "profile":
        return (
          <div className="cv-identity">
            {data.personal.photo && (
              <figure className="cv-photo">
                <Img asset={data.personal.photo} alt={fullName} width={512} />
              </figure>
            )}
            <h1 className="cv-name">{fullName}</h1>
            {t(data.personal.headline) && (
              <p className="cv-headline">{t(data.personal.headline)}</p>
            )}
            <ContactList doc={doc} />
          </div>
        );

      case "summary": {
        const nodes = t(data.summary);
        return nodes ? (
          <p className="cv-summary" dangerouslySetInnerHTML={{ __html: toHtml(nodes) }} />
        ) : null;
      }

      case "experiences":
        return (
          <div className="cv-timeline">
            {data.experiences.map((entry, index) => (
              <ExperienceRow
                key={entry.id}
                entry={entry}
                locale={active}
                t={t}
                defaultOpen={index === 0}
              />
            ))}
          </div>
        );

      case "education":
        return (
          <>
            {data.education.map((entry) => (
              <EducationRow key={entry.id} entry={entry} locale={active} t={t} />
            ))}
          </>
        );

      case "skills":
        return (
          <>
            {data.skills.map((group) => (
              <div key={group.id} className="cv-skills">
                {data.skills.length > 1 && <p className="cv-sublabel">{t(group.name)}</p>}
                <ul className="cv-chips">
                  {group.skills.map((skill) => (
                    <li key={skill.id} className="cv-chip">
                      {t(skill.name)}
                      {skill.level && (
                        <span className="cv-chip__level" aria-label={`niveau ${skill.level}/5`}>
                          {Array.from({ length: 5 }, (_, index) => (
                            <i key={index} data-on={index < skill.level!} />
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        );

      case "languages":
        return (
          <div className="cv-lang">
            {data.languages.map((lang) => (
              <LanguageRow key={lang.id} lang={lang} t={t} />
            ))}
          </div>
        );

      case "certifications":
        return (
          <>
            {data.certifications.map((cert) => (
              <CertificationRow key={cert.id} cert={cert} t={t} />
            ))}
          </>
        );

      case "projects":
        return (
          <>
            {data.projects.map((project) => (
              <article className="cv-edu" key={project.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="cv-edu__degree">{t(project.name)}</h3>
                  {t(project.role) && <p className="cv-edu__org">{t(project.role)}</p>}
                  {(t(project.bullets) ?? []).length > 0 && (
                    <ul className="cv-xp__bullets">
                      {(t(project.bullets) ?? []).map((bullet, index) => (
                        <Bullet key={index} nodes={bullet} />
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </>
        );

      case "interests":
        return (
          <>
            {data.interests.map((interest) => (
              <InterestRow key={interest.id} interest={interest} t={t} />
            ))}
          </>
        );

      case "custom": {
        const custom = data.customSections.find((entry) => entry.id === section.customId);
        return (
          <>
            {(custom?.entries ?? []).map((entry) => (
              <article className="cv-edu" key={entry.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="cv-edu__degree">{t(entry.title)}</h3>
                  {t(entry.subtitle) && <p className="cv-edu__org">{t(entry.subtitle)}</p>}
                  {(t(entry.bullets) ?? []).length > 0 && (
                    <ul className="cv-xp__bullets">
                      {(t(entry.bullets) ?? []).map((bullet, index) => (
                        <Bullet key={index} nodes={bullet} />
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="cv-root" data-cv-root="">
      <nav className="cv-nav" aria-label="Sections">
        {sections
          .filter((section) => section.kind !== "profile")
          .map((section) => (
            <a key={section.key} href={`#sec-${section.key.replace(":", "-")}`}>
              {section.title}
            </a>
          ))}
      </nav>

      <div className="cv-grid">
        <aside className="cv-col cv-col--aside">{aside.map(render)}</aside>
        <div className="cv-col cv-col--main">{main.map(render)}</div>
      </div>

      {withToolbar && <Toolbar />}
    </div>
  );
}

/* ── Sous-composants ───────────────────────────────────────────────────── */

type Resolver = <T>(v: Localized<T> | undefined) => T | undefined;

function ExperienceRow({
  entry,
  locale,
  t,
  defaultOpen,
}: {
  entry: Experience;
  locale: Locale;
  t: Resolver;
  defaultOpen: boolean;
}): ReactNode {
  const bullets = t(entry.bullets) ?? [];
  const months = durationInMonths(entry.period);
  const hasBody = bullets.length > 0;

  return (
    <article className="cv-xp cv-reveal" data-xp="" data-open={defaultOpen ? "true" : "false"}>
      <button
        className="cv-xp__head"
        type="button"
        data-xp-toggle=""
        aria-expanded={defaultOpen}
        disabled={!hasBody}
      >
        <span className="cv-xp__main">
          <span className="cv-xp__meta">
            <span>{formatRange(entry.period, locale, "short")}</span>
            {months > 1 && (
              <span className="cv-xp__duration">{formatDuration(months, locale)}</span>
            )}
          </span>
          <span className="cv-xp__role">{t(entry.role)}</span>
          <span className="cv-xp__org">
            {entry.organization}
            {entry.location ? ` · ${entry.location.city}` : ""}
          </span>
        </span>
        {entry.contract && <span className="cv-xp__tag">{entry.contract}</span>}
        {entry.logo && (
          <span className="cv-logo">
            <Img asset={entry.logo} alt="" width={128} />
          </span>
        )}
        {hasBody && (
          <svg className="cv-xp__chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M4 6.5L8 10.5L12 6.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {hasBody && (
        <div className="cv-xp__body">
          <div className="cv-xp__bodyInner">
            <ul className="cv-xp__bullets">
              {bullets.map((bullet, index) => (
                <Bullet key={index} nodes={bullet} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </article>
  );
}

function EducationRow({
  entry,
  locale,
  t,
}: {
  entry: Education;
  locale: Locale;
  t: Resolver;
}): ReactNode {
  return (
    <article className="cv-edu cv-reveal">
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="cv-edu__date">{formatRange(entry.period, locale, "year")}</p>
        <h3 className="cv-edu__degree">{t(entry.degree)}</h3>
        <p className="cv-edu__org">
          {entry.institution}
          {entry.location ? ` — ${entry.location.city}` : ""}
        </p>
        {t(entry.distinction) && <p className="cv-edu__note">{t(entry.distinction)}</p>}
      </div>
      {entry.logo && (
        <span className="cv-logo">
          <Img asset={entry.logo} alt="" width={128} />
        </span>
      )}
    </article>
  );
}

function LanguageRow({ lang, t }: { lang: Language; t: Resolver }): ReactNode {
  const index = CEFR_ORDER.indexOf(lang.level);
  return (
    <div className="cv-lang__row cv-reveal">
      <div>
        <span className="cv-lang__name">{t(lang.name)}</span>
        {lang.certification && (
          <span className="cv-lang__cert">
            {lang.certification.name}
            {lang.certification.score ? ` ${lang.certification.score}` : ""}
          </span>
        )}
      </div>
      <div className="cv-lang__scale" aria-label={lang.level}>
        {CEFR_ORDER.slice(0, 6).map((step, i) => (
          <span key={step} className="cv-lang__step" data-on={i <= index ? "true" : "false"} />
        ))}
        <span className="cv-lang__level">{lang.level === "native" ? "C2+" : lang.level}</span>
      </div>
    </div>
  );
}

function CertificationRow({ cert, t }: { cert: Certification; t: Resolver }): ReactNode {
  const name = t(cert.name) ?? "";
  return (
    <article className="cv-cert cv-reveal">
      <span className="cv-logo">
        {cert.logo ? (
          <Img asset={cert.logo} alt="" width={128} />
        ) : (
          <FallbackLogo seed={cert.issuer || name} />
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {cert.issuer && <p className="cv-cert__issuer">{cert.issuer}</p>}
        <p className="cv-cert__name">{name}</p>
        {t(cert.detail) && <p className="cv-cert__detail">{t(cert.detail)}</p>}
        {cert.url && (
          <a href={cert.url} target="_blank" rel="noopener noreferrer">
            Vérifier ↗
          </a>
        )}
      </div>
    </article>
  );
}

function InterestRow({ interest, t }: { interest: Interest; t: Resolver }): ReactNode {
  const nodes = t(interest.text);
  return (
    <p className="cv-interest cv-reveal">
      {interest.icon && (
        <span className="cv-interest__icon" aria-hidden="true">
          {interest.icon}
        </span>
      )}
      <span>
        <span className="cv-interest__label">{t(interest.label)} </span>
        {nodes && (
          <span
            className="cv-interest__text"
            dangerouslySetInnerHTML={{ __html: toHtml(nodes) }}
          />
        )}
      </span>
    </p>
  );
}

function Bullet({ nodes }: { nodes: RichText }): ReactNode {
  // `toHtml` échappe intégralement et n'émet que <strong>, <em> et <a> :
  // l'AST est fermé, donc aucune balise arbitraire ne peut transiter ici.
  return <li dangerouslySetInnerHTML={{ __html: toHtml(nodes) }} />;
}

function ContactList({ doc }: { doc: CVDocument }): ReactNode {
  const { personal } = doc.data;
  return (
    <ul className="cv-contact">
      {personal.email && (
        <li>
          <Icon name="mail" />
          <a href={`mailto:${personal.email}`}>{personal.email}</a>
        </li>
      )}
      {personal.phone && (
        <li>
          <Icon name="phone" />
          <span>{personal.phone}</span>
        </li>
      )}
      {personal.location && (
        <li>
          <Icon name="pin" />
          <span>{[personal.location.city, personal.location.region].filter(Boolean).join(", ")}</span>
        </li>
      )}
      {personal.links.map((link) => (
        <li key={link.id}>
          <Icon name="link" />
          <a href={link.href} target="_blank" rel="noopener noreferrer">
            {link.href.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Img({ asset, alt, width }: { asset: AssetRef; alt: string; width: number }): ReactNode {
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
      width={variant.width}
      height={variant.height}
      loading="lazy"
      decoding="async"
      style={{
        objectPosition: `${asset.focal.x}% ${asset.focal.y}%`,
        ...(asset.zoom > 1 ? { transform: `scale(${asset.zoom})` } : {}),
      }}
    />
  );
}

/** Repli par initiale, repris du `certSVG()` du prototype. */
function FallbackLogo({ seed }: { seed: string }): ReactNode {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  // Variation de luminosité seulement : une roue de teintes complète produisait
  // des pastilles bariolées qui juraient avec l'accent du template.
  const lightness = 26 + (hash % 4) * 6;
  return (
    <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill={`hsl(32 14% ${lightness}%)`} />
      <text
        x="14"
        y="19.5"
        fontSize="12.5"
        textAnchor="middle"
        fill="rgba(255,255,255,.82)"
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
      >
        {(seed[0] ?? "?").toUpperCase()}
      </text>
    </svg>
  );
}

const ICONS = {
  mail: "M2 5h12v8H2z M2 5l6 4 6-4",
  phone: "M3 3h3l1.5 3.5-2 1.5a9 9 0 004.5 4.5l1.5-2L15 12v3h-2A11 11 0 013 5V3z",
  pin: "M8 15s5-4.5 5-8A5 5 0 003 7c0 3.5 5 8 5 8z M8 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  link: "M7 9a3 3 0 004.2 0l2.3-2.3A3 3 0 009.3 2.5L8 3.8 M9 7a3 3 0 00-4.2 0L2.5 9.3a3 3 0 004.2 4.2L8 12.2",
} as const;

function Icon({ name }: { name: keyof typeof ICONS }): ReactNode {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d={ICONS[name]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Toolbar(): ReactNode {
  return (
    <div className="cv-toolbar" data-cv-toolbar="">
      <button className="cv-btn" type="button" data-cv-theme="" aria-label="Changer de thème">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="8" cy="8" r="3.2" />
          <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M13 3l-1.1 1.1M4.1 11.9L3 13" strokeLinecap="round" />
        </svg>
      </button>
      <button className="cv-btn" type="button" data-cv-print="" aria-label="Imprimer">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M4.5 6V2h7v4M4.5 12H3V7h10v5h-1.5M4.5 10h7v4h-7z" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
