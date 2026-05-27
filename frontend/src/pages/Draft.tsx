import { useCallback, useEffect, useRef, useState } from "react";
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
  const [bulkDrafting, setBulkDrafting] = useState(false);
  const [bulkDraftProgress, setBulkDraftProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const activeSectionRef = useRef(activeSection);
  const sectionsRef = useRef(sections);
  const inFlightSections = useRef(new Set<PatentSectionId>());

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

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
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    if (!invention) {
      navigate("/review", { replace: true });
    }
  }, [invention, navigate]);

  const flushActiveSection = useCallback(
    (sectionId: PatentSectionId, text: string) => {
      setSection(sectionId, text);
    },
    [setSection],
  );

  const selectSection = useCallback(
    (nextSection: PatentSectionId) => {
      if (nextSection === activeSection) return;
      flushActiveSection(activeSection, draftText);
      setActiveSection(nextSection);
      resetDraftHistory(sections[nextSection] ?? "");
    },
    [activeSection, draftText, flushActiveSection, resetDraftHistory, sections],
  );

  const draftSectionContent = useCallback(
    async (sectionId: PatentSectionId, force = false) => {
      if (!invention) return;
      if (inFlightSections.current.has(sectionId)) return;
      if (!force && sectionsRef.current[sectionId]?.trim()) return;

      inFlightSections.current.add(sectionId);
      setGeneratingSection(sectionId);
      setError(null);

      try {
        const content = await draftSection(invention ?? defaultInvention, sectionId);
        setSection(sectionId, content);
        if (activeSectionRef.current === sectionId) {
          resetDraftHistory(content);
        }
        saveToStorage();
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : `Failed to draft ${SECTION_LABELS[sectionId]}.`,
        );
      } finally {
        inFlightSections.current.delete(sectionId);
        setGeneratingSection((current) => (current === sectionId ? null : current));
      }
    },
    [invention, resetDraftHistory, saveToStorage, setSection],
  );

  useEffect(() => {
    if (!invention) return;
    if (sectionsRef.current[activeSection]?.trim()) return;
    if (inFlightSections.current.has(activeSection)) return;
    void draftSectionContent(activeSection);
  }, [activeSection, invention, draftSectionContent]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (generatingSection === activeSection) return;
      flushActiveSection(activeSection, draftText);
      saveToStorage();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftText, activeSection, generatingSection, flushActiveSection, saveToStorage]);

  const handleDraftAllEmpty = async () => {
    if (!invention) return;
    const empty = PATENT_SECTION_IDS.filter((id) => !sections[id]?.trim());
    if (empty.length === 0) return;

    setBulkDrafting(true);
    setBulkDraftProgress({ current: 0, total: empty.length });
    setError(null);

    for (let i = 0; i < empty.length; i++) {
      const sectionId = empty[i];
      setBulkDraftProgress({ current: i + 1, total: empty.length });
      if (!sectionsRef.current[sectionId]?.trim()) {
        await draftSectionContent(sectionId);
      }
    }

    setBulkDrafting(false);
    setBulkDraftProgress({ current: 0, total: 0 });
  };

  const sectionIndex = PATENT_SECTION_IDS.indexOf(activeSection);
  const isDone = (id: PatentSectionId) => Boolean(sections[id]?.trim());
  const isGeneratingActive = generatingSection === activeSection;
  const isBusy = bulkDrafting || generatingSection !== null;
  const hasEmptySections = PATENT_SECTION_IDS.some((id) => !sections[id]?.trim());

  const handleRegenerateSection = async () => {
    if (!invention) return;
    setError(null);
    pushDraftText(draftText);
    inFlightSections.current.add(activeSection);
    setGeneratingSection(activeSection);
    try {
      const content = await draftSection(invention ?? defaultInvention, activeSection);
      pushDraftText(content);
      setSection(activeSection, content);
      saveToStorage();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to regenerate section.");
    } finally {
      inFlightSections.current.delete(activeSection);
      setGeneratingSection((current) => (current === activeSection ? null : current));
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draftText);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

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
                onClick={() => {
                  flushActiveSection(activeSection, draftText);
                  saveToStorage();
                }}
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
            Each section is drafted with AI from your invention details. Open an empty section to
            start generating it.
          </p>
          {hasEmptySections && (
            <button
              type="button"
              disabled={bulkDrafting || isBusy}
              onClick={() => void handleDraftAllEmpty()}
              className="mx-2 mb-2 px-3 py-2 text-left rounded-lg border border-secondary/40 text-secondary font-label-sm text-label-sm hover:bg-secondary/10 disabled:opacity-50 flex items-center gap-2"
            >
              <span
                className={`material-symbols-outlined text-[18px] ${bulkDrafting ? "loading-spin" : ""}`}
              >
                auto_awesome
              </span>
              Draft all empty sections
            </button>
          )}
          {PATENT_SECTION_IDS.map((id) => {
            const active = id === activeSection;
            const done = isDone(id);
            const generating =
              generatingSection === id || (bulkDrafting && !sections[id]?.trim());
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectSection(id)}
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
                {done && !generating && (
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
            {bulkDrafting && (
              <GenerationProgress
                active
                label="Drafting all empty sections"
                step={bulkDraftProgress}
              />
            )}

            {isGeneratingActive && !bulkDrafting && (
              <GenerationProgress
                active
                label={`Generating ${SECTION_LABELS[activeSection]}`}
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

            {!isGeneratingActive && !draftText.trim() && !bulkDrafting && (
              <p className="font-body-sm text-body-sm text-on-surface-variant bg-surface-container-low border border-outline-variant rounded-lg p-4">
                This section is empty. It will generate automatically when you select it, or click{" "}
                <strong>Regenerate Section</strong> to draft or refresh it now.
              </p>
            )}

            <div className="relative group">
              <div className="absolute -right-16 top-0 hidden lg:flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  disabled={isGeneratingActive}
                  className="p-2 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm hover:bg-secondary hover:text-on-primary transition-all active:scale-95 disabled:opacity-50"
                  title="Copy Content"
                >
                  <span className="material-symbols-outlined">content_copy</span>
                </button>
              </div>
              <div className="bg-surface-container-lowest canvas-shadow border border-outline-variant rounded-lg p-10 min-h-[400px] flex flex-col relative">
                {isGeneratingActive && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-lg bg-surface-container-lowest/90 backdrop-blur-[1px]">
                    <span className="material-symbols-outlined text-primary text-5xl loading-spin">
                      progress_activity
                    </span>
                    <p className="font-title-lg text-title-lg text-primary text-center px-6">
                      AI is drafting {SECTION_LABELS[activeSection].toLowerCase()}…
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant text-center max-w-md">
                      This usually takes 15–60 seconds. You can switch sections; drafting continues
                      in the background.
                    </p>
                  </div>
                )}
                <textarea
                  className="w-full flex-1 border-none focus:ring-0 resize-none font-body-md text-body-md leading-relaxed text-on-surface bg-transparent min-h-[360px] disabled:cursor-wait"
                  placeholder={
                    isGeneratingActive
                      ? ""
                      : `Generated text for ${SECTION_LABELS[activeSection].toLowerCase()} will appear here.`
                  }
                  value={draftText}
                  readOnly={isGeneratingActive}
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
                  className={`material-symbols-outlined text-[20px] ${isGeneratingActive ? "loading-spin" : ""}`}
                >
                  refresh
                </span>
                {isGeneratingActive ? "Generating..." : "Regenerate Section"}
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
