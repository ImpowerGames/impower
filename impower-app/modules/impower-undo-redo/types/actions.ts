export const UNDO = "impower/undo-redo/UNDO";
export interface UndoAction {
  type: typeof UNDO;
}
export const undo = (): UndoAction => {
  return { type: UNDO };
};

export const REDO = "impower/undo-redo/REDO";
export interface RedoAction {
  type: typeof REDO;
}
export const redo = (): RedoAction => {
  return { type: REDO };
};

export const JUMP = "impower/undo-redo/JUMP";
export interface JumpAction {
  type: typeof JUMP;
  payload: { index: number };
}
export const jump = (index: number): JumpAction => {
  return { type: JUMP, payload: { index } };
};

export const RESET = "impower/undo-redo/RESET";
export interface ResetAction {
  type: typeof RESET;
}
export const reset = (): ResetAction => {
  return { type: RESET };
};

export type UndoRedoAction = UndoAction | RedoAction | JumpAction | ResetAction;

export interface Action {
  type: string;
}

export type UndoableAction<A extends Action> = UndoRedoAction | A;
