import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
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

export interface DocumentFiguresWorkflowProps {
  title: string;
  subtitle: string;
  documentTypeLabel: string;
  documentTitle: string;
  documentLabel: string;
  sections: Record<string, string>;
  sectionOrder?: readonly string[];
  figures: GenericFigure[];
  setFigures: (figures: GenericFigure[]) => void;
  updateFigure: (number: number, patch: Partial<GenericFigure>) => void;
  gatherCombinedText: () => Promise<string>;
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

export function DocumentFiguresWorkflow({
  title,
  subtitle,
  documentTypeLabel,
  documentTitle,
  documentLabel,
  sections,
  sectionOrder,
  figures,
  setFigures,
  updateFigure,
  gatherCombinedText,
  saveToStorage,
  markStepComplete,
  workflowResetting,
  isFiguresAccessible,
  draftPath,
  exportPath,
  renderShell,
}: DocumentFiguresWorkflowProps) {
  const navigate = useNavigate();
  const [activeFigure, setActiveFigure] = useState(1);
  const [loading, setLoading] = useState(false);
  const [regeneratingFigures, setRegeneratingFigures] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [numFigures, setNumFigures] = useState(3);

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

  const handleGenerate = async () => {
    setError(null);
    setWarnings([]);
    setLoading(true);
    try {
      const combinedText = await gatherCombinedText();
      const result = await generateGenericFigures(undefined, {
        documentTypeLabel,
        documentTitle,
        combinedText,
        numFigures,
      });
      setFigures(result.figures);
      if (result.warnings?.length) {
        setWarnings(result.warnings);
      }
      if (result.figures.length > 0) {
        setActiveFigure(result.figures[0].number);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate figures.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateOne = async (figureNumber: number) => {
    setError(null);
    setWarnings([]);
    setRegeneratingFigures((prev) => new Set(prev).add(figureNumber));
    try {
      const combinedText = await gatherCombinedText();
      const result = await regenerateGenericFigure(undefined, {
        documentTypeLabel,
        documentTitle,
        combinedText,
        figureNumber,
        existingFigures: figures,
      });
      updateFigure(figureNumber, result.figure);
      if (result.warnings?.length) {
        setWarnings(result.warnings);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : `Failed to regenerate FIG. ${figureNumber}.`,
      );
    } finally {
      setRegeneratingFigures((prev) => {
        const next = new Set(prev);
        next.delete(figureNumber);
        return next;
      });
    }
  };

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

            <FigurePanel
              figures={figures}
              activeFigureNumber={activeFigure}
              onSelectFigure={setActiveFigure}
              numFigures={numFigures}
              onNumFiguresChange={setNumFigures}
              loading={loading}
              regeneratingFigures={regeneratingFigures}
              error={error}
              warnings={warnings}
              onGenerate={() => void handleGenerate()}
              onRegenerateOne={(n) => void handleRegenerateOne(n)}
              onMermaidChange={(figureNumber, mermaid) =>
                updateFigure(figureNumber, { mermaid })
              }
            />
          </>
        ),
      })}

      <DocumentPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        inventionTitle={documentTitle}
        sections={sections}
        sectionOrder={sectionOrder}
        figures={figures}
        documentLabel={documentLabel}
        footerNote="Figures are embedded as PNG images when you export Word (.docx)."
      />
    </>
  );
}
