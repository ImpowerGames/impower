import { describe, expect, it } from "vitest";
import { createDebugGame } from "./dapTestHarness";

// Phase 1 — frame-scoped temps. getTempVariables previously always read the
// CURRENT (top) call-stack element's innermost scope, so inspecting a non-top
// stack frame showed the wrong locals. It now takes an optional (threadId,
// frameId) — frameId being a call-stack index as assigned by getStackTrace —
// and walks every temporaryScope of that frame.
describe("DAP engine debug core — frame-scoped temps", () => {
  // A tunnel pushes a frame and contains display lines (stop anchors), giving a
  // multi-frame stack where each frame owns a distinct local.
  const source = [
    "-> main", //               0
    "scene main", //            1
    "  local mainLoc = 111", // 2
    "  Main here.", //          3
    "  -> sub ->", //           4
    "  done", //                5
    "end", //                   6
    "scene sub", //             7
    "  local subLoc = 222", //  8
    "  Sub here.", //           9
    "  More sub.", //           10
    "  ->->", //                11
    "end", //                   12
  ].join("\n");

  it("returns each frame's own locals, not always the top frame", () => {
    const h = createDebugGame(source);

    // Advance through display stops until the tunnel frame is live alongside the
    // caller frame.
    h.game.start();
    let frameIds: number[] = [];
    for (let i = 0; i < 6; i++) {
      frameIds = h.game.getStackTrace(0).stackFrames.map((f) => f.id);
      if (frameIds.length >= 2) {
        break;
      }
      h.game.continue();
    }
    expect(frameIds.length).toBeGreaterThanOrEqual(2);

    const tempsByFrame = frameIds.map((id) => ({
      id,
      names: h.game.getTempVariables(0, id).map((v) => `${v.name}=${v.value}`),
    }));
    const mainFrame = tempsByFrame.find((f) => f.names.includes("mainLoc=111"));
    const subFrame = tempsByFrame.find((f) => f.names.includes("subLoc=222"));

    expect(mainFrame).toBeDefined();
    expect(subFrame).toBeDefined();
    expect(mainFrame!.id).not.toBe(subFrame!.id);
    // No leakage across frames.
    expect(mainFrame!.names).not.toContain("subLoc=222");
    expect(subFrame!.names).not.toContain("mainLoc=111");

    // Default (no frameId) resolves to the current/top frame.
    const def = h.game.getTempVariables().map((v) => v.name);
    expect(def).toContain("subLoc");
    expect(def).not.toContain("mainLoc");
  });
});
