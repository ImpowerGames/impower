export interface UndoableState<S> {
  past: S[];
  present: S;
  future: S[];
  _latestUnfiltered?: S;
}

export const createUndoableState = <S>(defaultState: S): UndoableState<S> => {
  return {
    past: [],
    present: defaultState,
    future: [],
  };
};

export const isUndoableState = <S>(obj: unknown): obj is UndoableState<S> => {
  if (!obj) {
    return false;
  }
  const undoableState = obj as UndoableState<S>;
  return (
    undoableState.present !== undefined &&
    undoableState.future !== undefined &&
    undoableState.past !== undefined &&
    Array.isArray(undoableState.future) &&
    Array.isArray(undoableState.past)
  );
};
