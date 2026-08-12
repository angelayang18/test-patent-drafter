import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { FigurePanel } from "./FigurePanel";
import { WorkflowFooter } from "./WorkflowFooter";
import { WorkflowBackLink, WorkflowNextLink } from "./WorkflowNavButtons";
import {
  ApiError,
  generateGenericFigures,
  regenerateGenericFigure,
} from "../services/api";
import type { GenericFigure } from "../types/genericFigures";
import { figuresSignature, prerenderFigurePngs } from "../utils/figurePngPrerender";
import {
  resolveSectionLabel,
  type SectionSettingsMap,
} from "../utils/sectionSettings";

export interface DocumentFiguresWorkflowProps {
  title: string;
  subtitle: string;
  documentTypeLabel: string;
  documentTitle: string;
  documentLabel: string;
  sectionSettings: SectionSettingsMap;
  sectionIds: string[];
  sections: Record<string, string>;
  defaultLabels: Record<string, string>;
  sectionOrder?: readonly string[];
  figures: GenericFigure[];
  setFigures: (figures: GenericFigure[]) => void;
  updateFigure: (number: number, patch: Partial<GenericFigure>) => void;
  saveToStorage: () => void;
  markStepComplete: () => void;
  workflowResetting: boolean;
  isFiguresAccessible: () => boolean;
  draftPath: string;
  exportPath: string;
  renderShell: (props: {
    footer: ReactNode;
    children: ReactNode;
  }) => ReactNode;
}

function mergeFiguresBySection(
  existing: GenericFigure[],
  incoming: GenericFigure[],
  preferredOrder: string[],
): GenericFigure[] {
  const bySection = new Map<string, GenericFigure>();
  for (const figure of existing) {
    bySection.set(figure.sectionId, figure);
  }
  for (const figure of incoming) {
    bySection.set(figure.sectionId, figure);
  }

  const ordered: GenericFigure[] = [];
  const seen = new Set<string>();
  for (const sectionId of preferredOrder) {
    const figure = bySection.get(sectionId);
    if (figure) {
      ordered.push(figure);
      seen.add(sectionId);
    }
  }
  for (const [sectionId, figure] of bySection) {
    if (!seen.has(sectionId)) {
      ordered.push(figure);
    }
  }
  return ordered.map((figure, index) => ({ ...figure, number: index + 1 }));
}

