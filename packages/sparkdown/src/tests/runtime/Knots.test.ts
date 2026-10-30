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
    const ctx = makeRuntimeStoryFromFile("knots", "knot-stitch-gather-counts");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "1 1\n2 2\n3 3\n1 1\n2 1\n3 1\n1 2\n2 2\n3 2\n1 1\n2 1\n3 1\n1 2\n2 2\n3 2\n",
    );
  });

  test("knot thread interaction", () => {
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

    ctx.story.ChooseChoiceIndex(0);
    let after = "";
    while (ctx.story.canContinue) after += ctx.story.Continue();
    expect(after).toBe('"Check pack" Pack has a torch.\n');
  });

  test("knot thread interaction 2", () => {
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
    const { errorMessages } = collectDiagnostics(
      `store knot = 0\nscene knot\n  -> DONE\n`,
    );
    expect(
      errorMessages.some((m) => /Duplicate identifier `knot`/.test(m)),
    ).toBe(true);
  });
});

describe.skip("Knots — closed by design (see docs/runtime/DIVERGENCES.md)", () => {
  test("knot termination skips global objects (ink-specific warning)", () => {});
});
