/**
 * OAuth 2.0 LinkedIn (Authorization Code Flow, dit « 3-legged »).
 *
 * L'utilisateur déjà connecté à LinkedIn dans son navigateur ne ressaisit rien :
 * LinkedIn reconnaît sa session et n'affiche que l'écran de consentement. C'est
 * le comportement natif du flux, nous n'avons rien à faire pour l'obtenir — et
 * surtout rien à lire de sa session, que nous ne voyons jamais.
 *
 * Deux produits sont demandés ensemble :
 *   - `r_dma_portability_3rd_party` : postes, formations, compétences, langues,
 *     certifications. Réservé aux membres de l'EEE.
 *   - `openid profile email` (Sign In with LinkedIn) : identité et **photo de
 *     profil**, que le domaine PROFILE de l'API de portabilité ne contient pas.
 *
 * LinkedIn ne prend pas en charge PKCE sur ce flux : la protection contre la
 * falsification repose sur le paramètre `state`, lié à un cookie httpOnly.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

export const STATE_COOKIE = "li_oauth_state";

export interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

/** `null` quand l'application n'est pas encore autorisée par LinkedIn : le
 *  parcours bascule alors sur le transport de démonstration. */
export function readConfig(): LinkedInConfig | null {
  const clientId = process.env["LINKEDIN_CLIENT_ID"];
  const clientSecret = process.env["LINKEDIN_CLIENT_SECRET"];
  const redirectUri = process.env["LINKEDIN_REDIRECT_URI"];

  if (!clientId || !clientSecret || !redirectUri) return null;

  const scopes = (
    process.env["LINKEDIN_SCOPES"] ?? "openid profile email r_dma_portability_3rd_party"
  ).split(/\s+/);

  return { clientId, clientSecret, redirectUri, scopes };
}

export function isConfigured(): boolean {
  return readConfig() !== null;
}

/* ── État anti-CSRF ────────────────────────────────────────────────────── */

function secret(): string {
  return process.env["OAUTH_STATE_SECRET"] ?? "developpement-uniquement-non-secret";
}

export function createState(jobId: string): string {
  const nonce = randomBytes(12).toString("base64url");
  const payload = `${jobId}.${nonce}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyState(state: string, expected: string | undefined): string | null {
  if (!state || !expected) return null;

  const a = Buffer.from(state);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const parts = state.split(".");
  if (parts.length !== 3) return null;

  const [jobId, nonce, signature] = parts as [string, string, string];
  const check = createHmac("sha256", secret()).update(`${jobId}.${nonce}`).digest("base64url");

  const s1 = Buffer.from(signature);
  const s2 = Buffer.from(check);
  if (s1.length !== s2.length || !timingSafeEqual(s1, s2)) return null;

  return jobId;
}

/* ── Étapes du flux ────────────────────────────────────────────────────── */

export function buildAuthorizationUrl(config: LinkedInConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    scope: config.scopes.join(" "),
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  scope: string;
}

export async function exchangeCode(
  config: LinkedInConfig,
  code: string,
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Échange du code refusé (HTTP ${response.status}) ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };

  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
    scope: payload.scope ?? "",
  };
}

/**
 * Identité OpenID Connect.
 *
 * C'est la seule voie officielle vers la photo de profil : le domaine PROFILE
 * de l'API de portabilité ne l'expose pas.
 */
export async function fetchUserInfo(accessToken: string): Promise<{
  givenName?: string;
  familyName?: string;
  email?: string;
  pictureUrl?: string;
  locale?: string;
}> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) return {};

  const payload = (await response.json()) as {
    given_name?: string;
    family_name?: string;
    email?: string;
    picture?: string;
    locale?: string | { language?: string };
  };

  const locale =
    typeof payload.locale === "string" ? payload.locale : payload.locale?.language;

  return {
    ...(payload.given_name ? { givenName: payload.given_name } : {}),
    ...(payload.family_name ? { familyName: payload.family_name } : {}),
    ...(payload.email ? { email: payload.email } : {}),
    ...(payload.picture ? { pictureUrl: payload.picture } : {}),
    ...(locale ? { locale } : {}),
  };
}
