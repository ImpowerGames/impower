import { describe, expect, it } from "vitest";
import { stopNote } from "../../src/modules/spark-editor/components/preview-bar/barState";
import {
  IDLE_DEBUG_SESSION,
  type DebugSessionState,
} from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const stoppedOn = (
  line: number,
  beat: "shown" | "held" | "none" | undefined,
  reason = "breakpoint",
): DebugSessionState => ({
  ...IDLE_DEBUG_SESSION,
  stopped: { reason, threadId: 0, beat },
  stackTrace: {
    stackFrames: [
      {
        id: 0,
        name: "start",
        line: line - 1,
        column: 0,
        source: { path: "file:///local/main.sd" },
      },
    ],
  },
});

describe("the note beside the readout at a stop", () => {
  it.each([
    ["no stop", IDLE_DEBUG_SESSION, null],
    ["a stop on a beat it presented", stoppedOn(16, "shown"), null],
    ["a stop on a media beat waiting for Resume", stoppedOn(16, "held"), null],
    [
      "a stop before a line that has not run",
      stoppedOn(16, "none"),
      "Stopped before line 16. It has not run yet.",
    ],
    [
      "a Step that stopped before a line that has not run",
      stoppedOn(7, "none", "step"),
      "Stopped before line 7. It has not run yet.",
    ],
    ["a stop that does not say what is on screen", stoppedOn(16, undefined), null],
    [
      "a stop whose frames have not arrived",
      { ...stoppedOn(16, "none"), stackTrace: null },
      null,
    ],
  ])("%s", (_name, session, note) => {
    expect(stopNote(session)).toBe(note);
  });
});
