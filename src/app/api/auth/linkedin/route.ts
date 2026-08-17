import { NextResponse } from "next/server";

import {
  buildAuthorizationUrl,
  createState,
  readConfig,
  STATE_COOKIE,
} from "../../../../lib/auth/linkedin-oauth";
import { createJob, saveJob } from "../../../../lib/jobs/import-store";
import { DEMO_EXTRAS } from "../../../../lib/importers/linkedin/demo-snapshot";

export const dynamic = "force-dynamic";

/**
 * Départ du parcours.
 *
 * Si l'application est autorisée par LinkedIn, on redirige vers l'écran de
 * consentement officiel : un utilisateur déjà connecté dans son navigateur ne
 * ressaisit rien, LinkedIn reconnaît sa session et se contente de demander
 * l'autorisation. Nous ne voyons jamais cette session.
 *
 * Sans identifiants configurés, le parcours bascule en mode démonstration :
 * même exécuteur, même normaliseur, seul le transport change.
 */
export async function GET(request: Request) {
  const config = readConfig();
  const origin = new URL(request.url).origin;

  if (!config) {
    const job = await saveJob({
      ...(await createJob("demo")),
      status: "authorizing",
      extras: DEMO_EXTRAS,
    });
    return NextResponse.redirect(`${origin}/import/${job.id}`);
  }

  const job = await createJob("live");
  const state = createState(job.id);
  const response = NextResponse.redirect(buildAuthorizationUrl(config, state));

  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return response;
}
