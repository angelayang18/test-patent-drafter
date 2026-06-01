interface UndoRedoToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function UndoRedoToolbar({ canUndo, canRedo, onUndo, onRedo }: UndoRedoToolbarProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={!canUndo}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onUndo}
        title="Undo"
        className="p-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        <span className="material-symbols-outlined text-[20px]">undo</span>
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onRedo}
        title="Redo"
        className="p-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        <span className="material-symbols-outlined text-[20px]">redo</span>
      </button>
    </div>
  );
}