export function DocumentFiguresWorkflow({
  title,
  subtitle,
  documentTypeLabel,
  documentTitle,
  documentLabel,
  sectionSettings,
  sectionIds,
  sections,
  defaultLabels,
  sectionOrder,
  figures,
  setFigures,
  updateFigure,
  saveToStorage,
  markStepComplete,
  workflowResetting,
  isFiguresAccessible,
  draftPath,
  exportPath,
  renderShell,
}: DocumentFiguresWorkflowProps) {
  const navigate = useNavigate();
  const [loadingSectionIds, setLoadingSectionIds] = useState<Set<string>>(new Set());
  const [generatingAllMissing, setGeneratingAllMissing] = useState(false);
  const [regeneratingFigures, setRegeneratingFigures] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  const figuresRef = useRef(figures);
  figuresRef.current = figures;

  const flaggedSections = useMemo(
    () =>
      sectionIds.filter(
        (id) =>
          sectionSettings[id]?.needsFigure === true &&
          sectionSettings[id]?.included !== false,
      ),
    [sectionIds, sectionSettings],
  );

  const missingFlaggedSections = useMemo(
    () =>
      flaggedSections.filter(
        (id) => !figures.some((figure) => figure.sectionId === id),
      ),
    [flaggedSections, figures],
  );

  const figureRenderSignature = useMemo(() => figuresSignature(figures), [figures]);

  useEffect(() => {
    if (workflowResetting) {
      return;
    }
    if (!isFiguresAccessible()) {
      navigate(draftPath, { replace: true });
    }
  }, [draftPath, isFiguresAccessible, navigate, workflowResetting]);

  useEffect(() => {
    if (workflowResetting) {
      return;
    }
    saveToStorage();
  }, [figures, saveToStorage, workflowResetting]);

  useEffect(() => {
    if (figures.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      void prerenderFigurePngs(figures);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [figureRenderSignature, figures]);

  const buildSectionPayload = (sectionId: string) => ({
    sectionId,
    sectionName: resolveSectionLabel(
      sectionId,
      sectionSettings,
      defaultLabels[sectionId] ?? sectionId,
    ),
    sectionContent: sections[sectionId] ?? "",
  });

  const handleGenerateSections = async (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }
    setError(null);
    setWarnings([]);
    setLoadingSectionIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    try {
      const result = await generateGenericFigures(undefined, {
        documentTypeLabel,
        documentTitle,
        sections: ids.map(buildSectionPayload),
      });
      setFigures(mergeFiguresBySection(figuresRef.current, result.figures, flaggedSections));
      if (result.warnings?.length) {
        setWarnings(result.warnings);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate figures.");
    } finally {
      setLoadingSectionIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  };

  const handleGenerateAllMissing = async () => {
    setGeneratingAllMissing(true);
    try {
      await handleGenerateSections(missingFlaggedSections);
    } finally {
      setGeneratingAllMissing(false);
    }
  };

  const handleRegenerateOne = async (figure: GenericFigure) => {
    setError(null);
    setWarnings([]);
    setRegeneratingFigures((prev) => new Set(prev).add(figure.number));
    try {
      const payload = buildSectionPayload(figure.sectionId);
      const result = await regenerateGenericFigure(undefined, {
        documentTypeLabel,
        documentTitle,
        sectionId: payload.sectionId,
        sectionName: payload.sectionName,
        sectionContent: payload.sectionContent,
        figureNumber: figure.number,
        existingFigures: figuresRef.current,
      });
      updateFigure(figure.number, result.figure);
      if (result.warnings?.length) {
        setWarnings(result.warnings);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Failed to regenerate FIG. ${figure.number}.`,
      );
    } finally {
      setRegeneratingFigures((prev) => {
        const next = new Set(prev);
        next.delete(figure.number);
        return next;
      });
    }
  };

  const anyLoading = generatingAllMissing || loadingSectionIds.size > 0;

  return (
    <>
      {renderShell({
        footer: (
          <WorkflowFooter
            left={<WorkflowBackLink to={draftPath} />}
            right={
              <WorkflowNextLink
                to={exportPath}
                onClick={() => {
                  markStepComplete();
                  saveToStorage();
                }}
              >
                Next: Export
              </WorkflowNextLink>
            }
          />
        ),
        children: (
          <>
            <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h1 className="font-headline-lg text-headline-lg text-primary mb-2">{title}</h1>
                <p className="font-body-md text-body-md text-on-surface-variant">{subtitle}</p>
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

            {warnings.length > 0 && (
              <div className="mb-6 p-4 rounded-lg bg-amber-500/10 text-amber-900 border border-amber-500/30">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">
                    warning
                  </span>
                  <div>
                    <p className="font-label-md text-label-md mb-2">
                      Diagram inconsistencies detected — figures were generated but may need
                      manual edits:
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

            {flaggedSections.length === 0 ? (
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-12 text-center space-y-4">
                <span className="material-symbols-outlined text-5xl text-outline">
                  account_tree
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-xl mx-auto">
                  No sections are flagged for a diagram. Go back to Manage sections and check
                  &quot;Needs figure&quot; on any section that should include one.
                </p>
                <Link
                  to={draftPath}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-all"
                >
                  <span className="material-symbols-outlined text-[20px]">tune</span>
                  Manage sections
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                {missingFlaggedSections.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleGenerateAllMissing()}
                      disabled={anyLoading}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95 disabled:opacity-60"
                    >
                      <span
                        className={`material-symbols-outlined text-sm ${generatingAllMissing ? "loading-spin" : ""}`}
                      >
                        {generatingAllMissing ? "progress_activity" : "auto_awesome"}
                      </span>
                      {generatingAllMissing ? "Generating..." : "Generate all missing"}
                    </button>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {missingFlaggedSections.length} section
                      {missingFlaggedSections.length === 1 ? "" : "s"} still need a diagram.
                    </p>
                  </div>
                )}

                {flaggedSections.map((sectionId) => {
                  const sectionName = resolveSectionLabel(
                    sectionId,
                    sectionSettings,
                    defaultLabels[sectionId] ?? sectionId,
                  );
                  const figure = figures.find((entry) => entry.sectionId === sectionId);
                  const sectionLoading = loadingSectionIds.has(sectionId);

                  return (
                    <section
                      key={sectionId}
                      className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 space-y-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h2 className="font-title-lg text-title-lg text-primary">
                          {sectionName}
                        </h2>
                        {!figure && (
                          <button
                            type="button"
                            onClick={() => void handleGenerateSections([sectionId])}
                            disabled={anyLoading}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95 disabled:opacity-60"
                          >
                            <span
                              className={`material-symbols-outlined text-sm ${sectionLoading ? "loading-spin" : ""}`}
                            >
                              {sectionLoading ? "progress_activity" : "auto_awesome"}
                            </span>
                            {sectionLoading ? "Generating..." : "Generate diagram"}
                          </button>
                        )}
                      </div>

                      {figure ? (
                        <FigurePanel
                          figures={[figure]}
                          activeFigureNumber={figure.number}
                          onSelectFigure={() => undefined}
                          numFigures={1}
                          onNumFiguresChange={() => undefined}
                          loading={false}
                          regeneratingFigures={regeneratingFigures}
                          error={null}
                          warnings={[]}
                          onGenerate={() => undefined}
                          onRegenerateOne={() => void handleRegenerateOne(figure)}
                          onMermaidChange={(figureNumber, mermaid) =>
                            updateFigure(figureNumber, { mermaid })
                          }
                          showBulkControls={false}
                        />
                      ) : (
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          No diagram yet for this section.
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </>
        ),
      })}

      <DocumentPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        inventionTitle={documentTitle}
        sections={sections}
        sectionOrder={sectionOrder ?? sectionIds}
        figures={figures}
        documentLabel={documentLabel}
        footerNote="Figures are embedded as PNG images when you export Word (.docx)."
      />
    </>
  );
}
