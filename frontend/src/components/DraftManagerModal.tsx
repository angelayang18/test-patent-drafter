import { useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePatentWorkflow } from "../context/PatentWorkflowContext";
import {
  defaultDraftName,
  formatSavedAt,
  getResumePath,
  type SavedDraftRecord,
} from "../utils/draftStorage";

interface DraftManagerModalProps {
  open: boolean;
  onClose: () => void;
}

export function DraftManagerModal({ open, onClose }: DraftManagerModalProps) {
  const navigate = useNavigate();
  const uploadInputId = useId();
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const {
    invention,
    getWorkflowSnapshot,
    getSavedDrafts,
    saveNamedDraft,
    removeSavedDraft,
    exportDraftFile,
    importDraftFile,
    importWorkflow,
    saveToStorage,
    clearWorkflow,
  } = usePatentWorkflow();

  const [draftName, setDraftName] = useState("");
  const [savedDrafts, setSavedDrafts] = useState<SavedDraftRecord[]>(() => getSavedDrafts());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const snapshot = getWorkflowSnapshot();
  const suggestedName = draftName.trim() || defaultDraftName(snapshot);

  const refreshDraftList = () => {
    setSavedDrafts(getSavedDrafts());
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
      setMessage(`Downloaded ${suggestedName}.patent-draft.json`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download draft.");
    }
  };

  const handleLoadSaved = (record: SavedDraftRecord) => {
    setError(null);
    importWorkflow(record.workflow);
    onClose();
    navigate(getResumePath(record.workflow));
  };

  const handleDeleteSaved = (id: string) => {
    removeSavedDraft(id);
    refreshDraftList();
    setMessage("Removed saved draft.");
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const workflow = await importDraftFile(file);
      refreshDraftList();
      setMessage(`Loaded draft from ${file.name}`);
      onClose();
      navigate(getResumePath(workflow));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load draft file.");
    } finally {
      setBusy(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const handleStartFresh = () => {
    if (
      !window.confirm(
        "Start a new draft? Your current in-progress work will be cleared from this browser.",
      )
    ) {
      return;
    }
    clearWorkflow();
    onClose();
    navigate("/");
  };

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
              placeholder={defaultDraftName(snapshot)}
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
              Your current work also auto-saves in this browser as you edit. Download a{" "}
              <code className="text-xs">.patent-draft.json</code> file to move drafts between
              devices or back up your progress.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="font-label-md text-label-md text-on-surface">Upload draft file</h3>
            <input
              ref={uploadInputRef}
              id={uploadInputId}
              type="file"
              accept=".json,.patent-draft.json,application/json"
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
              {busy ? "Loading draft…" : "Choose .patent-draft.json file"}
            </button>
          </section>

          <section className="space-y-3">
            <h3 className="font-label-md text-label-md text-on-surface">
              Saved in this browser
            </h3>
            {savedDrafts.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                No named drafts yet. Save your current work to pick up where you left off.
              </p>
            ) : (
              <ul className="space-y-2">
                {savedDrafts.map((record) => (
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
                      onClick={() => handleLoadSaved(record)}
                      className="px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary font-label-sm text-label-sm hover:bg-secondary/20 shrink-0"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${record.name}`}
                      onClick={() => handleDeleteSaved(record.id)}
                      className="p-2 text-error hover:bg-error-container rounded-full shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {invention && (
            <section className="pt-2 border-t border-outline-variant">
              <button
                type="button"
                onClick={handleStartFresh}
                className="font-label-sm text-label-sm text-error hover:underline"
              >
                Start a new draft (clear current work)
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
