import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GenericAppShell } from "../../components/GenericAppShell";
import { GenerationProgress } from "../../components/GenerationProgress";
import { WorkflowFooter } from "../../components/WorkflowFooter";
import { WorkflowBackLink } from "../../components/WorkflowNavButtons";
import { useGenericWorkflow } from "../../context/GenericWorkflowContext";
import {
  ApiError,
  downloadBlob,
  exportGenericDocx,
  exportGenericPdf,
} from "../../services/api";
import {
  GENERIC_STEP_PATHS,
  isGenericStepAccessible,
} from "../../utils/genericStorage";
import {
  buildSectionLabelsPayload,
  effectiveSectionIds,
  resolveSectionLabel,
  resolveSectionOrder,
} from "../../utils/sectionSettings";
import "../../styles/patent-drafter.css";

type DownloadState = "idle" | "preparing" | "done" | "error";

export default function GenericExport() {
  const navigate = useNavigate();
  const {
    templateId,
    template,
    details,
    sections,
    figures,
    sectionSettings,
    getWorkflowSnapshot,
    clearWorkflow,
  } = useGenericWorkflow();
  const [docxState, setDocxState] = useState<DownloadState>("idle");
  const [pdfState, setPdfState] = useState<DownloadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const paths = GENERIC_STEP_PATHS(templateId);
  const templateSectionIds = useMemo(
    () => template.sections.map((section) => section.id),
    [template.sections],
  );
  const defaultLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const section of template.sections) {
      map[section.id] = section.name;
    }
    return map;
  }, [template.sections]);

  useEffect(() => {
    if (!isGenericStepAccessible("export", getWorkflowSnapshot())) {
      navigate(paths.figures, { replace: true });
    }
  }, [getWorkflowSnapshot, navigate, paths.figures]);

  const includedIds = useMemo(
    () =>
      resolveSectionOrder(
        effectiveSectionIds(templateSectionIds, sectionSettings),
        sectionSettings,
      ),
    [templateSectionIds, sectionSettings],
  );
  const emptySections = useMemo(
    () => includedIds.filter((id) => !sections[id]?.trim()),
    [sections, includedIds],
  );
  const sectionLabelsPayload = useMemo(
    () => buildSectionLabelsPayload(Object.keys(sections), sectionSettings, defaultLabels),
    [sections, sectionSettings, defaultLabels],
  );
  const isComplete = emptySections.length === 0 && includedIds.length > 0;
  const exporting = docxState === "preparing" || pdfState === "preparing";
  const exportDisabled = exporting || !isComplete;
  const documentTitle = details?.title ?? "";

  const handleDownloadDocx = async () => {
    if (!isComplete) return;
    setError(null);
    setDocxState("preparing");
    try {
      const blob = await exportGenericDocx(
        sections,
        documentTitle,
        includedIds,
        sectionLabelsPayload,
        figures,
      );
      downloadBlob(blob, "custom-document.docx");
      setDocxState("idle");
    } catch (err) {
      setDocxState("error");
      setError(err instanceof ApiError ? err.message : "DOCX export failed.");
      window.setTimeout(() => setDocxState("idle"), 3000);
    }
  };

  const handleDownloadPdf = async () => {
    if (!isComplete) return;
    setError(null);
    setPdfState("preparing");
    try {
      const blob = await exportGenericPdf(
        sections,
        documentTitle,
        includedIds,
        sectionLabelsPayload,
        figures,
      );
      downloadBlob(blob, "custom-document.pdf");
      setPdfState("idle");
    } catch (err) {
      setPdfState("error");
      setError(err instanceof ApiError ? err.message : "PDF export failed.");
      window.setTimeout(() => setPdfState("idle"), 3000);
    }
  };

  return (
    <GenericAppShell
      step="export"
      layout="document"
      mainClassName="px-margin-desktop pt-10 pb-28"
      footer={<WorkflowFooter left={<WorkflowBackLink to={paths.figures} />} />}
    >
      <div className="max-w-[800px] mx-auto w-full space-y-8">
        {(docxState === "preparing" || pdfState === "preparing") && (
          <GenerationProgress active label="Assembling your document" />
        )}

        <div className="bg-surface-container-lowest border border-outline-variant canvas-shadow rounded-xl overflow-hidden">
          <section className="p-10 text-center border-b border-outline-variant">
            {isComplete ? (
              <>
                <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-full bg-secondary-container/20 text-secondary">
                  <span className="material-symbols-outlined text-5xl">check_circle</span>
                </div>
                <h1 className="font-headline-lg text-headline-lg text-primary mb-2">
                  Your {template.name} Is Ready
                </h1>
                <p className="font-body-lg text-body-lg text-on-surface-variant">
                  Download your document with numbered section headings.
                </p>
              </>
            ) : (
              <>
                <h1 className="font-headline-lg text-headline-lg text-primary mb-2">
                  Draft Incomplete
                </h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                  Missing:{" "}
                  {emptySections
                    .map((id) =>
                      resolveSectionLabel(id, sectionSettings, defaultLabels[id] ?? id),
                    )
                    .join(", ") || "at least one section"}
                </p>
                <Link
                  to={paths.figures}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg border border-outline font-label-md text-label-md"
                >
                  Back to Figures
                </Link>
              </>
            )}
          </section>

          {error && (
            <div className="mx-10 mt-6 p-4 rounded-lg bg-error-container/20 text-error text-sm">
              {error}
            </div>
          )}

          <section className="p-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
              <div className="flex flex-col p-6 rounded-xl border border-outline-variant">
                <span className="material-symbols-outlined text-primary text-3xl mb-3">
                  description
                </span>
                <h2 className="font-title-md text-title-md text-primary mb-2">DOCX</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4 flex-1">
                  Editable Word document with numbered section headings.
                </p>
                <button
                  type="button"
                  disabled={exportDisabled}
                  onClick={() => void handleDownloadDocx()}
                  className="px-4 py-2.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md disabled:opacity-50"
                >
                  {docxState === "preparing" ? "Preparing…" : "Download DOCX"}
                </button>
              </div>
              <div className="flex flex-col p-6 rounded-xl border border-outline-variant">
                <span className="material-symbols-outlined text-primary text-3xl mb-3">
                  picture_as_pdf
                </span>
                <h2 className="font-title-md text-title-md text-primary mb-2">PDF</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4 flex-1">
                  Print-ready PDF with numbered section headings.
                </p>
                <button
                  type="button"
                  disabled={exportDisabled}
                  onClick={() => void handleDownloadPdf()}
                  className="px-4 py-2.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md disabled:opacity-50"
                >
                  {pdfState === "preparing" ? "Preparing…" : "Download PDF"}
                </button>
              </div>
            </div>

            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => {
                  clearWorkflow();
                  navigate("/");
                }}
                className="font-label-md text-label-md text-secondary hover:underline"
              >
                Start a new draft
              </button>
            </div>
          </section>
        </div>
      </div>
    </GenericAppShell>
  );
}
