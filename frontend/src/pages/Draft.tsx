import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { GenerationProgress } from "../components/GenerationProgress";
import { UndoRedoToolbar } from "../components/UndoRedoToolbar";
import { WorkflowFooter } from "../components/WorkflowFooter";
import { defaultInvention, usePatentWorkflow } from "../context/PatentWorkflowContext";
import { useUndoRedo } from "../hooks/useUndoRedo";
import { ApiError, draftAllSections, draftSection } from "../services/api";
import {
  PATENT_SECTION_IDS,
  SECTION_LABELS,
  type PatentSectionId,
} from "../types/patent";
import "../styles/patent-drafter.css";

export default function Draft() {
  const navigate = useNavigate();
  const { invention, sections, setSection, setSections, saveToStorage } =
    usePatentWorkflow();

  const [activeSection, setActiveSection] = useState<PatentSectionId>("field");
  const [parallelDrafting, setParallelDrafting] = useState(false);
  const [parallelAgentCount, setParallelAgentCount] = useState(0);
  const [pendingSectionIds, setPendingSectionIds] = useState<PatentSectionId[]>([]);
  const [regeneratingSection, setRegeneratingSection] = useState<PatentSectionId | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const activeSectionRef = useRef(activeSection);
  const sectionsRef = useRef(sections);
  const pendingSectionIdsRef = useRef<PatentSectionId[]>([]);
  const parallelDraftInitiated = useRef(false);

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
    pendingSectionIdsRef.current = pendingSectionIds;
  }, [pendingSectionIds]);

  useEffect(() => {
    resetDraftHistory(sectionsRef.current[activeSection] ?? "");
    // Load stored content for the initial section once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      const leavingPending = pendingSectionIdsRef.current.includes(activeSection);
      const leavingRegenerating = regeneratingSection === activeSection;
      if (!leavingPending && !leavingRegenerating) {
        flushActiveSection(activeSection, draftText);
      }

      setActiveSection(nextSection);

      const enteringPending = pendingSectionIdsRef.current.includes(nextSection);
      resetDraftHistory(
        enteringPending ? "" : (sectionsRef.current[nextSection] ?? ""),
      );
    },
    [activeSection, draftText, flushActiveSection, regeneratingSection, resetDraftHistory],
  );

  const setPendingSections = useCallback((sectionIds: PatentSectionId[]) => {
    pendingSectionIdsRef.current = sectionIds;
    setPendingSectionIds(sectionIds);
  }, []);

  const clearPendingSections = useCallback(() => {
    pendingSectionIdsRef.current = [];
    setPendingSectionIds([]);
  }, []);

  const startParallelDraft = useCallback(
    async (sectionIds: PatentSectionId[]) => {
      if (!invention || sectionIds.length === 0) return;

      setParallelDrafting(true);
      setParallelAgentCount(sectionIds.length);
      setPendingSections(sectionIds);
      setError(null);

      try {
        const drafted = await draftAllSections(
          invention ?? defaultInvention,
          sectionIds,
        );
        setSections({ ...sectionsRef.current, ...drafted });
        const active = activeSectionRef.current;
        if (sectionIds.includes(active) && drafted[active]) {
          resetDraftHistory(drafted[active]);
        }
        saveToStorage();
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Failed to draft sections in parallel.",
        );
      } finally {
        clearPendingSections();
        setParallelDrafting(false);
        setParallelAgentCount(0);
      }
    },
    [
      clearPendingSections,
      invention,
      resetDraftHistory,
      saveToStorage,
      setPendingSections,
      setSections,
    ],
  );

  useEffect(() => {
    if (!invention || parallelDraftInitiated.current) return;

    const empty = PATENT_SECTION_IDS.filter((id) => !sectionsRef.current[id]?.trim());
    if (empty.length === 0) return;

    parallelDraftInitiated.current = true;
    void startParallelDraft(empty);
  }, [invention, startParallelDraft]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (pendingSectionIds.includes(activeSection) || regeneratingSection === activeSection) {
        return;
      }
      flushActiveSection(activeSection, draftText);
      saveToStorage();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    draftText,
    activeSection,
    pendingSectionIds,
    regeneratingSection,
    flushActiveSection,
    saveToStorage,
  ]);

  const handleDraftAllEmpty = () => {
    const empty = PATENT_SECTION_IDS.filter((id) => !sections[id]?.trim());
    if (empty.length === 0) return;
    void startParallelDraft(empty);
  };

  const sectionIndex = PATENT_SECTION_IDS.indexOf(activeSection);
  const isDone = (id: PatentSectionId) => Boolean(sections[id]?.trim());
  const isSectionPending = (id: PatentSectionId) =>
    pendingSectionIds.includes(id) || regeneratingSection === id;
  const isGeneratingActive = isSectionPending(activeSection);
  const isBusy = pendingSectionIds.length > 0 || regeneratingSection !== null;
  const hasEmptySections = PATENT_SECTION_IDS.some(
    (id) => !sections[id]?.trim() && !pendingSectionIds.includes(id),
  );

  const handleRegenerateSection = async () => {
    if (!invention) return;
    const sectionId = activeSection;
    setError(null);
    pushDraftText(draftText);
    setRegeneratingSection(sectionId);
    try {
      const content = await draftSection(invention ?? defaultInvention, sectionId);
      setSection(sectionId, content);
      if (activeSectionRef.current === sectionId) {
        pushDraftText(content);
      }
      saveToStorage();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to regenerate section.");
    } finally {
      setRegeneratingSection((current) => (current === sectionId ? null : current));
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
            Six dedicated agents draft sections in parallel using the US provisional filing
            template. Each agent only sees invention details—not other sections.
          </p>
          {hasEmptySections && (
            <button
              type="button"
              disabled={isBusy}
              onClick={handleDraftAllEmpty}
              className="mx-2 mb-2 px-3 py-2 text-left rounded-lg border border-secondary/40 text-secondary font-label-sm text-label-sm hover:bg-secondary/10 disabled:opacity-50 flex items-center gap-2"
            >
              <span
                className={`material-symbols-outlined text-[18px] ${parallelDrafting ? "loading-spin" : ""}`}
              >
                auto_awesome
              </span>
              Run parallel agents on empty sections
            </button>
          )}
          {PATENT_SECTION_IDS.map((id) => {
            const active = id === activeSection;
            const done = isDone(id) && !isSectionPending(id);
            const generating = isSectionPending(id);
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
            {parallelDrafting && (
              <GenerationProgress
                active
                label={`${parallelAgentCount} section agents drafting in parallel (provisional filing template)`}
              />
            )}

            {regeneratingSection === activeSection && !parallelDrafting && (
              <GenerationProgress
                active
                label={`Regenerating ${SECTION_LABELS[activeSection]} (single agent)`}
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

            {!isGeneratingActive && !draftText.trim() && !isSectionPending(activeSection) && (
              <p className="font-body-sm text-body-sm text-on-surface-variant bg-surface-container-low border border-outline-variant rounded-lg p-4">
                Empty sections are drafted automatically when you arrive from Review. Use{" "}
                <strong>Run parallel agents on empty sections</strong> to retry, or{" "}
                <strong>Regenerate Section</strong> for this section only.
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
                      {regeneratingSection === activeSection
                        ? `Agent is regenerating ${SECTION_LABELS[activeSection].toLowerCase()}…`
                        : `Agent is drafting ${SECTION_LABELS[activeSection].toLowerCase()}…`}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant text-center max-w-md">
                      {parallelDrafting
                        ? "Each section uses an isolated agent and the provisional filing template. You can switch sections while drafting continues."
                        : "This usually takes 15–60 seconds."}
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
