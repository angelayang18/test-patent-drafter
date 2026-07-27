import { useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAdaWorkflow } from "../context/AdaWorkflowContext";
import { useGrantWorkflow } from "../context/GrantWorkflowContext";
import { usePatentWorkflow } from "../context/PatentWorkflowContext";
import { useSowWorkflow } from "../context/SowWorkflowContext";
import {
  defaultDraftName,
  formatSavedAt,
  getResumePath,
  readDraftFile,
  type SavedDraftRecord,
} from "../utils/draftStorage";
import { countAllSavedDrafts } from "../utils/draftCounts";
import {
  defaultAdaDraftName,
  getAdaResumePath,
  readAdaDraftFile,
  type SavedAdaDraftRecord,
} from "../utils/adaStorage";
import {
  defaultGrantDraftName,
  getGrantResumePath,
  readGrantDraftFile,
  type SavedGrantDraftRecord,
} from "../utils/grantStorage";
import {
  defaultSowDraftName,
  getSowResumePath,
  readSowDraftFile,
  type SavedSowDraftRecord,
} from "../utils/sowStorage";

interface DraftManagerModalProps {
  open: boolean;
  onClose: () => void;
  onDraftCountChange?: () => void;
}

type ActiveDraftMode = "patent" | "grant" | "sow" | "ada";

function getActiveDraftMode(pathname: string): ActiveDraftMode {
  if (pathname.startsWith("/grant")) return "grant";
  if (pathname.startsWith("/sow")) return "sow";
  if (pathname.startsWith("/ada")) return "ada";
  return "patent";
}

