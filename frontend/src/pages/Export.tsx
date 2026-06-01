import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { GenerationProgress } from "../components/GenerationProgress";
import { usePatentWorkflow } from "../context/PatentWorkflowContext";
import {
  ApiError,
  downloadBlob,
  exportDocx,
  exportPdf,
} from "../services/api";
import {
  figuresSignature,
  getCachedFigurePngs,
  prerenderFigurePngs,
} from "../utils/figurePngPrerender";
import {
  PROVISIONAL_FILING_DISCLAIMER,
  PROVISIONAL_FILING_NEXT_STEPS,
  PROVISIONAL_FILING_RESOURCES,
} from "../constants/provisionalFilingResources";
import type { FilingInfo } from "../types/patent";
import "../styles/patent-drafter.css";

type DownloadState = "idle" | "preparing" | "done" | "error";

function filingField(
  id: keyof FilingInfo,
  label: string,
  value: string,
  onChange: (patch: Partial<FilingInfo>) => void,
  options?: { multiline?: boolean; placeholder?: string },
) {
  const common =
    "w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2.5 font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/40";

  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="font-label-md text-label-md text-on-surface">{label}</span>
      {options?.multiline ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          placeholder={options.placeholder}
          onChange={(event) => onChange({ [id]: event.target.value })}
          className={common}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          placeholder={options?.placeholder}
          onChange={(event) => onChange({ [id]: event.target.value })}
          className={common}
        />
      )}
    </label>
  );
}

