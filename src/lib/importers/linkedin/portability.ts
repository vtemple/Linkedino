/**
 * Member Data Portability API (3rd Party) — client.
 *
 * Seule API officielle donnant accès aux postes, formations, compétences,
 * langues et certifications d'un membre, sur son consentement explicite.
 *
 * Contraintes vérifiées dans la documentation LinkedIn :
 *   - scope `r_dma_portability_3rd_party` ;
 *   - en-tête `LinkedIn-Version: 202312` obligatoire et figé sur cet endpoint,
 *     toute autre valeur renvoie 426 NONEXISTENT_VERSION ;
 *   - seuls les membres de l'EEE peuvent consentir ;
 *   - l'instantané est constitué au moment du consentement, et tous les
 *     domaines ne sont pas disponibles en même temps — d'où la scrutation.
 *
 * Aucun cookie, aucune session, aucun scraping : uniquement OAuth 2.0 et
 * l'endpoint REST documenté.
 */

import { CV_DOMAINS, type DomainKey, type RawProfile, type RawSection } from "../types";

const API_BASE = "https://api.linkedin.com/rest";
const LINKEDIN_VERSION = "202312";

export interface SnapshotElement {
  snapshotDomain: string;
  snapshotData: Array<Record<string, string>>;
}

export type DomainStatus = "pending" | "ok" | "empty" | "error";

/** Abstraction du transport : permet de rejouer des données de démonstration
 *  sans introduire de branche conditionnelle dans la logique métier. */
export interface LinkedInTransport {
  fetchDomain(
    accessToken: string,
    domain: DomainKey,
  ): Promise<{ status: DomainStatus; rows: Array<Record<string, string>>; detail?: string }>;
}

/* ── Transport HTTP réel ───────────────────────────────────────────────── */

export class HttpPortabilityTransport implements LinkedInTransport {
  async fetchDomain(
    accessToken: string,
    domain: DomainKey,
  ): Promise<{ status: DomainStatus; rows: Array<Record<string, string>>; detail?: string }> {
    const rows: Array<Record<string, string>> = [];
    let start = 0;

    // La réponse est paginée et le champ `total` n'est pas fiable : la
    // documentation demande de boucler jusqu'à épuisement.
    for (let page = 0; page < 50; page += 1) {
      const url = `${API_BASE}/memberSnapshotData?q=criteria&domain=${domain}&start=${start}&count=10`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "LinkedIn-Version": LINKEDIN_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        cache: "no-store",
      });

      if (response.status === 404) return { status: "empty", rows };
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        // 429 ou 5xx : l'instantané n'est pas prêt, on réessaiera au tick suivant.
        const retryable = response.status === 429 || response.status >= 500;
        return {
          status: retryable ? "pending" : "error",
          rows,
          detail: `HTTP ${response.status} ${body.slice(0, 160)}`,
        };
      }

      const payload = (await response.json()) as {
        elements?: SnapshotElement[];
        paging?: { links?: Array<{ rel: string }> };
      };

      const element = payload.elements?.[0];
      if (!element) break;
      rows.push(...(element.snapshotData ?? []));

      const hasNext = payload.paging?.links?.some((link) => link.rel === "next");
      if (!hasNext) break;
      start += 1;
    }

    return { status: rows.length > 0 ? "ok" : "empty", rows };
  }
}

/* ── Transport de démonstration ────────────────────────────────────────── */

/**
 * Rejoue une charge utile de la même forme que l'API, à partir d'un jeu de
 * données figé. Sert à parcourir l'expérience complète tant que l'accès
 * LinkedIn n'est pas encore accordé — sans jamais emprunter un autre chemin de
 * code que la production.
 */
export class FixtureTransport implements LinkedInTransport {
  constructor(
    private readonly fixture: Record<string, Array<Record<string, string>>>,
    /** Nombre de sollicitations avant qu'un domaine soit « prêt ».
     *  Reproduit le délai réel de constitution de l'instantané. */
    private readonly readyAfter: Partial<Record<DomainKey, number>> = {},
  ) {}

  private readonly attempts = new Map<DomainKey, number>();

  async fetchDomain(
    _accessToken: string,
    domain: DomainKey,
  ): Promise<{ status: DomainStatus; rows: Array<Record<string, string>>; detail?: string }> {
    const seen = (this.attempts.get(domain) ?? 0) + 1;
    this.attempts.set(domain, seen);

    const threshold = this.readyAfter[domain] ?? 1;
    if (seen < threshold) return { status: "pending", rows: [] };

    const rows = this.fixture[domain] ?? [];
    return { status: rows.length > 0 ? "ok" : "empty", rows };
  }
}

/* ── Orchestration ─────────────────────────────────────────────────────── */

export interface FetchOutcome {
  profile: RawProfile;
  statuses: Record<string, DomainStatus>;
  details: Record<string, string>;
}

/**
 * Récupère les domaines demandés. Un domaine encore en préparation reste
 * `pending` : l'appelant relance, et le CV se complète progressivement plutôt
 * que de faire attendre l'utilisateur devant un écran vide.
 */
export async function fetchSnapshot(
  transport: LinkedInTransport,
  accessToken: string,
  domains: readonly DomainKey[] = CV_DOMAINS,
  extras?: RawProfile["extras"],
): Promise<FetchOutcome> {
  const sections: RawSection[] = [];
  const statuses: Record<string, DomainStatus> = {};
  const details: Record<string, string> = {};

  for (const domain of domains) {
    try {
      const result = await transport.fetchDomain(accessToken, domain);
      statuses[domain] = result.status;
      if (result.detail) details[domain] = result.detail;
      if (result.status === "ok") sections.push({ domain, rows: result.rows });
    } catch (error) {
      statuses[domain] = "error";
      details[domain] = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    profile: {
      source: "linkedin-portability",
      fetchedAt: new Date().toISOString(),
      sections,
      ...(extras ? { extras } : {}),
    },
    statuses,
    details,
  };
}
