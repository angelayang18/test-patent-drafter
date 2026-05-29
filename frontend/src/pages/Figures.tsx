import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MermaidPreview from "../components/MermaidPreview";
import { AppShell } from "../components/AppShell";
import { DocumentPreviewModal } from "../components/DocumentPreviewModal";
import { WorkflowFooter } from "../components/WorkflowFooter";
import { defaultInvention, usePatentWorkflow } from "../context/PatentWorkflowContext";
import {
  ApiError,
  downloadBlob,
  downloadText,
  generateFigures,
  renderFigurePng,
} from "../services/api";
import { prerenderFigurePngs, figuresSignature } from "../utils/figurePngPrerender";
import type { PatentFigure } from "../types/patent";
import "../styles/patent-drafter.css";

export default function Figures() {
  const {
    invention,
    sections,
    figures,
    briefDescriptionOfDrawings,
    filingInfo,
    setFiguresResult,
    updateFigure,
    setBriefDescriptionOfDrawings,
    saveToStorage,
  } = usePatentWorkflow();

  const [activeFigure, setActiveFigure] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pngLoading, setPngLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const previewSections = useMemo(
    () => ({
      ...sections,
      ...(briefDescriptionOfDrawings
        ? { brief_description_of_drawings: briefDescriptionOfDrawings }
        : {}),
    }),
    [sections, briefDescriptionOfDrawings],
  );

  const current =
    figures.find((f) => f.number === activeFigure) ?? figures[0] ?? null;

  const figureRenderSignature = useMemo(() => figuresSignature(figures), [figures]);

  useEffect(() => {
    saveToStorage();
  }, [figures, briefDescriptionOfDrawings, saveToStorage]);

  useEffect(() => {
    if (figures.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      void prerenderFigurePngs(figures);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [figureRenderSignature, figures]);

  const handleGenerate = async () => {
    setError(null);
    setLoading(true);
    try {
      const details = invention ?? defaultInvention;
      const result = await generateFigures(
        details,
        sections.description ?? "",
      );
      setFiguresResult(result);
      if (result.figures.length > 0) {
        setActiveFigure(result.figures[0].number);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate figures.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadMermaid = () => {
    if (!current) return;
    downloadText(current.mermaid, `fig-${current.number}.mmd`);
  };

  const handleDownloadPng = async () => {
    if (!current) return;
    setPngLoading(true);
    setError(null);
    try {
      const blob = await renderFigurePng(current.mermaid);
      downloadBlob(blob, `fig-${current.number}.png`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to render PNG.";
      setError(message);
    } finally {
      setPngLoading(false);
    }
  };

  const handleMermaidChange = (value: string) => {
    if (!current) return;
    updateFigure(current.number, { mermaid: value });
  };

  return (
    <AppShell
      step="figures"
      mainClassName="overflow-y-auto max-w-[1200px] w-full mx-auto px-margin-desktop py-10"
      footer={
        <WorkflowFooter
          left={
            <Link
              to="/draft"
              className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface font-label-md text-label-md"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              Back to Draft
            </Link>
          }
          right={
            <Link
              to="/export"
              onClick={() => saveToStorage()}
              className="px-8 py-2.5 bg-primary text-on-primary font-label-md text-label-md rounded-lg shadow-md hover:bg-primary-container transition-all flex items-center gap-2"
            >
              Next: Export
              <span className="material-symbols-outlined">arrow_forward</span>
            </Link>
          }
        />
      }
    >
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-primary mb-2">Patent Figures</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Generate system architecture, method flowchart, and data-flow diagrams as Mermaid
            source. Preview here—figures are embedded as PNG images when you export Word (.docx), not
            in the PDF export.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:text-primary hover:border-secondary font-label-md text-label-md transition-all active:scale-95"
        >
          <span className="material-symbols-outlined text-[20px]">visibility</span>
          Preview document
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-error-container/20 text-error border border-error/30">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={loading}
          className="px-6 py-2.5 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2"
        >
          <span className={`material-symbols-outlined text-sm ${loading ? "loading-spin" : ""}`}>
            {loading ? "progress_activity" : "auto_awesome"}
          </span>
          {loading ? "Generating..." : "Generate Figures with AI"}
        </button>
        {figures.length > 0 && current && (
          <>
            <button
              type="button"
              onClick={handleDownloadMermaid}
              className="px-4 py-2.5 border border-outline-variant rounded-lg font-label-md text-label-md hover:bg-surface-container transition-all"
            >
              Download .mmd
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadPng()}
              disabled={pngLoading}
              className="px-4 py-2.5 border border-secondary text-secondary rounded-lg font-label-md text-label-md hover:bg-secondary/5 transition-all disabled:opacity-60"
            >
              {pngLoading ? "Rendering..." : "Download PNG"}
            </button>
          </>
        )}
      </div>

      {figures.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-outline mb-4">account_tree</span>
          <p className="font-body-md text-body-md text-on-surface-variant">
            No figures yet. Click &quot;Generate Figures with AI&quot; after drafting your
            Detailed Description (or from invention details alone).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          <aside className="lg:col-span-3 space-y-2">
            {figures.map((fig: PatentFigure) => (
              <button
                key={fig.number}
                type="button"
                onClick={() => setActiveFigure(fig.number)}
                className={`w-full text-left p-4 rounded-lg border transition-all ${
                  activeFigure === fig.number
                    ? "bg-secondary-container/20 border-secondary"
                    : "bg-surface-container-lowest border-outline-variant hover:border-secondary/50"
                }`}
              >
                <span className="font-label-md text-label-md text-primary font-bold">
                  FIG. {fig.number}
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  {fig.title}
                </p>
              </button>
            ))}
          </aside>

          <section className="lg:col-span-9 space-y-6">
            {current && (
              <>
                <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6">
                  <h2 className="font-title-lg text-title-lg text-primary mb-2">
                    FIG. {current.number} — {current.title}
                  </h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                    {current.brief_description}
                  </p>
                  {Object.keys(current.reference_numerals).length > 0 && (
                    <div className="mb-4">
                      <h3 className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-2">
                        Reference numerals
                      </h3>
                      <ul className="font-body-sm text-body-sm space-y-1">
                        {Object.entries(current.reference_numerals).map(([num, label]) => (
                          <li key={num}>
                            <strong>{num}</strong> — {label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <MermaidPreview source={current.mermaid} />
                </div>

                <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6">
                  <label className="font-label-md text-label-md text-primary block mb-2">
                    Mermaid source (editable)
                  </label>
                  <textarea
                    className="w-full font-mono text-sm border border-outline-variant rounded-lg p-4 min-h-[220px] focus:ring-2 focus:ring-secondary focus:border-secondary outline-none resize-y"
                    value={current.mermaid}
                    onChange={(e) => handleMermaidChange(e.target.value)}
                    spellCheck={false}
                  />
                </div>
              </>
            )}

            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6">
              <label className="font-label-md text-label-md text-primary block mb-2">
                Brief Description of the Drawings
              </label>
              <textarea
                className="w-full border border-outline-variant rounded-lg p-4 min-h-[120px] font-body-md text-body-md focus:ring-2 focus:ring-secondary outline-none resize-y"
                value={briefDescriptionOfDrawings}
                onChange={(e) => setBriefDescriptionOfDrawings(e.target.value)}
              />
            </div>
          </section>
        </div>
      )}

      <DocumentPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        inventionTitle={invention?.invention_title}
        filingInfo={filingInfo}
        sections={previewSections}
        figures={figures}
        footerNote="Drawing sheets appear after Brief Description of the Drawings with sheet numbers 1/3–3/3."
      />
    </AppShell>
  );
}
