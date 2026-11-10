import type { GameState } from "@impower/spark-editor-protocol/src/types";
import { HISTORY_REASONS } from "@impower/spark-engine/src/game/core/constants/HISTORY_REASONS";
import type { DebugSessionState } from "./WorkspaceStore";

export const STEP_TRAVERSALS = ["over", "in", "out"] as const;

export type StepTraversal = (typeof STEP_TRAVERSALS)[number];

export const STEP_SHORTCUTS = {
  over: "stepOver",
  in: "stepInto",
  out: "stepOut",
} as const satisfies Record<StepTraversal, string>;

export const STEP_REASONS = {
  running: "Pause the story to step through it",
  choosing: "Make a choice to step on.",
  ended: "The story is over, so there is nothing to step to.",
  topLevel: HISTORY_REASONS.stepOut,
  behind: HISTORY_REASONS.step,
} as const;

export const SKIP_REASONS = {
  back: HISTORY_REASONS.rollBack,
  forward: HISTORY_REASONS.rollForward,
} as const;

export type SkipDirection = -1 | 1;

export const stepRefusals = (
  game: GameState | undefined,
  session: DebugSessionState,
): Record<StepTraversal, string | undefined> => {
  const all = game?.ended
    ? STEP_REASONS.ended
    : session.history?.behindLatest
      ? STEP_REASONS.behind
      : !game?.paused
        ? STEP_REASONS.running
        : game.choosing
          ? STEP_REASONS.choosing
          : undefined;
  return {
    over: all,
    in: all,
    out: all ?? (session.history?.canStepOut ? undefined : STEP_REASONS.topLevel),
  };
};

export const skipRefusal = (
  game: GameState | undefined,
  session: DebugSessionState,
  direction: SkipDirection,
): string | undefined => {
  if (!game?.running) {
    return undefined;
  }
  const history = session.history;
  return direction < 0
    ? history?.canRollBack
      ? undefined
      : SKIP_REASONS.back
    : history?.canRollForward
      ? undefined
      : SKIP_REASONS.forward;
};
