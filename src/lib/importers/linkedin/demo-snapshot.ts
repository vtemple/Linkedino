/**
 * Instantané de démonstration.
 *
 * Reproduit la forme *exacte* des réponses de la Member Snapshot API : des
 * lignes clé/valeur dont les clés sont les en-têtes de colonnes de l'archive
 * LinkedIn (« Company Name », « Started On », « Degree Name »…).
 *
 * Il ne s'agit donc pas d'une simulation du CV final mais d'une simulation de
 * la *source*. Le parcours emprunte le même normaliseur, le même exécuteur et
 * les mêmes écritures que la production ; seul le transport diffère.
 *
 * Les délais reproduisent le comportement documenté : tous les domaines ne
 * sont pas disponibles au même moment après le consentement.
 */

import type { DomainKey } from "../types";

export const DEMO_SNAPSHOT: Record<string, Array<Record<string, string>>> = {
  PROFILE: [
    {
      "First Name": "Camille",
      "Last Name": "Dupont",
      Headline: "Management · Commerce · Audiovisuel",
      Summary:
        "Étudiant en double-cursus classe préparatoire ATS et licence de sciences économiques, avec une expérience opérationnelle en management commercial et en production audiovisuelle.",
      "Geo Location": "Lyon, France",
      Industry: "Retail",
      Websites: "[PERSONAL:https://exemple-test.fr/verification",
      "Maiden Name": "",
      "Birth Date": "",
      "Zip Code": "",
      "Twitter Handles": "",
      "Instant Messengers": "",
      Address: "",
    },
  ],

  EMAIL_ADDRESSES: [
    { "Email Address": "camille.dupont@exemple.fr", Confirmed: "Yes", Primary: "Yes", "Updated On": "" },
  ],

  PHONE_NUMBERS: [{ Number: "06 12 34 56 78", Type: "MOBILE", Extension: "" }],

  POSITIONS: [
    {
      "Company Name": "Institut Bêta",
      Title: "Assistant Logistique Scénique — Stage",
      Description:
        "Suivi avec SAP Fiori de références consommables et fournisseurs.\nMise en place des répétitions et du planning.",
      Location: "Berlin, Allemagne",
      "Started On": "Jun 2025",
      "Finished On": "Jun 2025",
    },
    {
      "Company Name": "Société Alpha",
      Title: "Assistant Manager — Stage",
      Description:
        "Suivi quotidien des indicateurs de performance et reporting.\nEnquête : 72 % d'avis favorables.\nCo-organisation d'une soirée : +145 % de CA.",
      Location: "Lyon, France",
      "Started On": "Nov 2024",
      "Finished On": "Jan 2025",
    },
    {
      "Company Name": "Société Gamma",
      Title: "Conseiller de Vente — CDD",
      Description:
        "Satisfaction client par service personnalisé.\nCA journalier moyen 700 €.\nFidélisation de 14 clients.",
      Location: "Lyon, France",
      "Started On": "Oct 2022",
      "Finished On": "Dec 2022",
    },
    {
      "Company Name": "Atelier Delta",
      Title: "Assistant de Production — Stage",
      Description:
        "Prise de contact avec des distributeurs nationaux.\nOrganisation d'une avant-première.\nBudgétisation d'une scène bar d'époque : 20 k€.",
      Location: "Paris, France",
      "Started On": "Mar 2022",
      "Finished On": "Apr 2022",
    },
  ],

  EDUCATION: [
    {
      "School Name": "Université Fictive",
      "Degree Name": "Double-cursus Classe préparatoire ATS – Licence 3 Sciences Économiques et de Gestion",
      "Start Date": "2025",
      "End Date": "2026",
      Notes: "",
      Activities: "",
    },
    {
      "School Name": "Lycée Imaginaire",
      "Degree Name": "BTS Management Commercial Opérationnel",
      "Start Date": "2023",
      "End Date": "2025",
      Notes: "15,83/20 · Major de promo",
      Activities: "",
    },
    {
      "School Name": "École Exemple",
      "Degree Name": "Cycle professionnel Cinéma et Audiovisuel — post-production",
      "Start Date": "2020",
      "End Date": "2022",
      Notes: "",
      Activities: "",
    },
    {
      "School Name": "Collège Témoin",
      "Degree Name": "Baccalauréat Scientifique — spécialité Physique-Chimie",
      "Start Date": "2017",
      "End Date": "2020",
      Notes: "",
      Activities: "",
    },
  ],

  SKILLS: [
    { Name: "Management commercial" },
    { Name: "SAP Fiori" },
    { Name: "Analyse de performance" },
    { Name: "Relation client" },
    { Name: "Production audiovisuelle" },
    { Name: "Gestion de projet" },
  ],

  LANGUAGES: [
    { Name: "Français", Proficiency: "Native or bilingual proficiency" },
    { Name: "Anglais", Proficiency: "Full professional proficiency" },
    { Name: "Espagnol", Proficiency: "Limited working proficiency" },
    { Name: "Allemand", Proficiency: "Elementary proficiency" },
  ],

  CERTIFICATIONS: [
    {
      Name: "Niveau Avancé — 628/895",
      Authority: "Organisme F",
      Url: "https://exemple-test.fr/verification",
      "License Number": "",
      "Started On": "2025",
      "Finished On": "",
    },
    {
      Name: "Habilitation sécurité niveau 2",
      Authority: "Organisme E",
      Url: "https://exemple-test.fr/verification",
      "License Number": "",
      "Started On": "2024",
      "Finished On": "",
    },
    {
      Name: "Pilotage de la performance",
      Authority: "Organisme A",
      Url: "https://exemple-test.fr/verification",
      "License Number": "",
      "Started On": "2025",
      "Finished On": "",
    },
    {
      Name: "Conduite du changement",
      Authority: "Organisme B",
      Url: "https://exemple-test.fr/verification",
      "License Number": "",
      "Started On": "2025",
      "Finished On": "",
    },
    {
      Name: "Bureautique avancée",
      Authority: "Organisme D",
      Url: "https://exemple-test.fr/verification",
      "License Number": "TST-000123",
      "Started On": "2025",
      "Finished On": "",
    },
    {
      Name: "Certificat de rédaction 842/1000",
      Authority: "Organisme C",
      Url: "https://exemple-test.fr/verification",
      "License Number": "",
      "Started On": "2024",
      "Finished On": "",
    },
  ],

  VOLUNTEERING_EXPERIENCES: [
    {
      "Company Name": "Association Test",
      Role: "Analyse de dossiers",
      Cause: "Bénévolat",
      "Start Date": "2023",
      "End Date": "",
      Description: "",
    },
    {
      "Company Name": "Association Témoin",
      Role: "Dons de plasma réguliers",
      Cause: "Santé",
      "Start Date": "2022",
      "End Date": "",
      Description: "",
    },
  ],

  PROJECTS: [],
  COURSES: [],
  HONORS: [],
  PUBLICATIONS: [],
};

