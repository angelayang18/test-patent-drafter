import { useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { GenerationProgress } from "../components/GenerationProgress";
import { usePatentWorkflow } from "../context/PatentWorkflowContext";
import { ApiError, downloadBlob, exportDocx, exportPdf } from "../services/api";
import "../styles/patent-drafter.css";

type DownloadState = "idle" | "preparing" | "done" | "error";

export default function Export() {
  const { sections, figures, briefDescriptionOfDrawings, clearWorkflow } =
    usePatentWorkflow();
  const [docxState, setDocxState] = useState<DownloadState>("idle");
  const [pdfState, setPdfState] = useState<DownloadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const exportSections: Record<string, string> = {
    ...sections,
    ...(briefDescriptionOfDrawings
      ? { brief_description_of_drawings: briefDescriptionOfDrawings }
      : {}),
  };

  const hasContent = Object.values(exportSections).some((body) => body.trim().length > 0);
  const exporting = docxState === "preparing" || pdfState === "preparing";

  const handleDownloadDocx = async () => {
    if (!hasContent) {
      setError("No draft sections to export. Complete drafting and figures first.");
      return;
    }
    setError(null);
    setDocxState("preparing");
    try {
      const blob = await exportDocx({
        sections: exportSections,
        figures,
        brief_description_of_drawings: briefDescriptionOfDrawings,
      });
      downloadBlob(blob, "patent-draft.docx");
      setDocxState("done");
      window.setTimeout(() => setDocxState("idle"), 2000);
    } catch (err) {
      setDocxState("error");
      setError(err instanceof ApiError ? err.message : "DOCX export failed.");
      window.setTimeout(() => setDocxState("idle"), 3000);
    }
  };

  const handleDownloadPdf = async () => {
    if (!hasContent) {
      setError("No draft sections to export. Complete drafting first.");
      return;
    }
    setError(null);
    setPdfState("preparing");
    try {
      const blob = await exportPdf({
        sections: exportSections,
        figures,
        brief_description_of_drawings: briefDescriptionOfDrawings,
      });
      downloadBlob(blob, "patent-draft.pdf");
      setPdfState("done");
      window.setTimeout(() => setPdfState("idle"), 2000);
    } catch (err) {
      setPdfState("error");
      setError(err instanceof ApiError ? err.message : "PDF export failed.");
      window.setTimeout(() => setPdfState("idle"), 3000);
    }
  };

  return (
    <AppShell
      step="export"
      layout="document"
      mainClassName="px-margin-mobile md:px-margin-desktop py-10 pb-16"
    >
      <div className="max-w-[800px] mx-auto w-full space-y-8">
        {exporting && (
          <GenerationProgress active label="Preparing your download" />
        )}

        <div className="bg-surface-container-lowest border border-outline-variant canvas-shadow rounded-xl overflow-hidden">
          <section className="p-10 text-center border-b border-outline-variant bg-surface-bright">
            <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-full bg-secondary-container/20 text-secondary">
              <span
                className="material-symbols-outlined text-5xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                check_circle
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-primary mb-2">
              Your Patent Draft Is Ready
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl mx-auto">
              Download your provisional patent application. DOCX includes text sections
              {figures.length > 0
                ? ` and ${figures.length} embedded figure(s).`
                : " (generate figures on the Figures step to embed diagrams)."}
            </p>
          </section>

          {error && (
            <div className="mx-10 mt-6 p-4 rounded-lg bg-error-container/20 text-error text-sm">
              {error}
            </div>
          )}

          <section className="p-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
              <div className="flex flex-col p-6 rounded-xl border border-outline-variant hover:border-secondary transition-colors group">
                <div className="flex items-center gap-3 mb-4">
                  <span className="material-symbols-outlined text-secondary text-3xl">
                    description
                  </span>
                  <h3 className="font-title-lg text-title-lg text-primary">Word Document (.docx)</h3>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-8 flex-grow">
                  Editable format with optional embedded figure PNGs. Recommended for attorney
                  review.
                </p>
                <button
                  type="button"
                  onClick={() => void handleDownloadDocx()}
                  disabled={docxState === "preparing"}
                  className={`w-full px-6 py-3 rounded-lg font-label-md text-label-md transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm ${
                    docxState === "done"
                      ? "bg-secondary text-on-primary"
                      : "bg-primary-container text-on-primary hover:bg-primary"
                  } ${docxState === "preparing" ? "opacity-80" : ""}`}
                >
                  {docxState === "preparing" && (
                    <>
                      <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                      Preparing...
                    </>
                  )}
                  {docxState === "done" && (
                    <>
                      <span className="material-symbols-outlined text-sm">check</span>
                      Downloaded
                    </>
                  )}
                  {(docxState === "idle" || docxState === "error") && (
                    <>
                      <span className="material-symbols-outlined text-sm">download</span>
                      Download DOCX
                    </>
                  )}
                </button>
              </div>
              <div className="flex flex-col p-6 rounded-xl border border-outline-variant hover:border-secondary transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <span className="material-symbols-outlined text-error text-3xl">
                    picture_as_pdf
                  </span>
                  <h3 className="font-title-lg text-title-lg text-primary">PDF Document (.pdf)</h3>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-8 flex-grow">
                  Read-only PDF of all drafted sections, suitable for quick review or filing prep.
                </p>
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={pdfState === "preparing"}
                  className={`w-full px-6 py-3 rounded-lg font-label-md text-label-md transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm ${
                    pdfState === "done"
                      ? "bg-secondary text-on-primary"
                      : "bg-primary text-on-primary hover:bg-primary-container"
                  } ${pdfState === "preparing" ? "opacity-80" : ""}`}
                >
                  {pdfState === "preparing" && (
                    <>
                      <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                      Preparing...
                    </>
                  )}
                  {pdfState === "done" && (
                    <>
                      <span className="material-symbols-outlined text-sm">check</span>
                      Downloaded
                    </>
                  )}
                  {(pdfState === "idle" || pdfState === "error") && (
                    <>
                      <span className="material-symbols-outlined text-sm">download</span>
                      Download PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          <section className="p-10 bg-surface-container-low/50 border-t border-outline-variant">
            <h2 className="font-title-lg text-title-lg text-primary mb-6">What to do next</h2>
            <div className="space-y-6">
              {[
                {
                  title: "Review figures and reference numerals",
                  body: "Ensure FIG. 1–3 match the Detailed Description and use consistent numerals (10, 12, 14…).",
                },
                {
                  title: "Review the draft with a patent attorney",
                  body: "Ensure all technical nuances are captured to maximize protection.",
                },
                {
                  title: "File on patentcenter.uspto.gov",
                  body: "Upload the DOCX or PDF and pay the provisional filing fee.",
                },
              ].map((step, i) => (
                <div key={step.title} className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
                    {i + 1}
                  </div>
                  <div>
                    <h4 className="font-label-md text-label-md text-on-surface">{step.title}</h4>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="pb-8">
          <Link
            to="/"
            onClick={() => clearWorkflow()}
            className="font-label-md text-label-md text-secondary hover:text-primary transition-colors flex items-center gap-2 underline underline-offset-4"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Start a New Patent
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
