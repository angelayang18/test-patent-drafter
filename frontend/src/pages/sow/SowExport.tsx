import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SowAppShell } from "../../components/SowAppShell";
import { GenerationProgress } from "../../components/GenerationProgress";
import { WorkflowFooter } from "../../components/WorkflowFooter";
import { WorkflowBackLink } from "../../components/WorkflowNavButtons";
import { useSowWorkflow } from "../../context/SowWorkflowContext";
import {
  ApiError,
  downloadBlob,
  exportSowDocx,
  exportSowPdf,
} from "../../services/api";
import { SOW_SECTION_IDS, SOW_SECTION_LABELS } from "../../types/patent";
import {
  buildSectionLabelsPayload,
  effectiveSectionIds,
  resolveSectionLabel,
  resolveSectionOrder,
} from "../../utils/sectionSettings";
import { isSowStepAccessible } from "../../utils/sowStorage";
import "../../styles/patent-drafter.css";

type DownloadState = "idle" | "preparing" | "done" | "error";

export default function SowExport() {
  const navigate = useNavigate();
  const {
    sowDetails,
    sections,
    sectionSettings,
    getWorkflowSnapshot,
    clearWorkflow,
  } = useSowWorkflow();
  const [docxState, setDocxState] = useState<DownloadState>("idle");
  const [pdfState, setPdfState] = useState<DownloadState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSowStepAccessible("export", getWorkflowSnapshot())) {
      navigate("/sow/draft", { replace: true });
    }
  }, [getWorkflowSnapshot, navigate]);

  const includedIds = useMemo(
    () =>
      resolveSectionOrder(
        effectiveSectionIds(SOW_SECTION_IDS, sectionSettings),
        sectionSettings,
      ),
    [sectionSettings],
  );
  const emptySections = useMemo(
    () => includedIds.filter((id) => !sections[id]?.trim()),
    [sections, includedIds],
  );
  const sectionLabelsPayload = useMemo(
    () => buildSectionLabelsPayload(Object.keys(sections), sectionSettings, SOW_SECTION_LABELS),
    [sections, sectionSettings],
  );
  const isComplete = emptySections.length === 0;
  const exporting = docxState === "preparing" || pdfState === "preparing";
  const exportDisabled = exporting || !isComplete;
  const engagementTitle = sowDetails?.engagement_title ?? "";

  const handleDownloadDocx = async () => {
    if (!isComplete) return;
    setError(null);
    setDocxState("preparing");
    try {
      const blob = await exportSowDocx(sections, engagementTitle, sectionLabelsPayload);
      downloadBlob(blob, "sow-contract.docx");
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
      const blob = await exportSowPdf(sections, engagementTitle, sectionLabelsPayload);
      downloadBlob(blob, "sow-contract.pdf");
      setPdfState("idle");
    } catch (err) {
      setPdfState("error");
      setError(err instanceof ApiError ? err.message : "PDF export failed.");
      window.setTimeout(() => setPdfState("idle"), 3000);
    }
  };

  return (
    <SowAppShell
      step="export"
      layout="document"
      mainClassName="px-margin-desktop pt-10 pb-28"
      footer={<WorkflowFooter left={<WorkflowBackLink to="/sow/draft" />} />}
    >
      <div className="max-w-[800px] mx-auto w-full space-y-8">
        {(docxState === "preparing" || pdfState === "preparing") && (
          <GenerationProgress active label="Assembling your SOW contract" />
        )}

        <div className="bg-surface-container-lowest border border-outline-variant canvas-shadow rounded-xl overflow-hidden">
          <section className="p-10 text-center border-b border-outline-variant">
            {isComplete ? (
              <>
                <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-full bg-secondary-container/20 text-secondary">
                  <span className="material-symbols-outlined text-5xl">check_circle</span>
                </div>
                <h1 className="font-headline-lg text-headline-lg text-primary mb-2">
                  Your SOW Contract Is Ready
                </h1>
                <p className="font-body-lg text-body-lg text-on-surface-variant">
                  Download your contract with numbered section headings.
                </p>
              </>
            ) : (
              <>
                <h1 className="font-headline-lg text-headline-lg text-primary mb-2">Draft Incomplete</h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                  Missing:{" "}
                  {emptySections
                    .map((id) =>
                      resolveSectionLabel(id, sectionSettings, SOW_SECTION_LABELS[id as keyof typeof SOW_SECTION_LABELS] ?? id),
                    )
                    .join(", ")}
                </p>
                <Link
                  to="/sow/draft"
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg border border-outline font-label-md text-label-md"
                >
                  Back to Draft
                </Link>
              </>
            )}
          </section>

          {error && (
            <div className="mx-10 mt-6 p-4 rounded-lg bg-error-container/20 text-error text-sm">{error}</div>
          )}

          <section className="p-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
              <div className="flex flex-col p-6 rounded-xl border border-outline-variant">
                <span className="material-symbols-outlined text-primary text-3xl mb-3">description</span>
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
                <span className="material-symbols-outlined text-primary text-3xl mb-3">picture_as_pdf</span>
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
                  navigate("/sow");
                }}
                className="font-label-md text-label-md text-secondary hover:underline"
              >
                Start a new SOW draft
              </button>
            </div>
          </section>
        </div>
      </div>
    </SowAppShell>
  );
}
