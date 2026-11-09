import type { DebugSessionState } from "../../workspace/WorkspaceStore";

export type StepTraversal = "over" | "in" | "out";

export const STEP_REASONS = {
  running: "Pause the story to step through it",
  choosing: "Make a choice to step on.",
  ended: "The story is over, so there is nothing to step to.",
  topLevel: "Nothing is calling, so there is nothing to step out of.",
} as const;

const callDepth = (session: DebugSessionState) =>
  session.stackTrace?.totalFrames ?? session.stackTrace?.stackFrames.length ?? 0;

export const stepRefusals = (
  { ended, paused, choosing }: { ended: boolean; paused: boolean; choosing: boolean },
  session: DebugSessionState,
): Record<StepTraversal, string | undefined> => {
  const all = ended
    ? STEP_REASONS.ended
    : !paused
      ? STEP_REASONS.running
      : choosing
        ? STEP_REASONS.choosing
        : undefined;
  return {
    over: all,
    in: all,
    out: all ?? (callDepth(session) > 1 ? undefined : STEP_REASONS.topLevel),
  };
};
