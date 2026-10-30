import { signal } from "@preact/signals";

export interface UndoableAction {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const MAX_DEPTH = 50;
const undoStack: UndoableAction[] = [];
const redoStack: UndoableAction[] = [];

export const canUndo = signal(false);
export const canRedo = signal(false);
export const nextUndoLabel = signal<string | null>(null);

const sync = () => {
  canUndo.value = undoStack.length > 0;
  canRedo.value = redoStack.length > 0;
  nextUndoLabel.value = undoStack[undoStack.length - 1]?.label ?? null;
};

export function pushUndo(action: UndoableAction) {
  undoStack.push(action);
  if (undoStack.length > MAX_DEPTH) {
    undoStack.shift();
  }
  redoStack.length = 0;
  sync();
}

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

export function clearUndoHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  sync();
}
