import { describe, expect, it } from "vitest";

import { normalizeLinkedInProfile } from "../src/lib/importers/linkedin/normalizer";
import {
  fetchSnapshot,
  FixtureTransport,
} from "../src/lib/importers/linkedin/portability";
import { DEMO_SNAPSHOT, DEMO_READY_AFTER } from "../src/lib/importers/linkedin/demo-snapshot";
import { mergeRawProfiles, type RawProfile } from "../src/lib/importers/types";
import { toPlain } from "../src/domain/cv/richtext";
import { createState, verifyState } from "../src/lib/auth/linkedin-oauth";

const profile = (sections: RawProfile["sections"]): RawProfile => ({
  source: "linkedin-portability",
  fetchedAt: "2026-01-01T00:00:00.000Z",
  sections,
});

describe("normaliseur LinkedIn", () => {
  it("mappe les colonnes de l'instantané vers CVData", () => {
    const { data } = normalizeLinkedInProfile(
      profile([
        { domain: "PROFILE", rows: DEMO_SNAPSHOT["PROFILE"]! },
        { domain: "POSITIONS", rows: DEMO_SNAPSHOT["POSITIONS"]! },
        { domain: "EMAIL_ADDRESSES", rows: DEMO_SNAPSHOT["EMAIL_ADDRESSES"]! },
      ]),
    );

    expect(data.personal.firstName).toBe("Camille");
    expect(data.personal.email).toBe("camille.dupont@exemple.fr");
    expect(data.personal.location).toEqual({ city: "Lyon", country: "FR" });
    expect(data.experiences).toHaveLength(4);
  });

  it("extrait le type de contrat de l'intitulé LinkedIn", () => {
    const { data } = normalizeLinkedInProfile(
      profile([{ domain: "POSITIONS", rows: DEMO_SNAPSHOT["POSITIONS"]! }]),
    );
    expect(data.experiences.map((entry) => entry.contract)).toContain("stage");
    expect(data.experiences.map((entry) => entry.contract)).toContain("cdd");
  });

  it("découpe les descriptions multilignes en puces typées", () => {
    const { data } = normalizeLinkedInProfile(
      profile([{ domain: "POSITIONS", rows: DEMO_SNAPSHOT["POSITIONS"]! }]),
    );
    const lacoste = data.experiences.find((e) => e.organization === "Société Alpha");
    expect((lacoste?.bullets?.fr ?? []).map(toPlain)).toEqual([
      "Suivi quotidien des indicateurs de performance et reporting.",
      "Enquête : 72 % d'avis favorables.",
      "Co-organisation d'une soirée : +145 % de CA.",
    ]);
  });

  it("traduit le barème LinkedIn en niveaux CECRL", () => {
    const { data } = normalizeLinkedInProfile(
      profile([{ domain: "LANGUAGES", rows: DEMO_SNAPSHOT["LANGUAGES"]! }]),
    );
    expect(data.languages.map((l) => [l.name.fr, l.level])).toEqual([
      ["Français", "native"],
      ["Anglais", "C1"],
      ["Espagnol", "B1"],
      ["Allemand", "A2"],
    ]);
  });

  it("signale un barème inconnu au lieu de le deviner", () => {
    const { data, warnings } = normalizeLinkedInProfile(
      profile([{ domain: "LANGUAGES", rows: [{ Name: "Wolof", Proficiency: "Assez bien" }] }]),
    );
    expect(data.languages[0]?.level).toBe("B1");
    expect(warnings.some((w) => w.code === "niveau_langue_inconnu")).toBe(true);
  });

  it("interprète une case « Finished On » vide comme un poste en cours", () => {
    const { data } = normalizeLinkedInProfile(
      profile([
        {
          domain: "POSITIONS",
          rows: [
            { "Company Name": "ACME", Title: "Analyste", "Started On": "Jan 2024", "Finished On": "" },
          ],
        },
      ]),
    );
    expect(data.experiences[0]?.period).toEqual({ start: "2024-01", end: null, current: true });
  });

  it("tolère des noms de colonnes alternatifs", () => {
    // La documentation officielle ne publie pas les en-têtes exacts : le
    // normaliseur doit encaisser une variation sans perdre la donnée.
    const { data } = normalizeLinkedInProfile(
      profile([
        {
          domain: "POSITIONS",
          rows: [{ Organization: "ACME", Role: "Analyste", startedOn: "2024" }],
        },
      ]),
    );
    expect(data.experiences[0]?.organization).toBe("ACME");
    expect(data.experiences[0]?.role.fr).toBe("Analyste");
  });

  it("ne jette jamais une colonne inconnue en silence", () => {
    const { warnings } = normalizeLinkedInProfile(
      profile([
        {
          domain: "POSITIONS",
          rows: [
            {
              "Company Name": "ACME",
              Title: "Analyste",
              "Started On": "2024",
              "Employment Type": "Full-time",
            },
          ],
        },
      ]),
    );
    expect(warnings.some((w) => w.path.includes("Employment Type"))).toBe(true);
  });

  it("recense ce que LinkedIn ne fournit pas", () => {
    const { gaps } = normalizeLinkedInProfile(
      profile([
        { domain: "POSITIONS", rows: DEMO_SNAPSHOT["POSITIONS"]! },
        { domain: "SKILLS", rows: DEMO_SNAPSHOT["SKILLS"]! },
      ]),
    );
    expect(gaps.join(" ")).toContain("Photo");
    expect(gaps.join(" ")).toContain("Logos");
    expect(gaps.join(" ")).toContain("Niveaux de compétences");
  });

  it("conserve les liens de certification exploitables", () => {
    const { data } = normalizeLinkedInProfile(
      profile([{ domain: "CERTIFICATIONS", rows: DEMO_SNAPSHOT["CERTIFICATIONS"]! }]),
    );
    expect(data.certifications).toHaveLength(6);
    expect(data.certifications.every((cert) => cert.url?.startsWith("https://"))).toBe(true);
    expect(data.certifications.map((cert) => cert.credentialId)).toContain("TST-000123");
  });
});

