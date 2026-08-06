import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AttorneyFeedbackPanel } from "../../components/AttorneyFeedbackPanel";
import { AutoResizeTextarea } from "../../components/AutoResizeTextarea";
import { CopyToClipboardButton } from "../../components/CopyToClipboardButton";
import { DocumentPreviewModal } from "../../components/DocumentPreviewModal";
import { GrantAppShell } from "../../components/GrantAppShell";
import { GenerationProgress } from "../../components/GenerationProgress";
import { PatentNotesSidebar } from "../../components/PatentNotesSidebar";
import { SelectionRegeneratePopover } from "../../components/SelectionRegeneratePopover";
import { SectionCitationsPanel } from "../../components/SectionCitationsPanel";
import { SectionManagerModal } from "../../components/SectionManagerModal";
import { SavedIndicator, useSavedIndicator } from "../../components/SavedIndicator";
import { UndoRedoToolbar } from "../../components/UndoRedoToolbar";
import { WorkflowFooter } from "../../components/WorkflowFooter";
import { WorkflowBackLink, WorkflowNextLink } from "../../components/WorkflowNavButtons";
import { getDocumentTypeConfig } from "../../constants/documentTypes";
import { useGrantWorkflow } from "../../context/GrantWorkflowContext";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { useTextareaSelectionRegenerate } from "../../hooks/useTextareaSelectionRegenerate";
import {
  ApiError,
  draftAllGrantSections,
  draftGrantSection,
  regenerateSelection,
} from "../../services/api";
import {
  GRANT_SECTION_IDS,
  GRANT_SECTION_LABELS,
  type GrantSectionId,
} from "../../types/patent";
import { formatAllSectionsCopy } from "../../utils/formatAllSectionsCopy";
import { hasGrantDraftSections } from "../../utils/grantStorage";
import {
  buildCustomSectionsPayload,
  effectiveSectionIds,
  resolveSectionLabel,
  resolveSectionOrder,
} from "../../utils/sectionSettings";
import "../../styles/patent-drafter.css";