export function DraftManagerModal({ open, onClose, onDraftCountChange }: DraftManagerModalProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const uploadInputId = useId();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const mode = getActiveDraftMode(location.pathname);

  const patent = usePatentWorkflow();
  const grant = useGrantWorkflow();
  const sow = useSowWorkflow();
  const ada = useAdaWorkflow();

  const activeContext =
    mode === "grant" ? grant : mode === "sow" ? sow : mode === "ada" ? ada : patent;
  const {
    getWorkflowSnapshot,
    saveNamedDraft,
    exportDraftFile,
    saveToStorage,
    clearWorkflow,
  } = activeContext;

  const [draftName, setDraftName] = useState("");
  const [patentDrafts, setPatentDrafts] = useState<SavedDraftRecord[]>(() =>
    patent.getSavedDrafts().filter((record) => record.workflow.workflowMode !== "grant"),
  );
  const [grantDrafts, setGrantDrafts] = useState<SavedGrantDraftRecord[]>(() =>
    grant.getSavedDrafts(),
  );
  const [sowDrafts, setSowDrafts] = useState<SavedSowDraftRecord[]>(() => sow.getSavedDrafts());
  const [adaDrafts, setAdaDrafts] = useState<SavedAdaDraftRecord[]>(() => ada.getSavedDrafts());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  if (!open) return null;

  const snapshot = getWorkflowSnapshot();
  const suggestedName =
    mode === "grant"
      ? draftName.trim() ||
        defaultGrantDraftName(snapshot as ReturnType<typeof grant.getWorkflowSnapshot>)
      : mode === "sow"
        ? draftName.trim() ||
          defaultSowDraftName(snapshot as ReturnType<typeof sow.getWorkflowSnapshot>)
        : mode === "ada"
          ? draftName.trim() ||
            defaultAdaDraftName(snapshot as ReturnType<typeof ada.getWorkflowSnapshot>)
          : draftName.trim() ||
            defaultDraftName(snapshot as ReturnType<typeof patent.getWorkflowSnapshot>);

  const refreshDraftList = () => {
    setPatentDrafts(
      patent.getSavedDrafts().filter((record) => record.workflow.workflowMode !== "grant"),
    );
    setGrantDrafts(grant.getSavedDrafts());
    setSowDrafts(sow.getSavedDrafts());
    setAdaDrafts(ada.getSavedDrafts());
    onDraftCountChange?.();
  };

  const handleSaveCurrent = () => {
    setError(null);
    setMessage(null);
    try {
      saveToStorage();
      saveNamedDraft(suggestedName);
      refreshDraftList();
      setMessage(`Saved “${suggestedName}” to this browser.`);
      setDraftName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save draft.");
    }
  };

  const handleDownload = () => {
    setError(null);
    setMessage(null);
    try {
      saveToStorage();
      exportDraftFile(suggestedName);
      const suffix =
        mode === "grant"
          ? ".grant-draft.json"
          : mode === "sow"
            ? ".sow-draft.json"
            : mode === "ada"
              ? ".ada-draft.json"
              : ".patent-draft.json";
      setMessage(`Downloaded ${suggestedName}${suffix}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download draft.");
    }
  };

  const handleLoadPatentDraft = (record: SavedDraftRecord) => {
    setError(null);
    patent.importWorkflow({
      ...record.workflow,
      loadedFromDraftId: record.id,
    });
    onClose();
    navigate(getResumePath(record.workflow));
  };

  const handleLoadGrantDraft = (record: SavedGrantDraftRecord) => {
    setError(null);
    grant.importWorkflow({
      ...record.workflow,
      loadedFromDraftId: record.id,
    });
    onClose();
    navigate(getGrantResumePath(record.workflow));
  };

  const handleLoadSowDraft = (record: SavedSowDraftRecord) => {
    setError(null);
    sow.importWorkflow({
      ...record.workflow,
      loadedFromDraftId: record.id,
    });
    onClose();
    navigate(getSowResumePath(record.workflow));
  };

  const handleLoadAdaDraft = (record: SavedAdaDraftRecord) => {
    setError(null);
    ada.importWorkflow({
      ...record.workflow,
      loadedFromDraftId: record.id,
    });
    onClose();
    navigate(getAdaResumePath(record.workflow));
  };

  const handleDeletePatentDraft = (id: string) => {
    patent.removeSavedDraft(id);
    refreshDraftList();
    setMessage("Removed saved patent draft.");
  };

  const handleDeleteGrantDraft = (id: string) => {
    grant.removeSavedDraft(id);
    refreshDraftList();
    setMessage("Removed saved grant draft.");
  };

  const handleDeleteSowDraft = (id: string) => {
    sow.removeSavedDraft(id);
    refreshDraftList();
    setMessage("Removed saved SOW draft.");
  };

  const handleDeleteAdaDraft = (id: string) => {
    ada.removeSavedDraft(id);
    refreshDraftList();
    setMessage("Removed saved ADA draft.");
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let destination: ActiveDraftMode = "patent";

      try {
        const parsed = await readAdaDraftFile(file);
        ada.importWorkflow(parsed.workflow);
        destination = "ada";
      } catch {
        try {
          const parsed = await readSowDraftFile(file);
          sow.importWorkflow(parsed.workflow);
          destination = "sow";
        } catch {
          try {
            const parsed = await readGrantDraftFile(file);
            grant.importWorkflow(parsed.workflow);
            destination = "grant";
          } catch {
            const parsed = await readDraftFile(file);
            if (parsed.workflow.workflowMode === "grant") {
              grant.importWorkflow({
                grantDetails: parsed.workflow.grantDetails,
                sections: parsed.workflow.sections,
                uploadedFiles: parsed.workflow.uploadedFiles,
                inputSources: parsed.workflow.inputSources,
                cachedRemoteSources: parsed.workflow.cachedRemoteSources,
                completedSteps: parsed.workflow.completedSteps?.filter(
                  (step): step is "input" | "review" | "draft" | "export" =>
                    step !== "figures",
                ),
                extractionSourceKey: parsed.workflow.extractionSourceKey,
                autoDraftPending: parsed.workflow.autoDraftPending,
              });
              destination = "grant";
            } else {
              patent.importWorkflow(parsed.workflow);
              destination = "patent";
            }
          }
        }
      }

      refreshDraftList();
      setMessage(`Loaded draft from ${file.name}`);
      onClose();
      if (destination === "ada") {
        navigate(getAdaResumePath(ada.getWorkflowSnapshot()));
      } else if (destination === "sow") {
        navigate(getSowResumePath(sow.getWorkflowSnapshot()));
      } else if (destination === "grant") {
        navigate(getGrantResumePath(grant.getWorkflowSnapshot()));
      } else {
        navigate(getResumePath(patent.getWorkflowSnapshot()));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load draft file.");
    } finally {
      setBusy(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const handleConfirmClear = () => {
    onClose();
    clearWorkflow();
    navigate(
      mode === "grant"
        ? "/grant/input"
        : mode === "sow"
          ? "/sow/input"
          : mode === "ada"
            ? "/ada/input"
            : "/",
      { replace: true },
    );
  };

  const hasCurrentWork =
    mode === "grant"
      ? Boolean(grant.grantDetails)
      : mode === "sow"
        ? Boolean(sow.sowDetails)
        : mode === "ada"
          ? Boolean(ada.adaDetails)
          : Boolean(patent.invention);
  const totalSaved = countAllSavedDrafts();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="draft-manager-title"
        className="bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant w-full max-w-lg max-h-[85vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-outline-variant">
          <div>
            <h2 id="draft-manager-title" className="font-headline-md text-headline-md text-primary">
              Save &amp; load drafts
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Save your work in this browser or upload a draft file to continue later.
              {totalSaved > 0 && (
                <span className="block mt-1">{totalSaved} saved draft{totalSaved === 1 ? "" : "s"} in this browser.</span>
              )}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {message && (
            <div className="p-3 rounded-lg bg-secondary-container/20 text-secondary text-sm">
              {message}
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-error-container/20 text-error text-sm">{error}</div>
          )}

          <section className="space-y-3">
            <label
              htmlFor="draft-name"
              className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"
            >
              Draft name
            </label>
            <input
              id="draft-name"
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={suggestedName}
              className="w-full bg-white border border-outline-variant rounded-lg p-3 font-body-sm text-body-sm focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveCurrent}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95"
              >
                Save to browser
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="px-4 py-2 rounded-lg border border-secondary text-secondary font-label-md text-label-md hover:bg-secondary/10 transition-all active:scale-95"
              >
                Download file
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Your current work also auto-saves in this browser as you edit. Download a draft file
              to move drafts between devices or back up your progress.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="font-label-md text-label-md text-on-surface">Upload draft file</h3>
            <input
              ref={uploadInputRef}
              id={uploadInputId}
              type="file"
              accept=".json,.patent-draft.json,.grant-draft.json,.sow-draft.json,.ada-draft.json,application/json"
              className="hidden"
              onChange={(e) => void handleUpload(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => uploadInputRef.current?.click()}
              className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-outline-variant hover:border-secondary hover:bg-secondary/5 font-label-md text-label-md text-on-surface-variant transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">upload_file</span>
              {busy
                ? "Loading draft…"
                : "Choose draft file (.patent-draft.json, .grant-draft.json, .sow-draft.json, or .ada-draft.json)"}
            </button>
          </section>

          <section className="space-y-3">
            <h3 className="font-label-md text-label-md text-on-surface">Patent drafts</h3>
            {patentDrafts.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                No saved patent drafts yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {patentDrafts.map((record) => (
                  <li
                    key={record.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-low transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-body-md text-body-md font-medium truncate">
                        {record.name}
                      </p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {formatSavedAt(record.savedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLoadPatentDraft(record)}
                      className="px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary font-label-sm text-label-sm hover:bg-secondary/20 shrink-0"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${record.name}`}
                      onClick={() => handleDeletePatentDraft(record.id)}
                      className="p-2 text-error hover:bg-error-container rounded-full shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-label-md text-label-md text-on-surface">Grant drafts</h3>
            {grantDrafts.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                No saved grant drafts yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {grantDrafts.map((record) => (
                  <li
                    key={record.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-low transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-body-md text-body-md font-medium truncate">
                        {record.name}
                      </p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {formatSavedAt(record.savedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLoadGrantDraft(record)}
                      className="px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary font-label-sm text-label-sm hover:bg-secondary/20 shrink-0"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${record.name}`}
                      onClick={() => handleDeleteGrantDraft(record.id)}
                      className="p-2 text-error hover:bg-error-container rounded-full shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-label-md text-label-md text-on-surface">SOW drafts</h3>
            {sowDrafts.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                No saved SOW drafts yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {sowDrafts.map((record) => (
                  <li
                    key={record.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-low transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-body-md text-body-md font-medium truncate">
                        {record.name}
                      </p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {formatSavedAt(record.savedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLoadSowDraft(record)}
                      className="px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary font-label-sm text-label-sm hover:bg-secondary/20 shrink-0"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${record.name}`}
                      onClick={() => handleDeleteSowDraft(record.id)}
                      className="p-2 text-error hover:bg-error-container rounded-full shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-label-md text-label-md text-on-surface">ADA drafts</h3>
            {adaDrafts.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                No saved ADA drafts yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {adaDrafts.map((record) => (
                  <li
                    key={record.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-low transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-body-md text-body-md font-medium truncate">
                        {record.name}
                      </p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {formatSavedAt(record.savedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLoadAdaDraft(record)}
                      className="px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary font-label-sm text-label-sm hover:bg-secondary/20 shrink-0"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${record.name}`}
                      onClick={() => handleDeleteAdaDraft(record.id)}
                      className="p-2 text-error hover:bg-error-container rounded-full shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {hasCurrentWork && (
            <section className="pt-2 border-t border-outline-variant space-y-3">
              {confirmingClear ? (
                <div className="p-4 rounded-lg border border-error/30 bg-error-container/10 space-y-3">
                  <p className="font-body-sm text-body-sm text-on-surface">
                    Start a new draft? Your current in-progress work will be cleared from this
                    browser.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmClear}
                      className="px-4 py-2 rounded-lg bg-error text-on-error font-label-md text-label-md hover:bg-error/90 transition-all active:scale-95"
                    >
                      Yes, clear my work
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingClear(false)}
                      className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-all active:scale-95"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingClear(true)}
                  className="font-label-sm text-label-sm text-error hover:underline"
                >
                  Start a new draft (clear current work)
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
