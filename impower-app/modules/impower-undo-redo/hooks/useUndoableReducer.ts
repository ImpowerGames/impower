import { useReducer, useMemo } from "react";
import { Action, UndoableAction } from "../types/actions";
import { UndoRedoConfig } from "../types/config";
import { createUndoableReducer } from "../types/reducer";
import { createUndoableState, UndoableState } from "../types/state";

export const useUndoableReducer = <S, A extends Action>(
  reducer: (state: S, action: A) => S,
  initialState: S,
  config?: UndoRedoConfig
): [UndoableState<S>, React.Dispatch<UndoableAction<A>>] => {
  const undoableReducer = useMemo(
    () => createUndoableReducer(reducer, initialState, config),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reducer]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const undoableState = useMemo(() => createUndoableState(initialState), []);
  return useReducer(undoableReducer, undoableState);
};
