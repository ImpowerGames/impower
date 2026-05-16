// Ported from inkjs `src/tests/specs/ink/Knots.spec.ts`.
//
// "Knots" in ink ↔ "scenes" in sparkdown; "stitches" ↔ "branches"; gathers
// (the `- (label)` form) carry over by syntax. Divert syntax (`-> knot`,
// `-> knot.gather`) is shared.

import { describe, expect, test } from "vitest";
import {
  collectDiagnostics,
  makeRuntimeStoryFromFile,
  runToEnd,
} from "./runtimeTestHarness";

describe("Knots (ported from inkjs)", () => {
  test("knot do not gather", () => {
    const ctx = makeRuntimeStoryFromFile("knots", "knot-do-not-gather");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("g\n");
  });

  test("knot stitch gather counts", () => {
    // Upstream ink fixture exercises three visit-count semantics:
    //   - a labeled gather `(loop)` inside a tunnel, re-entered via
    //     `{cond:->loop}` conditional divert
    //   - a knot's self-referencing visit count `{knot_count_test}`
    //     from inside itself
    //   - a stitch's self-referencing visit count `{stitch}` from
    //     inside itself
    //
    // Sparkdown rewrite uses `label loop` + `if cond then -> loop end`
    // for the gather-loop, scene-as-knot self-reference (`{knot_count_test}`
    // resolves to the current scene's visit count), and branch-as-stitch
    // (`-> scene.branch` for the explicit stitch divert path).
    //
    // `countAllVisits: true` forces visit bookkeeping on every container —
    // without it the compiler only tracks containers that are explicitly
    // referenced by `READ_COUNT(...)` or `{name}` interpolation, but
    // self-references inside a knot's own body are tricky for the
    // compile-time scan.
    const ctx = makeRuntimeStoryFromFile(
      "knots",
      "knot-stitch-gather-counts",
      { countAllVisits: true },
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "1 1\n2 2\n3 3\n1 1\n2 1\n3 1\n1 2\n2 2\n3 2\n1 1\n2 1\n3 1\n1 2\n2 2\n3 2\n",
    );
  });

  test("knot thread interaction", () => {
    // A hub scene threads in an `inventory` scene; the inventory's
    // own choices merge into hub's menu. One inventory choice
    // diverts to a third scene (`pack`); picking it should route flow
    // through that divert. Verifies that thread-merged choices retain
    // their full target-routing through subsequent scenes.
    const ctx = makeRuntimeStoryFromFile("knots", "knot-thread-interaction");
    expect(ctx.errorMessages).toEqual([]);

    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe("At the hub.\n");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"Check pack"',
      '"Check map"',
      '"Leave"',
    ]);

    // Pick "Check pack" — routes through inventory's choice into the
    // `pack` scene.
    ctx.story.ChooseChoiceIndex(0);
    let after = "";
    while (ctx.story.canContinue) after += ctx.story.Continue();
    expect(after).toBe('"Check pack" Pack has a torch.\n');
  });

  test("knot thread interaction 2", () => {
    // A scene threads in `middle`, which itself diverts (non-returning)
    // into `inner`. The thread's effective contribution comes from
    // `inner`'s choices, demonstrating that threads can traverse
    // through intermediate scene-to-scene diverts before settling at
    // a choice point.
    const ctx = makeRuntimeStoryFromFile(
      "knots",
      "knot-thread-interaction-2",
    );
    expect(ctx.errorMessages).toEqual([]);

    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe("");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"From inner"',
      '"Leave"',
    ]);

    ctx.story.ChooseChoiceIndex(0);
    let after = "";
    while (ctx.story.canContinue) after += ctx.story.Continue();
    expect(after).toBe('"From inner"');
  });

  test("flow-name collides with a variable name", () => {
    // Ink's stitch is sparkdown's branch — but the underlying check
    // (a flow name shadowing a `VAR`) fires from inkjs's compile pass
    // either way. Test that `store x` + `scene x` emits a duplicate-
    // identifier diagnostic. Inkjs's exact wording differs from
    // upstream ("A var named ... already exists" vs "name has
    // already been used for a var"), so match on the common substring.
    const { errorMessages } = collectDiagnostics(
      `store knot = 0\nscene knot\n  -> DONE\n`,
    );
    expect(
      errorMessages.some((m) => /Duplicate identifier `knot`/.test(m)),
    ).toBe(true);
  });
});

describe.skip("Knots — closed by design (see DIVERGENCES.md)", () => {
  // Ink-specific compile warning about a knot containing global-scope
  // objects that won't survive termination. Sparkdown's scene model
  // doesn't enforce this rule.
  test("knot termination skips global objects (ink-specific warning)", () => {});
});
