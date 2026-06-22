import { describe, expect, it } from "vitest";
import { createDebugGame } from "./dapTestHarness";

// Phase 0 baseline: prove the headless debug harness drives a real Game through
// the full compile -> run -> breakpoint -> inspect -> resume loop, and that
// scalar global inspection already works post-luau. This anchors the pipeline
// so the Phase 1 variable-layer fixes (tables/temps/defines/frame-scoping) have
// a green floor to build on.
//
// Observed engine semantics (characterized here, not assumed): each *display*
// line is a stop anchor; logic written between two displays runs when you
// continue() from one stop to the next. Top-level logic lines with no display
// between them collapse onto the following display anchor — a coarse
// breakpoint-granularity limitation to revisit in Phase 1.
describe("DAP engine debug core — breakpoints + scalar globals", () => {
  const source = [
    "store health = 100", // 0: stored global declaration
    "First beat.", //        1: display line (stop before the mutation)
    "& health -= 25", //     2: mutation (runs while resuming to the next stop)
    "Second beat.", //       3: display line (stop after the mutation)
    "{health}", //           4
  ].join("\n");

  it("stops at line breakpoints and reflects scalar mutations across continue()", () => {
    const h = createDebugGame(source);

    const resolved = h.game.setBreakpoints([
      { file: h.uri, line: 1 },
      { file: h.uri, line: 3 },
    ]);
    // Both breakpoints verify and snap onto their display lines.
    expect(resolved.map((b) => b.verified)).toEqual([true, true]);
    expect(resolved.map((b) => b.location?.range.start.line)).toEqual([1, 3]);

    // First stop: initial value, before the line-2 mutation has run.
    h.game.start();
    expect(h.messagesOfMethod("hitBreakpoint").length).toBe(1);
    // The game must PAUSE on the breakpoint (so it halts there instead of
    // auto-advancing past it once a realtime clock is driving playback).
    expect(h.game.paused).toBe(true);
    const before = h.game.getVarVariables().find((v) => v.name === "health");
    expect(before).toBeDefined();
    expect(before?.value).toBe("100");

    // Resume: continue() lifts the pause, the intervening mutation runs, and we
    // stop (and re-pause) at the second breakpoint.
    h.game.continue();
    expect(h.messagesOfMethod("hitBreakpoint").length).toBe(2);
    expect(h.game.paused).toBe(true);
    const after = h.game.getVarVariables().find((v) => v.name === "health");
    expect(after?.value).toBe("75");
  });
});