describe("transport et progression", () => {
  it("livre les domaines par paliers, comme l'API réelle", async () => {
    const transport = new FixtureTransport(DEMO_SNAPSHOT, DEMO_READY_AFTER);

    const first = await fetchSnapshot(transport, "jeton", ["PROFILE", "CERTIFICATIONS"]);
    expect(first.statuses["PROFILE"]).toBe("ok");
    expect(first.statuses["CERTIFICATIONS"]).toBe("pending");

    await fetchSnapshot(transport, "jeton", ["CERTIFICATIONS"]);
    await fetchSnapshot(transport, "jeton", ["CERTIFICATIONS"]);
    const fourth = await fetchSnapshot(transport, "jeton", ["CERTIFICATIONS"]);
    expect(fourth.statuses["CERTIFICATIONS"]).toBe("ok");
  });

  it("fusionne deux sources sans écraser les sections déjà remplies", () => {
    const api = profile([{ domain: "POSITIONS", rows: [{ "Company Name": "ACME" }] }]);
    const archive: RawProfile = {
      source: "linkedin-archive",
      fetchedAt: "2026-01-02T00:00:00.000Z",
      sections: [
        { domain: "POSITIONS", rows: [{ "Company Name": "AUTRE" }] },
        { domain: "SKILLS", rows: [{ Name: "SQL" }] },
      ],
    };

    const merged = mergeRawProfiles([api, archive]);
    const positions = merged.sections.find((s) => s.domain === "POSITIONS");
    expect(positions?.rows[0]?.["Company Name"]).toBe("ACME");
    expect(merged.sections.some((s) => s.domain === "SKILLS")).toBe(true);
  });
});

describe("état OAuth", () => {
  it("accepte un état intact et rejette un état falsifié", () => {
    const state = createState("job_abc");
    expect(verifyState(state, state)).toBe("job_abc");
    expect(verifyState(state, undefined)).toBeNull();
    expect(verifyState(state.replace(/.$/, "x"), state)).toBeNull();
  });
});
