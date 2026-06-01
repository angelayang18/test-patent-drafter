import { useCallback, useReducer, useRef } from "react";

function trimHistory<T>(entries: T[], maxHistory: number): T[] {
  return entries.length > maxHistory ? entries.slice(entries.length - maxHistory) : entries;
}

interface HistoryState<T> {
  history: T[];
  index: number;
}

type HistoryAction<T> =
  | { type: "push"; value: T }
  | { type: "replace"; value: T; coalesce: boolean }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: T };

function createReducer<T>(maxHistory: number) {
  return function reducer(state: HistoryState<T>, action: HistoryAction<T>): HistoryState<T> {
    switch (action.type) {
      case "push": {
        const truncated = state.history.slice(0, state.index + 1);
        const history = trimHistory([...truncated, action.value], maxHistory);
        return { history, index: history.length - 1 };
      }
      case "replace": {
        const atTip = state.index === state.history.length - 1;
        if (action.coalesce && atTip) {
          const history = [...state.history];
          history[state.index] = action.value;
          return { history, index: state.index };
        }
        const truncated = state.history.slice(0, state.index + 1);
        const history = trimHistory([...truncated, action.value], maxHistory);
        return { history, index: history.length - 1 };
      }
      case "undo":
        return { ...state, index: Math.max(0, state.index - 1) };
      case "redo":
        return { ...state, index: Math.min(state.history.length - 1, state.index + 1) };
      case "reset":
        return { history: [action.value], index: 0 };
      default:
        return state;
    }
  };
}

export function useUndoRedo<T>(initial: T, maxHistory = 40) {
  const coalesceRef = useRef(false);
  const reducer = useRef(createReducer<T>(maxHistory)).current;
  const [state, dispatch] = useReducer(reducer, {
    history: [initial],
    index: 0,
  });

  const value = state.history[state.index] ?? initial;

  const push = useCallback((next: T) => {
    coalesceRef.current = false;
    dispatch({ type: "push", value: next });
  }, []);

  const replace = useCallback((next: T) => {
    const coalesce = coalesceRef.current;
    coalesceRef.current = true;
    dispatch({ type: "replace", value: next, coalesce });
  }, []);

  const undo = useCallback(() => {
    coalesceRef.current = false;
    dispatch({ type: "undo" });
  }, []);

  const redo = useCallback(() => {
    coalesceRef.current = false;
    dispatch({ type: "redo" });
  }, []);

  const reset = useCallback((next: T) => {
    coalesceRef.current = false;
    dispatch({ type: "reset", value: next });
  }, []);

  const canUndo = state.index > 0;
  const canRedo = state.index < state.history.length - 1;

  return { value, push, replace, undo, redo, reset, canUndo, canRedo };
};
