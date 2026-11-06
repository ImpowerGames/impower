import type { DebugSessionState } from "../../workspace/WorkspaceStore";

export type StepTraversal = "over" | "in" | "out";

export const STEP_REASONS = {
  running: "Pause the story to step through it",
  choosing: "Make a choice to step on.",
  topLevel: "Nothing is calling, so there is nothing to step out of.",
} as const;

const callDepth = (session: DebugSessionState) =>
  session.stackTrace?.totalFrames ?? session.stackTrace?.stackFrames.length ?? 0;

export const stepRefusals = (
  paused: boolean,
  session: DebugSessionState,
): Record<StepTraversal, string | undefined> => {
  const all = !paused
    ? STEP_REASONS.running
    : session.choosing
      ? STEP_REASONS.choosing
      : undefined;
  return {
    over: all,
    in: all,
    out: all ?? (callDepth(session) > 1 ? undefined : STEP_REASONS.topLevel),
  };
};
