import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GrantAppShell } from "../../components/GrantAppShell";
import { GenerationProgress } from "../../components/GenerationProgress";
import { QAReportPanel } from "../../components/QAReportPanel";
import { WorkflowFooter } from "../../components/WorkflowFooter";
import { WorkflowBackLink } from "../../components/WorkflowNavButtons";
import { useGrantWorkflow } from "../../context/GrantWorkflowContext";
import {
  ApiError,
  downloadBlob,
  exportGrantDocx,
  exportGrantPdf,
  fetchFormatQAReport,
  type QAReportEntry,
} from "../../services/api";
import { GRANT_SECTION_IDS, GRANT_SECTION_LABELS } from "../../types/patent";
import { isGrantStepAccessible } from "../../utils/grantStorage";
import {
  buildSectionLabelsPayload,
  effectiveSectionIds,
  resolveSectionLabel,
  resolveSectionOrder,
} from "../../utils/sectionSettings";
import "../../styles/patent-drafter.css";

type DownloadState = "idle" | "preparing" | "done" | "error";

export default function GrantExport() {
  const navigate = useNavigate();
  const {
    grantDetails,
    sections,
    sectionSettings,
    getWorkflowSnapshot,
    clearWorkflow,
  } = useGrantWorkflow();
  const [docxState, setDocxState] = useState<DownloadState>("idle");
  const [pdfState, setPdfState] = useState<DownloadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [qaReport, setQaReport] = useState<QAReportEntry[]>([]);

  useEffect(() => {
    if (!isGrantStepAccessible("export", getWorkflowSnapshot())) {
      navigate("/grant/draft", { replace: true });
    }
  }, [getWorkflowSnapshot, navigate]);

  const includedIds = useMemo(
    () =>
      resolveSectionOrder(
        effectiveSectionIds(GRANT_SECTION_IDS, sectionSettings),
        sectionSettings,
      ),
    [sectionSettings],
  );
  const emptySections = useMemo(
    () => includedIds.filter((id) => !sections[id]?.trim()),
    [sections, includedIds],
  );
  const sectionLabelsPayload = useMemo(
    () =>
      buildSectionLabelsPayload(Object.keys(sections), sectionSettings, GRANT_SECTION_LABELS),
    [sections, sectionSettings],
  );
  const isComplete = emptySections.length === 0;
  const exporting = docxState === "preparing" || pdfState === "preparing";
  const exportDisabled = exporting || !isComplete;
  const projectTitle = grantDetails?.project_title ?? "";

  useEffect(() => {
    let cancelled = false;

    const loadQa = async () => {
      try {
        const report = await fetchFormatQAReport(sections, "grant");
        if (!cancelled) {
          setQaReport(report);
        }
      } catch {
        if (!cancelled) {
          setQaReport([]);
        }
      }
    };

    void loadQa();
    return () => {
      cancelled = true;
    };
  }, [sections]);

  const handleDownloadDocx = async () => {
    if (!isComplete) return;
    setError(null);
    setDocxState("preparing");
    try {
      const blob = await exportGrantDocx(sections, projectTitle, sectionLabelsPayload);
      downloadBlob(blob, "grant-application.docx");
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
      const blob = await exportGrantPdf(sections, projectTitle, sectionLabelsPayload);
      downloadBlob(blob, "grant-application.pdf");
      setPdfState("idle");
    } catch (err) {
      setPdfState("error");
      setError(err instanceof ApiError ? err.message : "PDF export failed.");
      window.setTimeout(() => setPdfState("idle"), 3000);
    }
  };

  return (
    <GrantAppShell
      step="export"
      layout="document"
      mainClassName="px-margin-desktop pt-10 pb-28"
      footer={<WorkflowFooter left={<WorkflowBackLink to="/grant/draft" />} />}
    >
      <div className="max-w-[800px] mx-auto w-full space-y-8">
        {(docxState === "preparing" || pdfState === "preparing") && (
          <GenerationProgress active label="Assembling your grant application" />
        )}

        <div className="bg-surface-container-lowest border border-outline-variant canvas-shadow rounded-xl overflow-hidden">
          <section className="p-10 text-center border-b border-outline-variant">
            {isComplete ? (
              <>
                <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-full bg-secondary-container/20 text-secondary">
                  <span className="material-symbols-outlined text-5xl">check_circle</span>
                </div>
                <h1 className="font-headline-lg text-headline-lg text-primary mb-2">
                  Your Grant Application Is Ready
                </h1>
                <p className="font-body-lg text-body-lg text-on-surface-variant">
                  Download your application with numbered section headings.
                </p>
              </>
            ) : (
              <>
                <h1 className="font-headline-lg text-headline-lg text-primary mb-2">Draft Incomplete</h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                  Missing:{" "}
                  {emptySections
                    .map((id) =>
                      resolveSectionLabel(
                        id,
                        sectionSettings,
                        GRANT_SECTION_LABELS[id as keyof typeof GRANT_SECTION_LABELS] ?? id,
                      ),
                    )
                    .join(", ")}
                </p>
                <Link
                  to="/grant/draft"
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

          <QAReportPanel
            report={qaReport}
            sectionOrder={GRANT_SECTION_IDS}
            description="Automated checks for empty sections and insufficient source-content language before export."
          />

          <section className="p-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
              <div className="flex flex-col p-6 rounded-xl border border-outline-variant">
                <h3 className="font-title-lg text-title-lg text-primary mb-4">Word Document (.docx)</h3>
                <button
                  type="button"
                  disabled={exportDisabled}
                  onClick={() => void handleDownloadDocx()}
                  className="mt-auto px-6 py-3 rounded-lg bg-primary-container text-on-primary font-label-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {docxState === "preparing" ? "Preparing…" : "Download Grant Application (.docx)"}
                </button>
              </div>
              <div className="flex flex-col p-6 rounded-xl border border-outline-variant">
                <h3 className="font-title-lg text-title-lg text-primary mb-4">PDF Document (.pdf)</h3>
                <button
                  type="button"
                  disabled={exportDisabled}
                  onClick={() => void handleDownloadPdf()}
                  className="mt-auto px-6 py-3 rounded-lg bg-primary text-on-primary font-label-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {pdfState === "preparing" ? "Preparing…" : "Download Grant Application (.pdf)"}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="pb-8">
          <button
            type="button"
            onClick={() => {
              clearWorkflow();
              navigate("/grant", { replace: true });
            }}
            className="font-label-md text-label-md text-secondary hover:text-primary transition-colors flex items-center gap-2 underline underline-offset-4"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Start a New Grant Application
          </button>
        </div>
      </div>
    </GrantAppShell>
  );
}
