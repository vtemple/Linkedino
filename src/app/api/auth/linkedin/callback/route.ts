import { NextResponse } from "next/server";

import {
  exchangeCode,
  fetchUserInfo,
  readConfig,
  STATE_COOKIE,
  verifyState,
} from "../../../../../lib/auth/linkedin-oauth";
import { getJob, saveJob } from "../../../../../lib/jobs/import-store";

export const dynamic = "force-dynamic";

/**
 * Retour de LinkedIn.
 *
 * Vérifie l'état signé, échange le code contre un jeton, récupère l'identité
 * OpenID Connect (dont la photo, absente du domaine PROFILE), puis redirige
 * vers l'écran de progression. Aucune donnée de profil n'est lue ici : c'est
 * l'exécuteur qui interroge l'API de portabilité.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const config = readConfig();

  if (!config) return NextResponse.redirect(`${origin}/?erreur=non_configure`);

  const error = url.searchParams.get("error");
  if (error) {
    const description = url.searchParams.get("error_description") ?? error;
    return NextResponse.redirect(
      `${origin}/?erreur=refus&detail=${encodeURIComponent(description.slice(0, 120))}`,
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const expected = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);

  const jobId = verifyState(state, expected);
  if (!code || !jobId) return NextResponse.redirect(`${origin}/?erreur=etat_invalide`);

  const job = await getJob(jobId);
  if (!job) return NextResponse.redirect(`${origin}/?erreur=session_expiree`);

  try {
    const token = await exchangeCode(config, code);
    const identity = await fetchUserInfo(token.accessToken);

    await saveJob({
      ...job,
      status: "fetching",
      accessToken: token.accessToken,
      extras: Object.fromEntries(
        Object.entries(identity).filter(([, value]) => typeof value === "string"),
      ) as Record<string, string>,
    });
  } catch (cause) {
    await saveJob({
      ...job,
      status: "error",
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }

  const response = NextResponse.redirect(`${origin}/import/${jobId}`);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
