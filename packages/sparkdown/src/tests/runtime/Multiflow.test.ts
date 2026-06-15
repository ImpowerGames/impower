// Ported from inkjs `src/tests/specs/ink/Multiflow.spec.ts`.
//
// Multiflow lets a story switch between independent flow contexts —
// `Story.SwitchFlow(name)` swaps the active callstack/output/choices for
// a named flow (creating it on first use), and `Story.RemoveFlow(name)`
// disposes one. Each flow keeps its own state and threads, so a host
// game can run a "Conversation A" flow alongside a "Conversation B" flow
// and resume each where it left off. The runtime API is inherited from
// inkjs (`SwitchFlow_Internal`, `RemoveFlow_Internal`,
// `_namedFlowsDict`); no sparkdown-side compile work is needed — these
// tests exercise the existing runtime API against sparkdown-compiled
// fixtures.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile } from "./runtimeTestHarness";

describe("Multiflow (ported from inkjs)", () => {
  test("multi-flow basics (SwitchFlow + ChoosePathString round-trip)", () => {
    // Upstream ink fixture has two unconnected knots `knot1` and `knot2`.
    // The test drives the runtime in two independent flows, picking a
    // different starting path in each, then alternates `Continue` calls
    // — each flow advances its own state independently.
    //
    // Sparkdown rewrite uses `scene` for `=== knot`. Each scene has two
    // narrative lines then `-> END`; the test interleaves `Continue`
    // calls across flows to verify per-flow state isolation.
    const ctx = makeRuntimeStoryFromFile("multiflow", "multi-flow-basics");
    expect(ctx.errorMessages).toEqual([]);

    ctx.story.SwitchFlow("First");
    ctx.story.ChoosePathString("knot1", true, []);
    expect(ctx.story.Continue()).toBe("knot 1 line 1\n");

    ctx.story.SwitchFlow("Second");
    ctx.story.ChoosePathString("knot2", true, []);
    expect(ctx.story.Continue()).toBe("knot 2 line 1\n");

    ctx.story.SwitchFlow("First");
    expect(ctx.story.Continue()).toBe("knot 1 line 2\n");

    ctx.story.SwitchFlow("Second");
    expect(ctx.story.Continue()).toBe("knot 2 line 2\n");
  });

  test("multi-flow save / load with threads (per-flow state survives ToJson round-trip)", () => {
    // Upstream ink fixture sets up:
    //   - A default-flow narrative (`Default line 1` / `Default line 2`).
    //   - Two color-coded entry knots (`red`, `blue`) that each spawn two
    //     parameterized threads (`thread1(name)` / `thread2(name)`).
    //   - Each thread registers a sticky choice that diverts to
    //     `thread1Choice(name)` / `thread2Choice(name)`.
    //
    // The test exercises:
    //   1. Default-flow continues independently.
    //   2. `SwitchFlow("Blue Flow")` + `ChoosePathString("blue")` runs
    //      the blue narrative inside its own flow context.
    //   3. `SwitchFlow("Red Flow")` runs red in another flow context.
    //   4. Switching back to "Blue Flow" preserves blue's `currentText`
    //      and `currentChoices` (per-flow output buffer + choice list).
    //   5. `state.ToJson() / LoadJson()` round-trips the cross-flow
    //      state so threads stay attached after restore.
    //   6. `RemoveFlow("Blue Flow")` disposes the named flow; the next
    //      Continue runs in the default flow.
    //
    // Sparkdown rewrite uses `scene` for each knot and the same `<- name`
    // thread spawn syntax. Choices use the `choose ... + ... end` block
    // form. `-> DONE` and `-> END` work as in ink.
    const ctx = makeRuntimeStoryFromFile(
      "multiflow",
      "multi-flow-save-load-threads",
    );
    expect(ctx.errorMessages).toEqual([]);

    // Default flow: emits "Default line 1" then pauses on a thread (the
    // ones spawned by the color scenes haven't kicked in yet because we
    // haven't diverted there).
    expect(ctx.story.Continue()).toBe("Default line 1\n");

    ctx.story.SwitchFlow("Blue Flow");
    ctx.story.ChoosePathString("blue", true, []);
    expect(ctx.story.Continue()).toBe("Hello I'm blue\n");

    ctx.story.SwitchFlow("Red Flow");
    ctx.story.ChoosePathString("red", true, []);
    expect(ctx.story.Continue()).toBe("Hello I'm red\n");

    ctx.story.SwitchFlow("Blue Flow");
    expect(ctx.story.currentText).toBe("Hello I'm blue\n");
    expect(ctx.story.currentChoices[0]?.text).toBe("Thread 1 blue choice");

    ctx.story.SwitchFlow("Red Flow");
    expect(ctx.story.currentText).toBe("Hello I'm red\n");
    expect(ctx.story.currentChoices[0]?.text).toBe("Thread 1 red choice");

    const saved = ctx.story.state.ToJson() as string;

    // Take Red's thread-1 choice — verify the divert into
    // `thread1Choice(name)` runs with the captured `name="red"`.
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe(
      "Thread 1 red choice\nAfter thread 1 choice (red)\n",
    );

    ctx.story.ResetState();
    ctx.story.state.LoadJson(saved);

    // After re-loading the saved state, picking choice 1 (thread2)
    // should run the thread-2 continuation in red.
    ctx.story.ChooseChoiceIndex(1);
    expect(ctx.story.ContinueMaximally()).toBe(
      "Thread 2 red choice\nAfter thread 2 choice (red)\n",
    );

    // Re-load again — switch to Blue Flow this time, verify blue's
    // thread-1 continuation runs with `name="blue"`.
    ctx.story.state.LoadJson(saved);
    ctx.story.SwitchFlow("Blue Flow");
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe(
      "Thread 1 blue choice\nAfter thread 1 choice (blue)\n",
    );

    // One more load — pick blue's thread-2 instead.
    ctx.story.state.LoadJson(saved);
    ctx.story.SwitchFlow("Blue Flow");
    ctx.story.ChooseChoiceIndex(1);
    expect(ctx.story.ContinueMaximally()).toBe(
      "Thread 2 blue choice\nAfter thread 2 choice (blue)\n",
    );

    // Dispose the blue flow — the next Continue runs in whatever flow
    // is current (the default flow, since RemoveFlow falls back to it).
    ctx.story.RemoveFlow("Blue Flow");
    expect(ctx.story.Continue()).toBe("Default line 2\n");
  });
});