export default function GrantDraft() {
  const navigate = useNavigate();
  const {
    grantDetails,
    sections,
    sectionCitations,
    reviewerFeedback,
    sectionSettings,
    setSection,
    setSections,
    setSectionCitations,
    setReviewerFeedback,
    setSectionSettings,
    saveToStorage,
    markStepComplete,
    autoDraftPending,
    clearAutoDraftPending,
    gatherSourceText,
    uploadedFiles,
  } = useGrantWorkflow();

  const sectionIds = resolveSectionOrder(
    effectiveSectionIds(GRANT_SECTION_IDS, sectionSettings),
    sectionSettings,
  );
  const grantDefaultDescriptions = useMemo(() => {
    const map: Record<string, string> = {};
    for (const section of getDocumentTypeConfig("GRANT_APPLICATION").sections) {
      map[section.id] = section.description;
    }
    return map;
  }, []);
  const grantWarnOnRemoveIds = useMemo(() => new Set<string>(), []);
  const customSectionsPayload = useMemo(
    () => buildCustomSectionsPayload(GRANT_SECTION_IDS, sectionSettings),
    [sectionSettings],
  );
  const resolvedSectionLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const id of effectiveSectionIds(GRANT_SECTION_IDS, sectionSettings)) {
      map[id] = resolveSectionLabel(
        id,
        sectionSettings,
        GRANT_SECTION_LABELS[id as GrantSectionId] ?? id,
      );
    }
    return map;
  }, [sectionSettings]);

  const [activeSection, setActiveSection] = useState<string>(sectionIds[0]);
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
  const [parallelDrafting, setParallelDrafting] = useState(false);
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirmingRegenerateAll, setConfirmingRegenerateAll] = useState(false);
  const [regeneratingSelection, setRegeneratingSelection] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [manageSectionsOpen, setManageSectionsOpen] = useState(false);
  const { visible: savedVisible, flash: flashSaved } = useSavedIndicator();
  const flashSavedRef = useRef(flashSaved);
  flashSavedRef.current = flashSaved;
  const { copy: copyAll, copied: copiedAll } = useCopyToClipboard();

  const isGenerating = parallelDrafting || regenerating.size > 0 || regeneratingSelection;
  const {
    selection: textareaSelection,
    dismiss: dismissSelectionPopover,
    handleMouseUp,
    handleKeyUp,
  } = useTextareaSelectionRegenerate(isGenerating);
  const autoDraftStarted = useRef(false);
  const sectionsRef = useRef(sections);
  const activeSectionRef = useRef(activeSection);
  const saveToStorageRef = useRef(saveToStorage);
  saveToStorageRef.current = saveToStorage;
  const suppressSavedIndicator = useRef(true);
  const prevActiveSectionRef = useRef(activeSection);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    if (!grantDetails) {
      navigate("/grant/review", { replace: true });
    }
  }, [grantDetails, navigate]);

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

  const startParallelDraft = useCallback(
    async (ids: string[]) => {
      if (!grantDetails || ids.length === 0) return;
      setParallelDrafting(true);
      setError(null);
      try {
        const { combined } = await gatherSourceText();
        const { sections: drafted, citations } = await draftAllGrantSections(
          grantDetails,
          ids,
          combined,
          customSectionsPayload,
          reviewerFeedback,
        );
        setSections({ ...sectionsRef.current, ...drafted });
        setSectionCitations(citations);
        if (ids.includes(activeSectionRef.current)) {
          resetDraftHistory(drafted[activeSectionRef.current] ?? "");
        }
        saveToStorage();
        flashSaved();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to draft sections.");
      } finally {
        setParallelDrafting(false);
      }
    },
    [
      grantDetails,
      gatherSourceText,
      customSectionsPayload,
      reviewerFeedback,
      setSections,
      setSectionCitations,
      resetDraftHistory,
      saveToStorage,
      flashSaved,
    ],
  );

  useEffect(() => {
    if (!grantDetails || !autoDraftPending || autoDraftStarted.current) return;
    if (hasGrantDraftSections(sections)) {
      clearAutoDraftPending();
      return;
    }
    autoDraftStarted.current = true;
    clearAutoDraftPending();
    void startParallelDraft([...sectionIds]);
  }, [
    grantDetails,
    autoDraftPending,
    sections,
    sectionIds,
    clearAutoDraftPending,
    startParallelDraft,
  ]);

  const selectSection = (sectionId: string) => {
    if (sectionId === activeSection) return;
    setSection(activeSection, draftText);
    setActiveSection(sectionId);
    resetDraftHistory(sectionsRef.current[sectionId] ?? "");
  };

  const handleDraftTextChange = (text: string) => {
    setDraftText(text);
    setSection(activeSection, text);
  };

  useEffect(() => {
    if (!suppressSavedIndicator.current) {
      flashSavedRef.current();
    }
  }, [draftText, activeSection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSection(activeSection, draftText);
      saveToStorageRef.current();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftText, activeSection, setSection]);

  const handleRegenerateSection = () => {
    if (!grantDetails || regenerating.has(activeSection) || parallelDrafting) return;
    const sectionId = activeSection;
    setRegenerating((prev) => new Set(prev).add(sectionId));
    setError(null);
    pushDraftText(draftText);
    void (async () => {
      try {
        const { combined } = await gatherSourceText();
        const { content, citations } = await draftGrantSection(grantDetails, sectionId, {
          priorDraft: draftText,
          attorneyFeedback: reviewerFeedback[sectionId] ?? "",
          combinedText: combined,
          customSections: customSectionsPayload,
        });
        if (activeSectionRef.current === sectionId) {
          pushDraftText(content);
        }
        setSection(sectionId, content);
        setSectionCitations({ [sectionId]: citations });
        saveToStorage();
        flashSaved();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Regeneration failed.");
      } finally {
        setRegenerating((prev) => {
          const next = new Set(prev);
          next.delete(sectionId);
          return next;
        });
      }
    })();
  };

  const handleRegenerateAll = () => {
    setConfirmingRegenerateAll(false);
    void startParallelDraft([...sectionIds]);
  };

  const handleCopyAllSections = async () => {
    setSection(activeSection, draftText);
    const text = formatAllSectionsCopy(
      sectionIds,
      resolvedSectionLabels,
      sections,
      activeSection,
      draftText,
    );
    const ok = await copyAll(text);
    if (!ok) {
      setError("Could not copy to clipboard.");
    }
  };

  const sectionIndex = sectionIds.indexOf(activeSection);
  const activeSectionLabel =
    resolvedSectionLabels[activeSection] ??
    GRANT_SECTION_LABELS[activeSection as GrantSectionId] ??
    activeSection;

  const handleConfirmSelectionRegenerate = (instruction: string) => {
    if (!textareaSelection || !grantDetails) return;
    setError(null);
    setRegeneratingSelection(true);
    pushDraftText(draftText);
    void (async () => {
      try {
        const replacement = await regenerateSelection(
          "",
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
    return { ...sections, [activeSection]: draftText };
  }, [sections, activeSection, draftText]);

  const openPreview = useCallback(() => {
    setPreviewOpen(true);
  }, []);

  return (
    <GrantAppShell
      step="draft"
      mainClassName="flex flex-col min-h-0 flex-1 overflow-hidden"
      footer={
        <WorkflowFooter
          left={<WorkflowBackLink to="/grant/review" />}
          right={
            <>
              <SavedIndicator visible={savedVisible} />
              <UndoRedoToolbar
                canUndo={canUndo && !isGenerating}
                canRedo={canRedo && !isGenerating}
                onUndo={undo}
                onRedo={redo}
              />
              <WorkflowNextLink
                to="/grant/export"
                disabled={isGenerating}
                onClick={() => {
                  setSection(activeSection, draftText);
                  markStepComplete("draft");
                  saveToStorage();
                }}
              >
                Next: Export
              </WorkflowNextLink>
            </>
          }
        />
      }
    >
      <div className="flex flex-1 overflow-hidden min-h-0">
        <aside className="w-64 bg-surface-container-lowest border-r border-outline-variant flex flex-col py-6 px-4 shrink-0 min-h-0">
          <div className="px-2 mb-2 flex items-center justify-between gap-2">
            <h3 className="font-label-sm text-label-sm text-outline uppercase tracking-widest">
              Sections
            </h3>
            <button
              type="button"
              onClick={() => setManageSectionsOpen(true)}
              className="shrink-0 font-label-sm text-label-sm text-secondary hover:underline"
            >
              Manage sections
            </button>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0">
            {sectionIds.map((id) => {
              const done = Boolean(sections[id]?.trim());
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectSection(id)}
                  className={`flex items-center justify-between p-3 rounded-lg text-left w-full ${
                    id === activeSection
                      ? "bg-secondary-container/20 border border-secondary-container/30"
                      : "hover:bg-surface-container"
                  }`}
                >
                  <span className="font-label-md text-label-md">
                    {resolvedSectionLabels[id] ?? GRANT_SECTION_LABELS[id as GrantSectionId]}
                  </span>
                  {done && (
                    <span className="material-symbols-outlined text-secondary text-[18px]">check_circle</span>
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
                    onClick={handleRegenerateAll}
                    disabled={parallelDrafting}
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
                disabled={parallelDrafting}
                onClick={() => setConfirmingRegenerateAll(true)}
                className="w-full px-3 py-2 rounded-lg border border-secondary/40 text-secondary font-label-sm text-label-sm hover:bg-secondary/10 disabled:opacity-50"
              >
                Regenerate all
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

        <div className="flex-1 overflow-y-auto bg-[#FAFAFA]">
          {/* Sticky action row — lives outside the padded content so it spans full width */}
          <div className="sticky top-0 z-20 bg-[#FAFAFA] border-b border-outline-variant shadow-sm px-8 py-3 flex gap-3 flex-wrap">
            <button
              type="button"
              disabled={isGenerating}
              onClick={handleRegenerateSection}
              className="px-4 py-2 rounded-lg border border-secondary/40 text-secondary font-label-sm text-label-sm hover:bg-secondary/10 disabled:opacity-50 flex items-center gap-2"
            >
              <span
                className={`material-symbols-outlined text-[18px] ${regenerating.has(activeSection) ? "loading-spin" : ""}`}
              >
                autorenew
              </span>
              Regenerate section
            </button>
            <CopyToClipboardButton
              text={draftText}
              disabled={!draftText.trim()}
              onError={setError}
              className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface font-label-sm text-label-sm hover:bg-surface-container-lowest flex items-center gap-2 disabled:opacity-50"
            />
          </div>

          <div className="p-8">
          {error && (
            <div className="mb-4 p-4 rounded-lg bg-error-container/20 text-error text-sm">{error}</div>
          )}

          {parallelDrafting && (
            <div className="mb-4">
              <GenerationProgress active label="Drafting all sections in parallel…" />
            </div>
          )}

          <div className="max-w-[800px] mx-auto space-y-4">
            <div className="flex justify-between items-end gap-4">
              <div>
                <span className="font-label-sm text-label-sm text-secondary uppercase tracking-widest mb-2 block">
                  Section {sectionIndex + 1} of {sectionIds.length}
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

            <AttorneyFeedbackPanel
              sectionId={activeSection}
              sectionLabel={activeSectionLabel}
              panelTitle="Grant reviewer feedback"
              panelDescription={`Notes for ${activeSectionLabel.toLowerCase()} — applied when regenerating this section.`}
              showApprove={false}
              value={reviewerFeedback[activeSection] ?? ""}
              onChange={(comment) => setReviewerFeedback(activeSection, comment)}
              disabled={isGenerating}
            />

            <div className="relative bg-surface-container-lowest border border-outline-variant rounded-lg p-8 min-h-[400px]">
              {regenerating.has(activeSection) && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-container-lowest/90 rounded-lg">
                  <GenerationProgress
                    active
                    label={`Drafting ${activeSectionLabel.toLowerCase()}…`}
                  />
                </div>
              )}
              <AutoResizeTextarea
                className="w-full border-none focus:ring-0 resize-none font-body-md text-body-md leading-relaxed text-on-surface bg-transparent min-h-[360px]"
                value={draftText}
                disabled={regenerating.has(activeSection)}
                onChange={(e) => handleDraftTextChange(e.target.value)}
                onMouseUp={handleMouseUp}
                onKeyUp={handleKeyUp}
              />
            </div>

            <SectionCitationsPanel
              citations={sectionCitations[activeSection] ?? []}
              uploadedFiles={uploadedFiles}
            />
          </div>
          </div>{/* end p-8 */}
        </div>

        <PatentNotesSidebar
          sectionIds={sectionIds}
          feedback={reviewerFeedback}
          sectionLabels={resolvedSectionLabels}
          heading="All Grant Reviewer Notes"
          emptyStateText="No grant reviewer notes added yet. Add feedback in each section of the Draft page."
        />
      </div>

      <DocumentPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        inventionTitle={grantDetails?.project_title}
        sections={previewSections}
        pendingSectionIds={[]}
        onSectionClick={(sectionId) => selectSection(sectionId)}
        footerNote="Click a section heading to jump back and edit it."
      />
      <SectionManagerModal
        open={manageSectionsOpen}
        onClose={() => setManageSectionsOpen(false)}
        sectionIds={GRANT_SECTION_IDS}
        defaultLabels={GRANT_SECTION_LABELS}
        defaultDescriptions={grantDefaultDescriptions}
        warnOnRemoveIds={grantWarnOnRemoveIds}
        settings={sectionSettings}
        onSave={setSectionSettings}
      />
      <SelectionRegeneratePopover
        anchorRect={textareaSelection?.anchorRect ?? null}
        loading={regeneratingSelection}
        onConfirm={handleConfirmSelectionRegenerate}
        onDismiss={dismissSelectionPopover}
      />
    </GrantAppShell>
  );
}
