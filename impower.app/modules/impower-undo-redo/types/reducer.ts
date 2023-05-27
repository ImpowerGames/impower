import { createUndoableState, UndoableState } from "./state";
import {
  JumpAction,
  UNDO,
  REDO,
  JUMP,
  RESET,
  UndoableAction,
  Action,
} from "./actions";
import { UndoRedoConfig } from "./config";

const getNewHistory = <S>(
  past: S[],
  present: S,
  future: S[]
): UndoableState<S> => {
  return {
    past,
    present,
    future,
    _latestUnfiltered: present,
  };
};

const createHistory = <S>(state: S): UndoableState<S> => {
  return getNewHistory([], state, []);
};

const insert = <S>(
  history: UndoableState<S>,
  state: S,
  limit: number
): UndoableState<S> => {
  const lengthWithoutFuture = history.past.length + 1;

  const { past, _latestUnfiltered } = history;
  const isHistoryOverflow = limit && limit <= lengthWithoutFuture;

  const pastSliced = past.slice(isHistoryOverflow ? 1 : 0);
  const newPast =
    _latestUnfiltered != null ? [...pastSliced, _latestUnfiltered] : pastSliced;

  return getNewHistory(newPast, state, []);
};

const jumpToFuture = <S>(
  history: UndoableState<S>,
  index: number
): UndoableState<S> => {
  if (index < 0 || index >= history.future.length) return history;

  const { past, future, _latestUnfiltered } = history;

  const newPast = [...past, _latestUnfiltered, ...future.slice(0, index)];
  const newPresent = future[index];
  const newFuture = future.slice(index + 1);

  return getNewHistory(newPast, newPresent, newFuture);
};

const jumpToPast = <S>(
  history: UndoableState<S>,
  index: number
): UndoableState<S> => {
  if (index < 0 || index >= history.past.length) return history;

  const { past, future, _latestUnfiltered } = history;

  const newPast = past.slice(0, index);
  const newFuture = [...past.slice(index + 1), _latestUnfiltered, ...future];
  const newPresent = past[index];

  return getNewHistory(newPast, newPresent, newFuture);
};

// jump: jump n steps in the past or forward
const jump = <S>(
  history: UndoableState<S>,
  index: number
): UndoableState<S> => {
  if (index > 0) return jumpToFuture(history, index - 1);
  if (index < 0) return jumpToPast(history, history.past.length + index);
  return history;
};

export const createUndoableReducer = <S, A extends Action>(
  reducer: (state: S, action: A) => S,
  initialState: S,
  config?: UndoRedoConfig
) => {
  return (
    state: UndoableState<S>,
    action: UndoableAction<A>
  ): UndoableState<S> => {
    const history: UndoableState<S> =
      state || createUndoableState(initialState);
    switch (action.type) {
      case undefined: {
        return history;
      }
      case UNDO: {
        return jump(history, -1);
      }
      case REDO: {
        return jump(history, 1);
      }
      case JUMP: {
        return jump(history, (action as JumpAction).payload.index);
      }
      case RESET: {
        return createHistory(history.present);
      }
      default: {
        const res = reducer(history.present, action as A);

        if (history._latestUnfiltered === res) {
          return history;
        }

        const filtered =
          config.undoableActionTypes &&
          !config.undoableActionTypes.includes(action.type);

        const newHistory = filtered
          ? getNewHistory(history.past, res, history.future)
          : insert(history, res, config.limit);

        return newHistory;
      }
    }
  };
};