export default function Export() {
  const {
    invention,
    sections,
    figures,
    briefDescriptionOfDrawings,
    filingInfo,
    setFilingInfo,
    clearWorkflow,
  } = usePatentWorkflow();
  const [docxState, setDocxState] = useState<DownloadState>("idle");
  const [pdfState, setPdfState] = useState<DownloadState>("idle");
  const [prerenderingFigures, setPrerenderingFigures] = useState(false);
  const [figurePngCache, setFigurePngCache] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const figuresSignatureRef = useRef("");

  const signature = figuresSignature(figures);

  useEffect(() => {
    if (figures.length === 0) {
      setFigurePngCache({});
      figuresSignatureRef.current = "";
      return;
    }
    if (signature === figuresSignatureRef.current) {
      return;
    }
    figuresSignatureRef.current = signature;

    const cached = getCachedFigurePngs(signature);
    if (cached) {
      setFigurePngCache(cached);
      return;
    }

    let cancelled = false;
    setPrerenderingFigures(true);
    void prerenderFigurePngs(figures)
      .then((pngs) => {
        if (!cancelled) {
          setFigurePngCache(pngs);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFigurePngCache({});
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPrerenderingFigures(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [figures, signature]);

  const exportSections: Record<string, string> = {
    ...sections,
    ...(briefDescriptionOfDrawings
      ? { brief_description_of_drawings: briefDescriptionOfDrawings }
      : {}),
  };

  const hasContent = Object.values(exportSections).some((body) => body.trim().length > 0);
  const exporting =
    docxState === "preparing" || pdfState === "preparing" || prerenderingFigures;

  const buildExportPayload = () => ({
    sections: exportSections,
    figures,
    brief_description_of_drawings: briefDescriptionOfDrawings,
    invention_title: invention?.invention_title ?? "",
    filing_info: filingInfo,
    figure_pngs: figurePngCache,
  });

  const updateFilingInfo = (patch: Partial<FilingInfo>) => {
    setFilingInfo(patch);
  };

  const ensureFigurePngsReady = async (): Promise<Record<string, string>> => {
    if (figures.length === 0) {
      return figurePngCache;
    }
    const fresh = await prerenderFigurePngs(figures);
    setFigurePngCache(fresh);
    return fresh;
  };

  const handleDownloadDocx = async () => {
    if (!hasContent) {
      setError("No draft sections to export. Complete drafting and figures first.");
      return;
    }
    setError(null);
    setDocxState("preparing");
    try {
      const figurePngs = await ensureFigurePngsReady();
      const blob = await exportDocx({
        ...buildExportPayload(),
        figure_pngs: figurePngs,
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
      const figurePngs = await ensureFigurePngsReady();
      const blob = await exportPdf({
        ...buildExportPayload(),
        figure_pngs: figurePngs,
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
        {prerenderingFigures && (
          <GenerationProgress
            active
            label="Preparing figure drawings for export…"
          />
        )}

        {(docxState === "preparing" || pdfState === "preparing") && (
          <GenerationProgress active label="Assembling your document" />
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
              Download your provisional patent application with USPTO-style section headings,
              separate Claims and Abstract pages, and black-and-white drawing sheets.
            </p>
          </section>

          {error && (
            <div className="mx-10 mt-6 p-4 rounded-lg bg-error-container/20 text-error text-sm">
              {error}
            </div>
          )}

          <section className="p-10 border-b border-outline-variant">
            <h2 className="font-title-lg text-title-lg text-primary mb-2">
              Cover Sheet (PTO/SB/16)
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
              Optional filing information included as the first page of your export. The invention
              title comes from your Review step. For the official form, use the current{" "}
              <a
                href="https://www.uspto.gov/sites/default/files/documents/sb0016.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-secondary underline underline-offset-2 hover:text-primary"
              >
                PTO/SB/16 PDF
              </a>{" "}
              and verify names and addresses match before filing.
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">
              {PROVISIONAL_FILING_DISCLAIMER}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
              {filingField("inventor_name", "Inventor name", filingInfo.inventor_name, updateFilingInfo, {
                placeholder: "Jane Doe",
              })}
              {filingField("inventor_city", "City", filingInfo.inventor_city, updateFilingInfo)}
              {filingField("inventor_state", "State / Province", filingInfo.inventor_state, updateFilingInfo)}
              {filingField("inventor_country", "Country", filingInfo.inventor_country, updateFilingInfo, {
                placeholder: "United States",
              })}
              {filingField(
                "correspondence_name",
                "Correspondence name",
                filingInfo.correspondence_name,
                updateFilingInfo,
              )}
              {filingField(
                "correspondence_email",
                "Correspondence email",
                filingInfo.correspondence_email,
                updateFilingInfo,
              )}
              <div className="md:col-span-2">
                {filingField(
                  "correspondence_address",
                  "Correspondence address",
                  filingInfo.correspondence_address,
                  updateFilingInfo,
                  { multiline: true, placeholder: "Street address\nCity, State ZIP" },
                )}
              </div>
              <div className="md:col-span-2">
                {filingField(
                  "related_applications",
                  "Cross-reference to related applications",
                  filingInfo.related_applications,
                  updateFilingInfo,
                  {
                    multiline: true,
                    placeholder:
                      'Leave blank for "Not Applicable." — or enter prior filing reference, e.g. "This application claims the benefit of U.S. Provisional Application No. 63/123,456, filed January 1, 2025."',
                  },
                )}
              </div>
            </div>
          </section>

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
                  Editable format with cover sheet, USPTO-style headings, drawing sheets numbered
                  1/3–3/3, and Claims and Abstract on separate pages.
                </p>
                <button
                  type="button"
                  onClick={() => void handleDownloadDocx()}
                  disabled={exporting || !hasContent}
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
                  Read-only PDF with the same section layout, cover sheet, drawing sheets, and page
                  breaks for Claims and Abstract.
                </p>
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={exporting || !hasContent}
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
            <h2 className="font-title-lg text-title-lg text-primary mb-2">What to do next</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">
              Your download is a draft specification. Filing with the USPTO also requires forms,
              fees, and attorney review as needed.
            </p>
            <div className="space-y-6">
              {PROVISIONAL_FILING_NEXT_STEPS.map((step, i) => (
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

          <section className="p-10 border-t border-outline-variant">
            <h2 className="font-title-lg text-title-lg text-primary mb-2">Filing resources</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">
              Compare your export to the open-source{" "}
              <a
                href="https://github.com/deftio/provisional-patent-template"
                target="_blank"
                rel="noopener noreferrer"
                className="text-secondary underline underline-offset-2 hover:text-primary"
              >
                deftio provisional template
              </a>{" "}
              and its filled example PDF for section structure and completeness.
            </p>
            <ul className="space-y-4">
              {PROVISIONAL_FILING_RESOURCES.map((resource) => (
                <li key={resource.href}>
                  <a
                    href={resource.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-label-md text-label-md text-secondary hover:text-primary underline underline-offset-2"
                  >
                    {resource.label}
                  </a>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    {resource.description}
                  </p>
                </li>
              ))}
            </ul>
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