/**
 * Nombre de sollicitations avant qu'un domaine réponde.
 * L'identité et les postes arrivent d'abord — c'est ce qui permet d'ouvrir le
 * studio pendant que le reste se complète.
 */
export const DEMO_READY_AFTER: Partial<Record<DomainKey, number>> = {
  PROFILE: 1,
  EMAIL_ADDRESSES: 1,
  POSITIONS: 1,
  PHONE_NUMBERS: 2,
  EDUCATION: 2,
  SKILLS: 3,
  LANGUAGES: 3,
  CERTIFICATIONS: 4,
  VOLUNTEERING_EXPERIENCES: 4,
  PROJECTS: 2,
  COURSES: 2,
  HONORS: 2,
  PUBLICATIONS: 2,
};

/**
 * En production, ces valeurs viennent du jeton OpenID Connect.
 *
 * `pictureUrl` pointe vers l'asset de test généré par `scripts/reset-demo.ts` :
 * un visuel neutre marqué « profil fictif ». Aucune photographie de personne
 * réelle n'est stockée dans le dépôt.
 */
export const DEMO_EXTRAS: Record<string, string> = {
  givenName: "Camille",
  familyName: "Dupont",
  email: "camille.dupont@exemple.fr",
  pictureUrl: "/assets/d27caf70eab284f7/w512.webp",
};
