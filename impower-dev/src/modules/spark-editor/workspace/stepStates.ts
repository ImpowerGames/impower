import type { GameState } from "@impower/spark-editor-protocol/src/types";
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
  topLevel: "Nothing is calling, so there is nothing to step out of.",
} as const;

export const stepRefusals = (
  game: GameState | undefined,
  session: DebugSessionState,
): Record<StepTraversal, string | undefined> => {
  const all = game?.ended
    ? STEP_REASONS.ended
    : !game?.paused
      ? STEP_REASONS.running
      : game.choosing
        ? STEP_REASONS.choosing
        : undefined;
  return {
    over: all,
    in: all,
    out: all ?? (session.canStepOut ? undefined : STEP_REASONS.topLevel),
  };
};
