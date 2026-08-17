import { FallbackImport } from "./FallbackImport";

/**
 * Landing.
 *
 * Une seule action : déposer son PDF LinkedIn. Pas de champ d'URL — coller un
 * lien ne donnerait accès à rien, et le proposer promettrait une capacité que
 * nous n'avons pas. L'utilisateur fournit lui-même son fichier.
 *
 * Composant serveur : aucun JavaScript n'est nécessaire pour l'afficher.
 */

const FORMATS: Array<{
  label: string;
  tagline: string;
  detail: string;
  preview: "grid" | "sheet" | "lines";
}> = [
  {
    label: "CV interactif",
    tagline: "Pour être lu à l'écran",
    detail:
      "Page responsive, chronologie dépliable, thème clair et sombre. Un fichier HTML autonome, partageable par lien.",
    preview: "grid",
  },
  {
    label: "CV PDF",
    tagline: "Pour être lu par un recruteur",
    detail:
      "A4 paginé, typographie soignée, photo et logos. Le document qu'on joint à une candidature.",
    preview: "sheet",
  },
  {
    label: "CV LaTeX ATS",
    tagline: "Pour être lu par un robot",
    detail:
      "Une colonne, aucune image, intitulés standards. Optimisé pour les logiciels de tri de candidatures.",
    preview: "lines",
  },
];

export function Hero() {
  return (
    <main className="hero">
      <div className="hero__inner">
        <p className="hero__eyebrow">Un profil · trois formats</p>
        <h1 className="hero__title">
          Transformez votre profil LinkedIn
          <br />
          <em>en CV professionnel.</em>
        </h1>
        <p className="hero__lead">
          Déposez le PDF de votre profil. Le CV est construit par des règles explicites —
          aucun modèle de langage, aucune reformulation inventée, un résultat reproductible
          à l&apos;identique.
        </p>

        <FallbackImport />

        <section className="formats" aria-label="Formats générés">
          <p className="formats__legend">Générés ensemble, depuis la même source</p>
          {FORMATS.map((item) => (
            <article className="format" key={item.label}>
              <FormatPreview kind={item.preview} />
              <span className="format__label">{item.label}</span>
              <span className="format__tagline">{item.tagline}</span>
              <span className="format__detail">{item.detail}</span>
            </article>
          ))}
        </section>

        <p className="hero__foot">
          Les trois formats sortent de la même source de données. Modifiez le CV une fois,
          les trois suivent.
        </p>
        <p className="legal">
          Vos données ne quittent pas votre machine et le serveur qui génère le CV. Aucune
          donnée n&apos;est récupérée depuis LinkedIn, aucune protection n&apos;est
          contournée : vous fournissez vous-même votre fichier.
        </p>
      </div>
    </main>
  );
}

/** Miniature du format : la forme du document en dit plus qu'un pictogramme. */
function FormatPreview({ kind }: { kind: "grid" | "sheet" | "lines" }) {
  return (
    <span className="format__preview" aria-hidden="true">
      <svg viewBox="0 0 64 40" fill="none">
        {kind === "grid" && (
          <>
            {[0, 1, 2, 3].map((column) => (
              <rect key={column} x={2 + column * 15.5} y={2} width={13.5} height={36} rx={2} className="pv-fill" />
            ))}
            {[4, 19.5, 35, 50.5].map((x) => (
              <rect key={x} x={x} y="5" width="9" height="1.6" rx=".8" className="pv-accent" />
            ))}
            {[9, 13, 17, 21].map((y) => (
              <rect key={y} x="19.5" y={y} width="10.5" height="1.2" rx=".6" className="pv-line" />
            ))}
          </>
        )}
        {kind === "sheet" && (
          <>
            <rect x="18" y="1" width="28" height="38" rx="1.5" className="pv-fill" />
            <rect x="21" y="4" width="8" height="10" rx="1" className="pv-accent" opacity=".55" />
            <rect x="21" y="16" width="8" height="1.2" rx=".6" className="pv-line" />
            <rect x="21" y="19" width="6" height="1.2" rx=".6" className="pv-line" />
            <rect x="32" y="4" width="11" height="1.6" rx=".8" className="pv-accent" />
            {[8, 11, 14, 17, 20, 23, 26, 29].map((y) => (
              <rect key={y} x="32" y={y} width={y % 3 === 2 ? 8 : 11} height="1.2" rx=".6" className="pv-line" />
            ))}
          </>
        )}
        {kind === "lines" && (
          <>
            <rect x="2" y="1" width="60" height="38" rx="1.5" className="pv-fill" />
            <rect x="6" y="5" width="18" height="2" rx="1" className="pv-accent" />
            <rect x="6" y="10" width="52" height="1.2" rx=".6" className="pv-line" />
            <rect x="6" y="15" width="14" height="1.6" rx=".8" className="pv-accent" />
            {[19, 22.5, 26, 29.5, 33].map((y) => (
              <rect key={y} x="6" y={y} width={y > 29 ? 34 : 52} height="1.2" rx=".6" className="pv-line" />
            ))}
          </>
        )}
      </svg>
    </span>
  );
}
