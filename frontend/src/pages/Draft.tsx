import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AttorneyFeedbackPanel } from "../components/AttorneyFeedbackPanel";
import { PatentNotesSidebar, NOTES_SIDEBAR_OPEN_OFFSET_PX } from "../components/PatentNotesSidebar";
import { DocumentPreviewModal } from "../components/DocumentPreviewModal";
import { GenerationProgress } from "../components/GenerationProgress";
import { SelectionRegeneratePopover } from "../components/SelectionRegeneratePopover";
import { CopyToClipboardButton } from "../components/CopyToClipboardButton";
import { SavedIndicator, useSavedIndicator } from "../components/SavedIndicator";
import { UndoRedoToolbar } from "../components/UndoRedoToolbar";
import { WorkflowBackLink, WorkflowNextLink } from "../components/WorkflowNavButtons";
import { WorkflowFooter } from "../components/WorkflowFooter";
import { defaultGrantDetails, defaultInvention } from "../types/patent";
import { usePatentWorkflow } from "../context/PatentWorkflowContext";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { useUndoRedo } from "../hooks/useUndoRedo";
import { useTextareaSelectionRegenerate } from "../hooks/useTextareaSelectionRegenerate";
import {
  ApiError,
  draftAllGrantSections,
  draftAllSections,
  draftGrantSection,
  draftSection,
  regenerateSelection,
} from "../services/api";
import {
  GRANT_SECTION_IDS,
  GRANT_SECTION_LABELS,
  PATENT_SECTION_IDS,
  SECTION_LABELS,
  type PatentSectionId,
} from "../types/patent";
import { hasDraftSections, isWorkflowStepAccessible } from "../utils/draftStorage";
import { formatAllSectionsCopy } from "../utils/formatAllSectionsCopy";
import "../styles/patent-drafter.css";

