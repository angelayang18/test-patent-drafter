import { useEffect, useState } from "react";
import MermaidPreview from "./MermaidPreview";
import { downloadBlob, downloadText, renderFigurePng } from "../services/api";
import type { GenericFigure } from "../types/genericFigures";

export interface FigurePanelProps {
  figures: GenericFigure[];
  activeFigureNumber: number;
  onSelectFigure: (n: number) => void;
  numFigures: number;
  onNumFiguresChange: (n: number) => void;
  loading: boolean;
  regeneratingFigures: Set<number>;
  error: string | null;
  warnings: string[];
  onGenerate: () => void;
  onRegenerateOne: (figureNumber: number) => void;
  onMermaidChange: (figureNumber: number, mermaid: string) => void;
  /** Optional helper under the generate controls. */
  helperText?: string;
  emptyStateText?: string;
  /** When false, hide the num-figures slider and bulk Generate button. */
  showBulkControls?: boolean;
}

export function FigurePanel({
  figures,
  activeFigureNumber,
  onSelectFigure,
  numFigures,
  onNumFiguresChange,
  loading,
  regeneratingFigures,
  error,
  warnings,
  onGenerate,
  onRegenerateOne,
  onMermaidChange,
  helperText = "Choose how many diagrams best illustrate your document.",
  emptyStateText = 'No figures yet. Click "Generate with AI" after drafting your document.',
  showBulkControls = true,
}: FigurePanelProps) {
  const [pngLoading, setPngLoading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const current =
    figures.find((f) => f.number === activeFigureNumber) ?? figures[0] ?? null;

  useEffect(() => {
    setLightboxOpen(false);
  }, [activeFigureNumber]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    if (lightboxOpen) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxOpen]);

  const handleDownloadMermaid = () => {
    if (!current) return;
    downloadText(current.mermaid, `fig-${current.number}.mmd`);
  };

  const handleDownloadPng = async () => {
    if (!current) return;
    setPngLoading(true);
    setLocalError(null);
    try {
      const blob = await renderFigurePng(current.mermaid);
      downloadBlob(blob, `fig-${current.number}.png`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to render PNG.";
      setLocalError(message);
    } finally {
      setPngLoading(false);
    }
  };

  const displayError = error ?? localError;

  return (
    <>
      {displayError && (
        <div className="mb-6 p-4 rounded-lg bg-error-container/20 text-error border border-error/30">
          {displayError}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-6 p-4 rounded-lg bg-amber-500/10 text-amber-900 border border-amber-500/30">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">warning</span>
            <div>
              <p className="font-label-md text-label-md mb-2">
                Diagram inconsistencies detected — figures were generated but may need manual edits:
              </p>
              <ul className="font-body-sm text-body-sm space-y-1 list-disc list-inside">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {showBulkControls && (
        <div className="mb-6">
          <div className="flex flex-wrap items-stretch gap-4">
            <div className="bg-white border border-outline-variant rounded-2xl px-6 py-4 shadow-sm flex flex-wrap items-center">
              <label
                htmlFor="num-figures-slider"
                className="font-label-md text-label-md font-medium text-on-surface shrink-0"
              >
                Number of figures
              </label>
              <span
                className="ml-2 bg-primary-fixed text-on-primary-fixed-variant font-bold rounded-md px-2 py-0.5 text-sm min-w-[1.75rem] text-center tabular-nums"
                aria-hidden="true"
              >
                {numFigures}
              </span>
              <div
                className="border-l border-outline-variant h-5 mx-3 shrink-0"
                aria-hidden="true"
              />
              <div className="flex items-center gap-2">
                <span className="font-label-sm text-label-sm text-on-surface-variant tabular-nums">
                  1
                </span>
                <input
                  id="num-figures-slider"
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={numFigures}
                  onChange={(e) => onNumFiguresChange(Number(e.target.value))}
                  disabled={loading}
                  className="w-56 accent-primary"
                />
                <span className="font-label-sm text-label-sm text-on-surface-variant tabular-nums">
                  8
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onGenerate()}
              disabled={loading}
              className="self-stretch flex items-center gap-2 px-6 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95 disabled:opacity-60"
            >
              <span className={`material-symbols-outlined text-sm ${loading ? "loading-spin" : ""}`}>
                {loading ? "progress_activity" : "auto_awesome"}
              </span>
              {loading ? "Generating..." : "Generate with AI"}
            </button>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 max-w-xl">
            {helperText}
          </p>
          {figures.length > 0 && current && (
            <div className="flex flex-wrap gap-3 mt-4">
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
            </div>
          )}
        </div>
      )}

      {!showBulkControls && figures.length > 0 && current && (
        <div className="flex flex-wrap gap-3 mb-4">
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
        </div>
      )}

      {figures.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-outline mb-4">account_tree</span>
          <p className="font-body-md text-body-md text-on-surface-variant">{emptyStateText}</p>
        </div>
      ) : showBulkControls ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          <aside className="lg:col-span-3 space-y-2">
            {figures.map((fig) => {
              const isRegenerating = regeneratingFigures.has(fig.number);
              return (
                <div key={fig.number} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectFigure(fig.number)}
                    className={`flex-1 min-w-0 text-left p-4 rounded-lg border transition-all ${
                      activeFigureNumber === fig.number
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
                  <button
                    type="button"
                    title={`Regenerate FIG. ${fig.number}`}
                    aria-label={`Regenerate FIG. ${fig.number}`}
                    onClick={() => void onRegenerateOne(fig.number)}
                    disabled={isRegenerating}
                    className="shrink-0 self-stretch px-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:text-primary hover:border-secondary transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <span
                      className={`material-symbols-outlined text-[18px] ${isRegenerating ? "loading-spin" : ""}`}
                    >
                      autorenew
                    </span>
                  </button>
                </div>
              );
            })}
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
                  <div
                    className="relative cursor-zoom-in group"
                    onClick={() => setLightboxOpen(true)}
                  >
                    <MermaidPreview source={current.mermaid} />
                    <button
                      type="button"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-container rounded p-1 shadow"
                    >
                      <span className="material-symbols-outlined text-[18px]">fullscreen</span>
                    </button>
                  </div>
                </div>

                <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6">
                  <label className="font-label-md text-label-md text-primary block mb-2">
                    Mermaid source (editable)
                  </label>
                  <textarea
                    className="w-full font-mono text-sm border border-outline-variant rounded-lg p-4 min-h-[220px] focus:ring-2 focus:ring-secondary focus:border-secondary outline-none resize-y"
                    value={current.mermaid}
                    onChange={(e) => onMermaidChange(current.number, e.target.value)}
                    spellCheck={false}
                  />
                </div>
              </>
            )}
          </section>
        </div>
      ) : (
        current && (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-title-lg text-title-lg text-primary mb-2">
                  FIG. {current.number} — {current.title}
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                  {current.brief_description}
                </p>
              </div>
              <button
                type="button"
                title={`Regenerate FIG. ${current.number}`}
                aria-label={`Regenerate FIG. ${current.number}`}
                onClick={() => void onRegenerateOne(current.number)}
                disabled={regeneratingFigures.has(current.number)}
                className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface-variant hover:text-primary hover:border-secondary transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span
                  className={`material-symbols-outlined text-[18px] ${regeneratingFigures.has(current.number) ? "loading-spin" : ""}`}
                >
                  autorenew
                </span>
                Regenerate
              </button>
            </div>
            {Object.keys(current.reference_numerals).length > 0 && (
              <div>
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
            <div
              className="relative cursor-zoom-in group"
              onClick={() => setLightboxOpen(true)}
            >
              <MermaidPreview source={current.mermaid} />
              <button
                type="button"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-container rounded p-1 shadow"
              >
                <span className="material-symbols-outlined text-[18px]">fullscreen</span>
              </button>
            </div>
            <div>
              <label className="font-label-md text-label-md text-primary block mb-2">
                Mermaid source (editable)
              </label>
              <textarea
                className="w-full font-mono text-sm border border-outline-variant rounded-lg p-4 min-h-[220px] focus:ring-2 focus:ring-secondary focus:border-secondary outline-none resize-y"
                value={current.mermaid}
                onChange={(e) => onMermaidChange(current.number, e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>
        )
      )}

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative bg-surface rounded-xl p-6"
            style={{ width: "90vw", height: "90vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute top-2 right-2 bg-surface-container rounded p-1 shadow z-10"
              onClick={() => setLightboxOpen(false)}
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
            <p className="text-label-sm text-secondary uppercase tracking-widest mb-3 shrink-0">
              FIG. {current?.number} — {current?.title}
            </p>
            <div
              style={{
                flex: 1,
                overflow: "auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MermaidPreview source={current?.mermaid ?? ""} className="w-full h-full" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
