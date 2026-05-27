import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { GenerationProgress } from "../components/GenerationProgress";
import { UndoRedoToolbar } from "../components/UndoRedoToolbar";
import { WorkflowFooter } from "../components/WorkflowFooter";
import { defaultInvention, usePatentWorkflow } from "../context/PatentWorkflowContext";
import { useUndoRedo } from "../hooks/useUndoRedo";
import { ApiError, draftSection } from "../services/api";
import {
  PATENT_SECTION_IDS,
  SECTION_LABELS,
  type PatentSectionId,
} from "../types/patent";
import "../styles/patent-drafter.css";

export default function Draft() {
  const navigate = useNavigate();
  const { invention, sections, setSection, saveToStorage } = usePatentWorkflow();

  const [activeSection, setActiveSection] = useState<PatentSectionId>("field");
  const [generatingSection, setGeneratingSection] = useState<PatentSectionId | null>(null);
  const [autoDrafting, setAutoDrafting] = useState(false);
  const [autoDraftProgress, setAutoDraftProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const autoDraftStarted = useRef(false);

  const {
    value: draftText,
    replace: setDraftText,
    push: pushDraftText,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetDraftHistory,
  } = useUndoRedo("");

  useEffect(() => {
    if (!invention) {
      navigate("/review", { replace: true });
    }
  }, [invention, navigate]);

  const prevSectionRef = useRef(activeSection);
  useEffect(() => {
    if (prevSectionRef.current !== activeSection) {
      resetDraftHistory(sections[activeSection] ?? "");
      prevSectionRef.current = activeSection;
    }
  }, [activeSection, sections, resetDraftHistory]);

  useEffect(() => {
    setSection(activeSection, draftText);
  }, [draftText, activeSection, setSection]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveToStorage(), 500);
    return () => window.clearTimeout(timer);
  }, [draftText, sections, saveToStorage]);

  useEffect(() => {
    if (!invention || autoDraftStarted.current) return;

    const emptySections = PATENT_SECTION_IDS.filter((id) => !sections[id]?.trim());
    if (emptySections.length === 0) return;

    autoDraftStarted.current = true;
    let cancelled = false;

    const runAutoDraft = async () => {
      setAutoDrafting(true);
      setAutoDraftProgress({ current: 0, total: emptySections.length });
      setError(null);

      const details = invention ?? defaultInvention;

      for (let i = 0; i < emptySections.length; i++) {
        if (cancelled) break;
        const sectionId = emptySections[i];
        setGeneratingSection(sectionId);
        setAutoDraftProgress({ current: i + 1, total: emptySections.length });

        try {
          const content = await draftSection(details, sectionId);
          setSection(sectionId, content);
          if (sectionId === activeSection) {
            resetDraftHistory(content);
          }
        } catch (err) {
          setError(
            err instanceof ApiError
              ? err.message
              : `Failed to draft ${SECTION_LABELS[sectionId]}.`,
          );
          break;
        }
      }

      setGeneratingSection(null);
      setAutoDrafting(false);
      saveToStorage();
    };

    void runAutoDraft();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per visit when sections are empty
  }, [invention]);

  const sectionIndex = PATENT_SECTION_IDS.indexOf(activeSection);
  const isDone = (id: PatentSectionId) => Boolean(sections[id]?.trim());
  const isBusy = autoDrafting || generatingSection !== null;

  const handleRegenerateSection = async () => {
    const details = invention ?? defaultInvention;
    setError(null);
    setGeneratingSection(activeSection);
    pushDraftText(draftText);
    try {
      const content = await draftSection(details, activeSection);
      pushDraftText(content);
      setSection(activeSection, content);
      saveToStorage();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to regenerate section.");
    } finally {
      setGeneratingSection(null);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draftText);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  const showEmptyHint =
    !autoDrafting && !draftText.trim() && generatingSection !== activeSection;

  return (
    <AppShell
      step="draft"
      mainClassName="flex flex-col min-h-0 flex-1 overflow-hidden"
      footer={
        <WorkflowFooter
          left={
            <Link
              to="/review"
              className="flex items-center gap-2 px-6 py-2.5 text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              Back
            </Link>
          }
          right={
            <>
              <UndoRedoToolbar
                canUndo={canUndo && !isBusy}
                canRedo={canRedo && !isBusy}
                onUndo={undo}
                onRedo={redo}
              />
              <button
                type="button"
                onClick={() => saveToStorage()}
                className="px-6 py-2.5 border border-secondary text-secondary font-label-md text-label-md rounded-lg hover:bg-secondary/5 transition-all active:scale-95"
              >
                Save Draft
              </button>
              <Link
                to="/figures"
                onClick={() => saveToStorage()}
                className="px-8 py-2.5 bg-primary text-on-primary font-label-md text-label-md rounded-lg shadow-md hover:bg-primary-container transition-all active:scale-95 flex items-center gap-2"
              >
                Next: Figures
                <span className="material-symbols-outlined">arrow_forward</span>
              </Link>
            </>
          }
        />
      }
    >
      <div className="flex flex-1 overflow-hidden min-h-0">
        <aside className="w-64 bg-surface-container-lowest border-r border-outline-variant flex flex-col py-6 px-4 gap-2 z-40 shrink-0 overflow-y-auto custom-scrollbar">
          <h3 className="px-2 mb-2 font-label-sm text-label-sm text-outline uppercase tracking-widest">
            Document Sections
          </h3>
          <p className="px-2 mb-4 font-body-sm text-body-sm text-on-surface-variant">
            Full patent text for each USPTO section, generated from your invention details on
            Review.
          </p>
          {PATENT_SECTION_IDS.map((id) => {
            const active = id === activeSection;
            const done = isDone(id);
            const generating = generatingSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSection(id)}
                className={`flex items-center justify-between p-3 rounded-lg transition-all group text-left w-full ${
                  active
                    ? "bg-secondary-container/20 border border-secondary-container/30"
                    : "hover:bg-surface-container"
                }`}
              >
                <span
                  className={`font-label-md text-label-md ${
                    active ? "text-primary font-bold" : "text-on-surface"
                  }`}
                >
                  {SECTION_LABELS[id]}
                </span>
                {generating && (
                  <span className="material-symbols-outlined loading-spin text-primary text-[18px]">
                    progress_activity
                  </span>
                )}
                {done && !active && !generating && (
                  <span
                    className="material-symbols-outlined text-green-600 text-[18px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        <div className="flex-1 overflow-y-auto bg-[#FAFAFA] flex flex-col relative custom-scrollbar">
          {error && (
            <div className="mx-auto max-w-[800px] w-full mt-4 px-margin-desktop p-4 rounded-lg bg-error-container/20 text-error text-sm">
              {error}
            </div>
          )}

          <div className="max-w-[800px] w-full mx-auto my-8 px-margin-desktop flex-1 flex flex-col gap-6">
            {autoDrafting && (
              <GenerationProgress
                active
                label="Drafting patent sections"
                step={autoDraftProgress}
              />
            )}

            {generatingSection === activeSection && !autoDrafting && (
              <GenerationProgress
                active
                label={`Regenerating ${SECTION_LABELS[activeSection]}`}
              />
            )}

            <div className="mb-2 flex justify-between items-end">
              <div>
                <span className="font-label-sm text-label-sm text-secondary uppercase tracking-widest mb-2 block">
                  Document Section {sectionIndex + 1} of {PATENT_SECTION_IDS.length}
                </span>
                <h1 className="font-headline-lg text-headline-lg text-on-surface">
                  {SECTION_LABELS[activeSection]}
                </h1>
              </div>
            </div>

            {showEmptyHint && (
              <p className="font-body-sm text-body-sm text-on-surface-variant bg-surface-container-low border border-outline-variant rounded-lg p-4">
                This section is empty. Sections draft automatically when you open this page, or
                click <strong>Regenerate Section</strong> to generate this one now.
              </p>
            )}

            <div className="relative group">
              <div className="absolute -right-16 top-0 hidden lg:flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="p-2 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm hover:bg-secondary hover:text-on-primary transition-all active:scale-95"
                  title="Copy Content"
                >
                  <span className="material-symbols-outlined">content_copy</span>
                </button>
              </div>
              <div className="bg-surface-container-lowest canvas-shadow border border-outline-variant rounded-lg p-10 min-h-[400px] flex flex-col">
                <textarea
                  className="w-full flex-1 border-none focus:ring-0 resize-none font-body-md text-body-md leading-relaxed text-on-surface-variant bg-transparent min-h-[360px]"
                  placeholder={`Drafting ${SECTION_LABELS[activeSection].toLowerCase()}...`}
                  value={draftText}
                  disabled={isBusy && generatingSection === activeSection}
                  onChange={(e) => setDraftText(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-between items-center px-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleRegenerateSection()}
                className="flex items-center gap-2 px-5 py-2 border border-outline text-on-surface-variant rounded-lg font-label-md text-label-md hover:bg-surface-variant transition-all active:scale-95 disabled:opacity-60"
              >
                <span
                  className={`material-symbols-outlined text-[20px] ${generatingSection === activeSection ? "loading-spin" : ""}`}
                >
                  refresh
                </span>
                {generatingSection === activeSection ? "Regenerating..." : "Regenerate Section"}
              </button>
              <div className="flex items-center gap-4 text-outline font-label-md text-label-md">
                <span>{draftText.length.toLocaleString()} characters</span>
                <div className="h-4 w-[1px] bg-outline-variant" />
                <span className="text-green-600 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">cloud_done</span>
                  Autosaved
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