export default function Draft() {
  const navigate = useNavigate();
  const {
    workflowMode,
    invention,
    grantDetails,
    sections,
    filingInfo,
    attorneyFeedback,
    approvedExemplars,
    setAttorneyFeedback,
    setApprovedExemplar,
    captureAiInitialSections,
    setSection,
    setSections,
    saveToStorage,
    getWorkflowSnapshot,
    markStepComplete,
    autoDraftPending,
    clearAutoDraftPending,
    workflowResetting,
    gatherSourceText,
  } = usePatentWorkflow();

  const isGrant = workflowMode === "grant";
  const reviewDetails = isGrant ? grantDetails : invention;
  const sectionIds = isGrant ? GRANT_SECTION_IDS : PATENT_SECTION_IDS;
  const sectionLabels = isGrant ? GRANT_SECTION_LABELS : SECTION_LABELS;

  const [activeSection, setActiveSection] = useState<string>(sectionIds[0]);
  const [parallelDrafting, setParallelDrafting] = useState(false);
  const [parallelAgentCount, setParallelAgentCount] = useState(0);
  const [pendingSectionIds, setPendingSectionIds] = useState<string[]>([]);
  const [regeneratingSections, setRegeneratingSections] = useState<Set<string>>(
    new Set(),
  );
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [regeneratingSelection, setRegeneratingSelection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  const [confirmingRegenerateAll, setConfirmingRegenerateAll] = useState(false);
  const { visible: savedVisible, flash: flashSaved } = useSavedIndicator();
  const { copy: copyAll, copied: copiedAll } = useCopyToClipboard();

  const activeSectionRef = useRef(activeSection);
  const sectionsRef = useRef(sections);
  const pendingSectionIdsRef = useRef<string[]>([]);
  const autoDraftStarted = useRef(false);
  const suppressSavedIndicator = useRef(true);
  const prevActiveSectionRef = useRef(activeSection);

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
    const timer = window.setTimeout(() => {
      suppressSavedIndicator.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
    // Load stored content for the initial section once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prevActiveSectionRef.current === activeSection) return;
    prevActiveSectionRef.current = activeSection;
    suppressSavedIndicator.current = true;
    const timer = window.setTimeout(() => {
      suppressSavedIndicator.current = false;
    }, 600);
    return () => window.clearTimeout(timer);
  }, [activeSection]);

  useEffect(() => {
    if (workflowResetting) {
      return;
    }
    if (!reviewDetails) {
      navigate("/review", { replace: true });
      return;
    }
    if (!isWorkflowStepAccessible("draft", getWorkflowSnapshot())) {
      navigate("/review", { replace: true });
    }
  }, [reviewDetails, getWorkflowSnapshot, navigate, workflowResetting]);

  const flushActiveSection = useCallback(
    (sectionId: string, text: string) => {
      setSection(sectionId, text);
    },
    [setSection],
  );

  const selectSection = useCallback(
    (nextSection: string) => {
      if (nextSection === activeSection) return;

      const leavingPending = pendingSectionIdsRef.current.includes(activeSection);
      const leavingRegenerating = regeneratingSections.has(activeSection);
      if (!leavingPending && !leavingRegenerating) {
        flushActiveSection(activeSection, draftText);
      }

      setActiveSection(nextSection);

      const enteringPending = pendingSectionIdsRef.current.includes(nextSection);
      resetDraftHistory(
        enteringPending ? "" : (sectionsRef.current[nextSection] ?? ""),
      );
    },
    [activeSection, draftText, flushActiveSection, regeneratingSections, resetDraftHistory],
  );

  const setPendingSections = useCallback((sectionIdsToSet: string[]) => {
    pendingSectionIdsRef.current = sectionIdsToSet;
    setPendingSectionIds(sectionIdsToSet);
  }, []);

  const clearPendingSections = useCallback(() => {
    pendingSectionIdsRef.current = [];
    setPendingSectionIds([]);
  }, []);

  const startParallelDraft = useCallback(
    async (ids: string[]) => {
      if (!reviewDetails || ids.length === 0) return;

      setParallelDrafting(true);
      setParallelAgentCount(ids.length);
      setPendingSections(ids);
      setError(null);

      try {
        const drafted = isGrant
          ? await draftAllGrantSections(grantDetails ?? defaultGrantDetails, ids)
          : await draftAllSections(
              invention ?? defaultInvention,
              ids,
              attorneyFeedback,
            );
        captureAiInitialSections(drafted);
        setSections({ ...sectionsRef.current, ...drafted });
        const active = activeSectionRef.current;
        if (ids.includes(active) && drafted[active]) {
          resetDraftHistory(drafted[active]);
        }
        saveToStorage();
        flashSaved();
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
      isGrant,
      reviewDetails,
      invention,
      grantDetails,
      attorneyFeedback,
      captureAiInitialSections,
      resetDraftHistory,
      saveToStorage,
      setPendingSections,
      setSections,
      flashSaved,
    ],
  );

  useEffect(() => {
    if (!reviewDetails || !autoDraftPending || autoDraftStarted.current) return;

    if (hasDraftSections(sections)) {
      clearAutoDraftPending();
      return;
    }

    autoDraftStarted.current = true;
    clearAutoDraftPending();
    void startParallelDraft([...sectionIds]);
  }, [
    reviewDetails,
    autoDraftPending,
    sections,
    clearAutoDraftPending,
    startParallelDraft,
    sectionIds,
  ]);

  useEffect(() => {
    if (workflowResetting || !invention) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (pendingSectionIds.includes(activeSection) || regeneratingSections.has(activeSection)) {
        return;
      }
      flushActiveSection(activeSection, draftText);
      saveToStorage();
      if (!suppressSavedIndicator.current) {
        flashSaved();
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    draftText,
    activeSection,
    pendingSectionIds,
    regeneratingSections,
    flushActiveSection,
    saveToStorage,
    flashSaved,
    invention,
    workflowResetting,
  ]);

  const handleDraftAllEmpty = () => {
    const empty = sectionIds.filter((id) => !sections[id]?.trim());
    if (empty.length === 0) return;
    void startParallelDraft(empty);
  };

  const sectionIndex = sectionIds.indexOf(activeSection as never);
  const isDone = (id: string) => Boolean(sections[id]?.trim());
  const isSectionPending = (id: string) =>
    pendingSectionIds.includes(id) || regeneratingSections.has(id);
  const isGeneratingActive = isSectionPending(activeSection);
  const isBusy =
    pendingSectionIds.length > 0 ||
    regeneratingSections.size > 0 ||
    regeneratingSelection;
  const hasEmptySections = sectionIds.some(
    (id) => !sections[id]?.trim() && !pendingSectionIds.includes(id),
  );

  const {
    selection: textareaSelection,
    dismiss: dismissSelectionPopover,
    handleMouseUp,
    handleKeyUp,
  } = useTextareaSelectionRegenerate(isBusy || isGeneratingActive);

  const handleRegenerateAll = async () => {
    if (!reviewDetails || isBusy) return;
    setConfirmingRegenerateAll(false);
    setRegeneratingAll(true);
    try {
      await startParallelDraft([...sectionIds]);
    } finally {
      setRegeneratingAll(false);
    }
  };

  const handleCopyAllSections = async () => {
    flushActiveSection(activeSection, draftText);
    const mergedSections = { ...sections, [activeSection]: draftText };
    const text = formatAllSectionsCopy(
      sectionIds,
      sectionLabels as Record<string, string>,
      mergedSections,
      activeSection,
      draftText,
    );
    const ok = await copyAll(text);
    if (!ok) {
      setError("Could not copy to clipboard.");
    }
  };

  const handleRegenerateSection = () => {
    if (!reviewDetails) return;
    const sectionId = activeSection;
    if (
      regeneratingSections.has(sectionId) ||
      pendingSectionIds.includes(sectionId) ||
      regeneratingSelection
    ) {
      return;
    }

    setError(null);
    pushDraftText(draftText);
    setRegeneratingSections((prev) => new Set(prev).add(sectionId));

    void (async () => {
      try {
        const content = isGrant
          ? await draftGrantSection(grantDetails ?? defaultGrantDetails, sectionId, {
              priorDraft: sectionsRef.current[sectionId] ?? draftText,
            })
          : await draftSection(invention ?? defaultInvention, sectionId, {
              priorDraft: sectionsRef.current[sectionId] ?? draftText,
              attorneyFeedback: attorneyFeedback[sectionId as PatentSectionId] ?? "",
            });
        captureAiInitialSections({ [sectionId]: content });
        setSection(sectionId, content);
        if (activeSectionRef.current === sectionId) {
          pushDraftText(content);
        }
        saveToStorage();
        flashSaved();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to regenerate section.");
      } finally {
        setRegeneratingSections((prev) => {
          const next = new Set(prev);
          next.delete(sectionId);
          return next;
        });
      }
    })();
  };

  const handleConfirmSelectionRegenerate = (instruction: string) => {
    if (!textareaSelection || !reviewDetails) return;

    setError(null);
    setRegeneratingSelection(true);
    pushDraftText(draftText);

    void (async () => {
      try {
        const { combined } = await gatherSourceText();
        const replacement = await regenerateSelection(
          combined,
          draftText,
          textareaSelection.text,
          instruction,
        );
        const newText =
          draftText.slice(0, textareaSelection.start) +
          replacement +
          draftText.slice(textareaSelection.end);
        pushDraftText(newText);
        setSection(activeSection, newText);
        saveToStorage();
        flashSaved();
        dismissSelectionPopover();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Selection rewrite failed.");
      } finally {
        setRegeneratingSelection(false);
      }
    })();
  };

  const previewSections = useMemo(() => {
    const merged = { ...sections };
    const activePending = pendingSectionIds.includes(activeSection);
    const activeRegenerating = regeneratingSections.has(activeSection);
    if (!activePending && !activeRegenerating) {
      merged[activeSection] = draftText;
    }
    return merged;
  }, [sections, activeSection, draftText, pendingSectionIds, regeneratingSections]);

  const openPreview = useCallback(() => {
    const activePending = pendingSectionIdsRef.current.includes(activeSection);
    const activeRegenerating = regeneratingSections.has(activeSection);
    if (!activePending && !activeRegenerating) {
      flushActiveSection(activeSection, draftText);
    }
    setPreviewOpen(true);
  }, [activeSection, draftText, flushActiveSection, regeneratingSections]);

  const handlePreviewSectionClick = useCallback(
    (sectionId: string) => {
      selectSection(sectionId);
    },
    [selectSection],
  );

  const nextStepPath = isGrant ? "/export" : "/figures";
  const nextStepLabel = isGrant ? "Next: Export" : "Next: Figures";
  const activeSectionLabel =
    (sectionLabels as Record<string, string>)[activeSection] ?? activeSection;

  return (
    <AppShell
      step="draft"
      mainClassName="flex flex-col min-h-0 flex-1 overflow-hidden"
      footer={
        <WorkflowFooter
          left={<WorkflowBackLink to="/review" />}
          right={
            <>
              <SavedIndicator visible={savedVisible} />
              <UndoRedoToolbar
                canUndo={canUndo && !isBusy}
                canRedo={canRedo && !isBusy}
                onUndo={undo}
                onRedo={redo}
              />
              {isBusy && (
                <span
                  className="font-label-sm text-label-sm text-on-surface-variant max-w-[12rem] text-right leading-snug"
                  title="Wait for drafting to complete."
                >
                  Wait for drafting to complete.
                </span>
              )}
              <WorkflowNextLink
                to={nextStepPath}
                disabled={isBusy}
                disabledTitle="Wait for drafting to complete."
                onClick={() => {
                  flushActiveSection(activeSection, draftText);
                  markStepComplete("draft");
                  saveToStorage();
                }}
              >
                {nextStepLabel}
              </WorkflowNextLink>
            </>
          }
        />
      }
    >
      <div className="flex flex-1 overflow-hidden min-h-0 relative">
        <aside className="w-64 bg-surface-container-lowest border-r border-outline-variant flex flex-col py-6 px-4 z-40 shrink-0 min-h-0">
          <h3 className="px-2 mb-2 font-label-sm text-label-sm text-outline uppercase tracking-widest">
            Document Sections
          </h3>
          <p className="px-2 mb-4 font-body-sm text-body-sm text-on-surface-variant">
            {isGrant
              ? "Dedicated agents draft each grant section in parallel using your extracted project details."
              : "Six dedicated agents draft sections in parallel using the US provisional filing template. Each agent only sees invention details—not other sections."}
          </p>
          {hasEmptySections && (
            <button
              type="button"
              disabled={isBusy}
              onClick={handleDraftAllEmpty}
              className="mx-2 mb-2 px-3 py-2 text-left rounded-lg border border-secondary/40 text-secondary font-label-sm text-label-sm hover:bg-secondary/10 disabled:opacity-50 flex items-center gap-2"
            >
              <span
                className={`material-symbols-outlined text-[18px] ${parallelDrafting && !regeneratingAll ? "loading-spin" : ""}`}
              >
                auto_awesome
              </span>
              Run parallel agents on empty sections
            </button>
          )}
          <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0 custom-scrollbar">
            {sectionIds.map((id) => {
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
                    {sectionLabels[id as keyof typeof sectionLabels]}
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
          </div>
          <div className="mt-auto pt-4 border-t border-outline-variant space-y-2 shrink-0">
            {confirmingRegenerateAll ? (
              <div className="p-3 rounded-lg border border-secondary/30 bg-secondary/5 space-y-3">
                <p className="font-body-sm text-body-sm text-on-surface">
                  Are you sure? This will regenerate all {sectionIds.length} sections.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRegenerateAll()}
                    disabled={isBusy}
                    className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-sm text-label-sm disabled:opacity-50"
                  >
                    Yes, regenerate all
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRegenerateAll(false)}
                    className="px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface font-label-sm text-label-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setConfirmingRegenerateAll(true)}
                className="w-full px-3 py-2 text-left rounded-lg border border-secondary/40 text-secondary font-label-sm text-label-sm hover:bg-secondary/10 disabled:opacity-50 flex items-center gap-2"
              >
                <span
                  className={`material-symbols-outlined text-[18px] ${regeneratingAll ? "loading-spin" : ""}`}
                >
                  autorenew
                </span>
                Regenerate all sections
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleCopyAllSections()}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant text-on-surface font-label-sm text-label-sm hover:bg-surface-container-lowest flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">
                {copiedAll ? "check" : "content_copy"}
              </span>
              {copiedAll ? "Copied!" : "Copy all sections"}
            </button>
          </div>
        </aside>

        <div
          className="flex-1 overflow-y-auto bg-[#FAFAFA] flex flex-col relative custom-scrollbar transition-[margin-right] duration-300 ease-in-out"
          style={{
            marginRight: !isGrant && notesPanelOpen ? NOTES_SIDEBAR_OPEN_OFFSET_PX : 0,
          }}
        >
          {/* Sticky action row — full-width, outside padded content so background is solid */}
          <div className="sticky top-0 z-20 bg-[#FAFAFA] border-b border-outline-variant shadow-sm px-margin-desktop py-3 flex gap-3 flex-wrap shrink-0">
            <button
              type="button"
              disabled={isGeneratingActive}
              onClick={handleRegenerateSection}
              className="flex items-center gap-2 px-5 py-2 border border-outline text-on-surface-variant rounded-lg font-label-md text-label-md hover:bg-surface-variant transition-all active:scale-95 disabled:opacity-60"
            >
              <span
                className={`material-symbols-outlined text-[20px] ${isGeneratingActive ? "loading-spin" : ""}`}
              >
                refresh
              </span>
              {isGeneratingActive ? "Generating..." : "Regenerate Section"}
            </button>
            <CopyToClipboardButton
              text={draftText}
              disabled={isGeneratingActive || !draftText.trim()}
              onError={setError}
              className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface font-label-sm text-label-sm hover:bg-surface-container-lowest flex items-center gap-2 disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="mx-auto max-w-[800px] w-full mt-4 px-margin-desktop p-4 rounded-lg bg-error-container/20 text-error text-sm">
              {error}
            </div>
          )}

          <div className="max-w-[800px] w-full mx-auto my-8 px-margin-desktop flex-1 flex flex-col gap-6">
            {parallelDrafting && (
              <GenerationProgress
                active
                label={
                  regeneratingAll
                    ? "Regenerating all document sections"
                    : `${parallelAgentCount} section agents drafting in parallel (provisional filing template)`
                }
              />
            )}

            {regeneratingSections.has(activeSection) && !parallelDrafting && (
              <GenerationProgress
                active
                label={`Regenerating ${activeSectionLabel} (single agent)`}
              />
            )}

            <div className="mb-2 flex justify-between items-end gap-4">
              <div>
                <span className="font-label-sm text-label-sm text-secondary uppercase tracking-widest mb-2 block">
                  Document Section {sectionIndex + 1} of {sectionIds.length}
                </span>
                <h1 className="font-headline-lg text-headline-lg text-on-surface">
                  {activeSectionLabel}
                </h1>
              </div>
              <button
                type="button"
                onClick={openPreview}
                className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:text-primary hover:border-secondary font-label-md text-label-md transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-[20px]">visibility</span>
                Preview document
              </button>
            </div>

            {!isGeneratingActive && !draftText.trim() && !isSectionPending(activeSection) && (
              <p className="font-body-sm text-body-sm text-on-surface-variant bg-surface-container-low border border-outline-variant rounded-lg p-4">
                Empty sections are drafted automatically when you arrive from Review. Use{" "}
                <strong>Run parallel agents on empty sections</strong> to retry, or{" "}
                <strong>Regenerate Section</strong> for this section only.
              </p>
            )}

            <AttorneyFeedbackPanel
              sectionId={activeSection as PatentSectionId}
              sectionLabel={activeSectionLabel}
              panelTitle={isGrant ? "Reviewer notes" : undefined}
              panelDescription={
                isGrant
                  ? `Notes for ${activeSectionLabel.toLowerCase()} — reference while editing this section.`
                  : undefined
              }
              showApprove={!isGrant}
              value={attorneyFeedback[activeSection as PatentSectionId] ?? ""}
              onChange={(comment) =>
                setAttorneyFeedback(activeSection as PatentSectionId, comment)
              }
              approved={approvedExemplars[activeSection as PatentSectionId]}
              onApprove={
                isGrant
                  ? undefined
                  : (approved) => setApprovedExemplar(activeSection as PatentSectionId, approved)
              }
              disabled={isBusy}
            />

            <div className="relative">
              <div className="bg-surface-container-lowest canvas-shadow border border-outline-variant rounded-lg p-10 min-h-[400px] flex flex-col relative">
                {isGeneratingActive && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-lg bg-surface-container-lowest/90 backdrop-blur-[1px]">
                    <span className="material-symbols-outlined text-primary text-5xl loading-spin">
                      progress_activity
                    </span>
                    <p className="font-title-lg text-title-lg text-primary text-center px-6">
                      {regeneratingSections.has(activeSection)
                        ? `Agent is regenerating ${activeSectionLabel.toLowerCase()}…`
                        : `Agent is drafting ${activeSectionLabel.toLowerCase()}…`}
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
                      : `Generated text for ${activeSectionLabel.toLowerCase()} will appear here.`
                  }
                  value={draftText}
                  readOnly={isGeneratingActive}
                  onChange={(e) => setDraftText(e.target.value)}
                  onMouseUp={handleMouseUp}
                  onKeyUp={handleKeyUp}
                />
              </div>
            </div>

            <div className="flex justify-end items-center px-2">
              <span className="text-outline font-label-md text-label-md">
                {draftText.length.toLocaleString()} characters
              </span>
            </div>
          </div>
        </div>

        {!isGrant && (
          <PatentNotesSidebar
            attorneyFeedback={attorneyFeedback}
            sectionLabels={SECTION_LABELS}
            onOpenChange={setNotesPanelOpen}
          />
        )}
      </div>

      <DocumentPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        inventionTitle={
          isGrant ? grantDetails?.project_title : invention?.invention_title
        }
        filingInfo={filingInfo}
        sections={previewSections}
        pendingSectionIds={pendingSectionIds}
        onSectionClick={handlePreviewSectionClick}
        footerNote="Click a section heading to jump back and edit it."
      />
      <SelectionRegeneratePopover
        anchorRect={textareaSelection?.anchorRect ?? null}
        loading={regeneratingSelection}
        onConfirm={handleConfirmSelectionRegenerate}
        onDismiss={dismissSelectionPopover}
      />
    </AppShell>
  );
}
