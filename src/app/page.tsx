import { Hero } from "./Hero";
import { warmUpPdf } from "../lib/pdf/render";

export const dynamic = "force-dynamic";

/**
 * Landing.
 *
 * Une seule barre, trois formats. Le choix du format se fait avant la
 * génération parce que c'est la vraie question que se pose l'utilisateur —
 * pas « quel modèle » ni « quelle mise en page ».
 */
export default function LandingPage() {
  // Démarre Chromium en tâche de fond dès la page d'accueil : au moment où
  // l'utilisateur demande son PDF, le navigateur est déjà chaud.
  void warmUpPdf();
  return <Hero />;
}
