// Ported from inkjs `src/tests/specs/ink/Threads.spec.ts`.
//
// Threads (`<- target_name`) spawn a parallel narrative flow whose
// choices merge into the current decision point. The thread runs in
// parallel with the spawning flow; both contribute their available
// choices to the player's menu. A thread terminates at `-> DONE` (its
// own end) or `-> END` (story end). Choices already collected by a
// thread remain available even if the main flow reaches `-> DONE`.
//
// Sparkdown's grammar parses `<- target_name` as a `Thread` node
// (paralleling `->` for diverts); the lowerer delegates to the divert
// builder with `isThread: true`, which emits a `StartThread` control
// command; the inkjs `CallStack.Thread` machinery handles the parallel
// flow.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile } from "./runtimeTestHarness";

describe("Threads (ported from inkjs)", () => {
  test("multi threads merge choices at a single decision point", () => {
    // Hub scene threads in two NPC scenes; the player should see all
    // three choices (one from each thread + one from the hub) in a
    // single merged menu. This is the canonical use case for threads:
    // modular menu composition across authoring units.
    const ctx = makeRuntimeStoryFromFile("threads", "multi-threads");
    expect(ctx.errorMessages).toEqual([]);

    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe("You arrive at the town square.\n");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"What do you sell?"',
      '"Any news?"',
      '"Leave town"',
    ]);
  });

  test("thread reaching DONE terminates without taking down the main flow", () => {
    // The threaded scene emits text and reaches `-> DONE`. The main
    // flow continues past the `<-` point and reaches its own choice.
    // Verifies that DONE in a thread is a thread-local terminator
    // (not a story terminator), and that the main flow's content
    // after the `<-` still renders.
    const ctx = makeRuntimeStoryFromFile("threads", "thread-done");
    expect(ctx.errorMessages).toEqual([]);

    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe(
      "Before threading.\nIn the thread.\nAfter threading.\n",
    );
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"Continue"',
    ]);
  });

  test("thread spawned inside a conditional block", () => {
    // Threads can appear inside `if` blocks. When the condition is
    // true, the thread spawns and contributes its choices; when
    // false, the thread isn't reached and no choices are merged.
    // This fixture sets `has_companion = true` so the companion
    // thread's choice appears alongside the hub's own choice.
    const ctx = makeRuntimeStoryFromFile("threads", "thread-in-logic");
    expect(ctx.errorMessages).toEqual([]);

    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe("At the gates.\n");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"Talk to companion"',
      '"Enter alone"',
    ]);
  });

  test("thread choices survive the main flow reaching DONE", () => {
    // Edge case: the main scene spawns a thread, then immediately
    // diverts to `-> DONE`. The thread's choice should remain
    // available — DONE at the top level marks "no more main flow
    // content", not "kill any pending threads". This was a known
    // bug in early inkjs builds and is now covered by upstream tests.
    const ctx = makeRuntimeStoryFromFile(
      "threads",
      "thread-survives-main-done",
    );
    expect(ctx.errorMessages).toEqual([]);

    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe("");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"Survivor choice"',
    ]);
  });

  // The 5th canonical thread test from upstream — "empty thread
  // error" (compile-time error for `<-` with no target) — is
  // exercised at the grammar level in sparkdown rather than at the
  // runtime level. See `tests/__snapshots__/grammar/flow/` for the
  // parse-tree snapshots that pin this behavior. Not duplicated here.
});
