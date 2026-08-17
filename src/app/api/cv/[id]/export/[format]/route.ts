import { NextResponse } from "next/server";
import JSZip from "jszip";

import { repository, readLocalAsset } from "../../../../../../lib/storage/repo";
import { renderStandaloneHtml } from "../../../../../../lib/renderers/html/standalone";
import { renderLatex } from "../../../../../../lib/renderers/latex/render";
import { renderPdf, lastFitInfo, PdfUnavailableError } from "../../../../../../lib/pdf/render";
import { renderAtsPdf, LatexUnavailableError } from "../../../../../../lib/latex/compile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FORMATS = new Set(["html", "pdf", "ats", "latex"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; format: string }> },
) {
  const { id, format } = await params;
  if (!FORMATS.has(format)) {
    return NextResponse.json({ error: "Format inconnu." }, { status: 400 });
  }

  const doc = await repository.get(id);
  if (!doc) return NextResponse.json({ error: "CV introuvable." }, { status: 404 });

  const slug = `${doc.data.personal.firstName}-${doc.data.personal.lastName}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "cv";

  if (format === "html") {
    const result = await renderStandaloneHtml(doc, { readAsset: readLocalAsset, webfont: true });
    return new NextResponse(result.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="cv-${slug}.html"`,
        "X-Inlined-Assets": String(result.inlinedAssets),
      },
    });
  }

  if (format === "ats") {
    // CVData → LaTeX → PDF. LaTeX est un moteur interne : l'utilisateur ne
    // reçoit qu'un PDF, dont l'extraction est vérifiée avant envoi.
    try {
      const { pdf, engine, validation, fit } = await renderAtsPdf(doc);
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="cv-${slug}-ats.pdf"`,
          "X-Ats-Valid": String(validation.valid),
          "X-Ats-Checks": String(validation.checks.length),
          "X-Ats-Missing": String(validation.missing.length),
          "X-Ats-Engine": engine,
          "X-Ats-Pages": String(fit.pages),
          "X-Ats-Fit-Step": String(fit.step),
        },
      });
    } catch (error) {
      if (error instanceof LatexUnavailableError) {
        return NextResponse.json(
          {
            error: "Compilation LaTeX indisponible sur ce serveur.",
            detail: error.message,
            hint: "Installez texlive-latex-recommended, ou utilisez le PDF humain.",
          },
          { status: 503 },
        );
      }
      throw error;
    }
  }

  if (format === "latex") {
    const bundle = renderLatex(doc);

    // `?inline=1` sert l'aperçu du studio : la source telle quelle, sans archive.
    if (new URL(request.url).searchParams.get("inline") === "1") {
      const tex = bundle.files.find((f) => f.path === "cv.tex")?.content ?? "";
      return new NextResponse(tex, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const zip = new JSZip();
    for (const file of bundle.files) zip.file(file.path, file.content);
    if (bundle.warnings.length > 0) {
      zip.file("AVERTISSEMENTS.txt", `${bundle.warnings.join("\n")}\n`);
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="cv-${slug}-latex.zip"`,
      },
    });
  }

  try {
    const origin = new URL(request.url).origin;
    const pdf = await renderPdf(`${origin}/render/print/${id}`, { fitOnePage: true });
    const fit = lastFitInfo();
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="cv-${slug}.pdf"`,
        "X-Fit-Scale": fit.scale.toFixed(3),
        "X-Fit-Overflow": String(fit.overflow),
      },
    });
  } catch (error) {
    if (error instanceof PdfUnavailableError) {
      // Repli explicite plutôt qu'une erreur 500 opaque : la route
      // d'impression reste consultable et imprimable par le navigateur.
      return NextResponse.json(
        {
          error: "Génération PDF indisponible sur ce serveur.",
          detail: error.message,
          fallback: `/render/print/${id}`,
          hint: "Ouvrez la page de repli puis imprimez-la (Ctrl+P → Enregistrer au format PDF).",
        },
        { status: 503 },
      );
    }
    throw error;
  }
}
