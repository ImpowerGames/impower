// #1072 — a preview that runs into recursion.
//
// The player's worker displays every preview, and while it runs one it
// compiles nothing and answers nothing else. A preview whose run recurses
// without end must therefore stop quickly, and say why, rather than spend its
// whole step budget: the page waits on that display before it takes any later
// program, so a display that runs for minutes leaves the preview blank for
// the rest of the session.
//
// The first shape is the one the ticket found: a dangling `t.a.` inside a
// function leaves the function open, the story below it compiles into the
// function's body, and a preview of the `Value {f()}` line enters that body,
// whose interpolation calls the function it is in.

import { describe, expect, test } from "vitest";
import { createHarness, MAIN_URI } from "../ui/harness/uiTestHarness";

const runtimeErrors = (messages: any[]) =>
  messages
    .filter((m) => m.method === "game/runtimeError")
    .map((m) => String(m.params.message));

/** Every character the engine wrote to the screen, across all targets. */
const writtenText = (harness: any): string =>
  harness
    .snapshotFiltered("ui/write-text")
    .map((m: any) =>
      (m?.params?.instructions ?? []).map((i: any) => i.text ?? "").join(""),
    )
    .join("");

/** A call depth these recursions reach within three thousand advances, and a
 *  step budget they would otherwise spend. */
const LIMITS = { steps: 5_000, depth: 50 };

type Limits = typeof LIMITS;

/** Lower the game's step budget and call depth, so a run that recurses
 *  without end stops in a moment on whichever it reaches first: the run is
 *  synchronous, and no test timeout can end it early. */
const applyLimits = (game: any, limits: Limits) => {
  game._executionStepLimit = limits.steps;
  game._callDepthLimit = limits.depth;
};

/** Preview `line` (zero-based), as the editor does when the cursor rests on
 *  it, with how many story advances the run took. */
const previewOf = async (source: string, line: number, limits?: Limits) => {
  const h = createHarness(source, line);
  await h.ready;
  h.reset();
  const game = h.game as any;
  if (limits) {
    applyLimits(game, limits);
  }
  const started = performance.now();
  await h.preview(line);
  return {
    ms: performance.now() - started,
    errors: runtimeErrors(h.messages),
    text: writtenText(h),
    advancesUsed: game._executionStepLimit - game._executionStepsRemaining,
  };
};

/** The ticket's script as the editor held it after the `.` was typed. It
 *  recurses only because that parse leaves `f` open and compiles the `BOB:`
 *  line into it (#1079); once the parse keeps `f` closed, the cases that use
 *  it fail on their "stack overflow" assertions and need a script that still
 *  recurses in the same way. */
const DANGLING_ACCESS = [
  "$:",
  "  A QUIET ROOM",
  "",
  "function f()",
  "  local t = { a = { b = 7 } }",
  "  local y = t.a.",
  "  return y",
  "end",
  "",
  "BOB:",
  "  Value {f()}.",
  "",
].join("\n");

/** A function that calls itself unconditionally, from a dialogue line. */
const SELF_CALL = [
  "function f()",
  "  return f()",
  "end",
  "",
  "BOB:",
  "  Value {f()}.",
  "",
].join("\n");

describe("a preview that recurses without end (#1072)", () => {
  test("stops on a stack overflow when a dangling access leaves the function open", async () => {
    const result = await previewOf(DANGLING_ACCESS, 10, LIMITS);
    expect(result.errors.join("\n")).toContain("stack overflow");
    expect(result.advancesUsed).toBeLessThan(LIMITS.steps);
  }, 120_000);

  test("stops on a stack overflow when a function calls itself unconditionally", async () => {
    const result = await previewOf(SELF_CALL, 5, LIMITS);
    expect(result.errors.join("\n")).toContain("stack overflow");
    expect(result.advancesUsed).toBeLessThan(LIMITS.steps);
  }, 120_000);

  test("reaches the default call depth long before the default step budget", async () => {
    // Measured on the ticket's shape, whose calls each display a line, so
    // the headroom holds for recursion heavier than a bare call.
    const measured = await previewOf(DANGLING_ACCESS, 10, LIMITS);
    expect(measured.errors.join("\n")).toContain("stack overflow");
    const perCall = measured.advancesUsed / LIMITS.depth;
    expect(perCall).toBeGreaterThan(1);
    const h = createHarness("Hello.\n", 0);
    await h.ready;
    const game = h.game as any;
    expect(perCall * game._callDepthLimit).toBeLessThan(
      game._executionStepLimit / 4,
    );
  }, 120_000);
});

describe("PLAY that recurses without end (#1072)", () => {
  // The stop is a runaway, as the step ceiling's is: the story neither
  // finishes nor shows anything after it, so the error is the one thing the
  // player reports.
  test("stops on a stack overflow and does not report the story finished", async () => {
    const h = createHarness(SELF_CALL, 0);
    await h.ready;
    h.reset();
    const game = h.game as any;
    applyLimits(game, LIMITS);
    game.setStartFrom({ file: MAIN_URI, line: 0 }, "first");
    game.start();
    expect(runtimeErrors(h.messages).join("\n")).toContain("stack overflow");
    expect(h.messages.map((m) => m.method)).not.toContain("game/finished");
  });
});

describe("a preview through deep recursion that ends (#1072)", () => {
  // A step inside a call reads the call stack only when the story enters a
  // different scene, so a run through recursion costs time in proportion to
  // its depth. The depth is well inside the call limit, and the value shows.
  // The bound is loose: the preview takes about 3 seconds here, and about 80
  // when every step walks the stack.
  test("shows the value of a 4,000-deep recursion in under twenty seconds", async () => {
    const source = [
      "function count(n)",
      "  if n == 0 then",
      "    return 0",
      "  end",
      "  return 1 + count(n - 1)",
      "end",
      "",
      "BOB:",
      "  Value {count(4000)}.",
      "",
    ].join("\n");
    const result = await previewOf(source, 8);
    expect(result.errors).toEqual([]);
    expect(result.text).toContain("Value 4000.");
    expect(result.ms).toBeLessThan(20_000);
  }, 180_000);
});
