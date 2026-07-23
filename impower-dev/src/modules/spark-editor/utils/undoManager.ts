import { signal } from "@preact/signals";

/**
 * One reversible file operation. `undo` inverts it; `redo` re-applies it. Both
 * are closures so an op can mutate captured state across cycles (e.g. a delete
 * lands in a NEW trash batch each redo, so its `undo` must target the latest).
 */
export interface UndoableAction {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const MAX_DEPTH = 50;
const undoStack: UndoableAction[] = [];
const redoStack: UndoableAction[] = [];

/** Reactive flags for keybinding/menu enablement. */
export const canUndo = signal(false);
export const canRedo = signal(false);
/** Label of the action Ctrl+Z would reverse (for tooltips / the snackbar). */
export const nextUndoLabel = signal<string | null>(null);

const sync = () => {
  canUndo.value = undoStack.length > 0;
  canRedo.value = redoStack.length > 0;
  nextUndoLabel.value = undoStack[undoStack.length - 1]?.label ?? null;
};

/** Record a new reversible action. Clears the redo stack (a new branch). */
export function pushUndo(action: UndoableAction) {
  undoStack.push(action);
  if (undoStack.length > MAX_DEPTH) {
    undoStack.shift();
  }
  redoStack.length = 0;
  sync();
}

// Serialize undo/redo so a rapid Ctrl+Z burst (or snackbar + keypress) can't
// interleave two async inversions over the same files.
let running = false;

export async function undo(): Promise<boolean> {
  if (running) return false;
  const action = undoStack.pop();
  if (!action) return false;
  running = true;
  sync();
  try {
    await action.undo();
    redoStack.push(action);
    return true;
  } catch {
    // Inversion failed — keep the action so a retry is possible.
    undoStack.push(action);
    return false;
  } finally {
    running = false;
    sync();
  }
}

export async function redo(): Promise<boolean> {
  if (running) return false;
  const action = redoStack.pop();
  if (!action) return false;
  running = true;
  sync();
  try {
    await action.redo();
    undoStack.push(action);
    return true;
  } catch {
    redoStack.push(action);
    return false;
  } finally {
    running = false;
    sync();
  }
}

/** Drop all history (e.g. on project switch — undo across projects is unsafe). */
export function clearUndoHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  sync();
}
