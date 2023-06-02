import { useEffect, useCallback } from "react";
import {
  redo,
  undo,
  jump,
  reset,
  UndoableAction,
  Action,
} from "../types/actions";
import { UndoableState } from "../types/state";
import { isRedoShortcut, isUndoShortcut } from "../utils/shortcuts";

export const useUndoRedo = <S, A extends Action>(
  state: UndoableState<S>,
  dispatch: React.Dispatch<UndoableAction<A>>,
  onUndo?: () => void,
  onRedo?: () => void,
  onJump?: () => void,
  onReset?: () => void
): {
  undo: () => void;
  redo: () => void;
  jump: (index: number) => void;
  reset: () => void;
} => {
  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  const handleUndo = useCallback(() => {
    if (canUndo) {
      if (onUndo) {
        onUndo();
      }
      dispatch(undo());
    }
  }, [canUndo, dispatch, onUndo]);
  const handleRedo = useCallback(() => {
    if (canRedo) {
      if (onRedo) {
        onRedo();
      }
      dispatch(redo());
    }
  }, [canRedo, dispatch, onRedo]);
  const handleJump = useCallback(
    (index: number) => {
      if (onJump) {
        onJump();
      }
      dispatch(jump(index));
    },
    [dispatch, onJump]
  );
  const handleReset = useCallback(() => {
    if (onReset) {
      onReset();
    }
    dispatch(reset());
  }, [dispatch, onReset]);

  return {
    undo: handleUndo,
    redo: handleRedo,
    jump: handleJump,
    reset: handleReset,
  };
};

export const useUndoRedoAvailability = <S,>(
  state: UndoableState<S>
): {
  canUndo: boolean;
  canRedo: boolean;
} => {
  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  return {
    canUndo,
    canRedo,
  };
};

export const useUndoShortcuts = (onUndo: () => void): void => {
  const onWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return;
    }
    if (isUndoShortcut(event)) {
      event.preventDefault();
      onUndo();
    }
  };
  useEffect(() => {
    window.addEventListener("keydown", onWindowKeyDown);
    return (): void => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  });
};

export const useRedoShortcuts = (onRedo: () => void): void => {
  const onWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return;
    }
    if (isRedoShortcut(event)) {
      event.preventDefault();
      onRedo();
    }
  };
  useEffect(() => {
    window.addEventListener("keydown", onWindowKeyDown);
    return (): void => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  });
};
