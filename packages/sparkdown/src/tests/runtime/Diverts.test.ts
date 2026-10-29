import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  collectDiagnostics,
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
  runToEnd,
} from "./runtimeTestHarness";

describe("Diverts (ported from inkjs)", () => {
  test("same-line divert is inline", () => {
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "same-line-divert-is-inline",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe(
      "We hurried home to Savile Row as fast as we could.\n",
    );
  });

  test("DONE stops flow", () => {
    const ctx = makeRuntimeStoryFromFile("diverts", "done-stops-flow");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("");
  });

  test("divert not found surfaces as a compile-time error", () => {
    const { errorMessages } = collectDiagnostics(
      `-> main\nscene main\n  -> nowhere\n`,
    );
    expect(errorMessages.some((m) => m.includes("not found"))).toBe(true);
  });

  test("empty divert outside a choice emits a warning", () => {
    const { warningMessages } = collectDiagnostics(
      `-> main\nscene main\n  text\n  ->\n  more\n`,
    );
    expect(warningMessages.some((m) => /Empty diverts/.test(m))).toBe(true);
  });

  test("basic tunnel (`-> f ->` call + `->->` return)", () => {
    const ctx = makeRuntimeStoryFromFile("diverts", "basic-tunnel");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Hello world\n");
  });

  test("complex tunnels (chained parameterized tunnel calls)", () => {
    const ctx = makeRuntimeStoryFromFile("diverts", "complex-tunnels");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "one (1)\none and a half (1.5)\ntwo (2)\nthree (3)\n",
    );
  });

  test("path to self (tunnel + divert loops back to same label)", () => {
    const ctx = makeRuntimeStoryFromFile("diverts", "path-to-self");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    ctx.story.ChooseChoiceIndex(0);
    ctx.story.ContinueMaximally();
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.canContinue).toBe(true);
  });

  test("tunnel onwards after tunnel (`-> X ->->` chained pop)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "tunnel-onwards-after-tunnel",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "Hello...\n...world.\nThe End.\n",
    );
  });
  test("tunnel onwards divert after with arg (`->-> b(5 + 3)`)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "tunnel-onwards-divert-after-with-arg",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("8\n");
  });

  test("tunnel onwards divert override (`->-> B` jumps to B, not caller)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "tunnel-onwards-divert-override",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("This is A\nNow in B.\n");
  });
  test("tunnel onwards with param default choice (`* ->-> elsewhere(8)`)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "tunnel-onwards-with-param-default-choice",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("8\n");
  });

  test("tunnel vs thread behaviour", () => {
    const ctx = makeRuntimeStoryFromFile("diverts", "tunnel-vs-thread");
    expect(ctx.errorMessages).toEqual([]);
    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe(
      "Start.\nIn tunnel.\nAfter tunnel.\nIn thread.\nAfter thread.\n",
    );
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(['"End"']);
  });

  test("compare divert targets with `==` (`-> place` as a first-class value)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "compare-divert-targets",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "different knot\nsame knot\nsame knot\ndifferent knot\nsame knot\nsame knot\n",
    );
  });

  test("divert targets with parameters (`-> place(5)`)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "divert-targets-with-parameters",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("5\n");
  });

  test("a dotted target takes its arguments as a relative one does (#1642)", () => {
    const shown =
      "Inner 1.\nVisit 2 t.\nAside 3.\nSecond 4 b.\nLeave 4.\nLast 5.\n";
    const dotted = makeRuntimeStoryFromFile(
      "diverts",
      "dotted-divert-targets-with-arguments",
    );
    const relative = makeRuntimeStoryFromSource(
      readFileSync(
        join(__dirname, "fixtures", "diverts", "dotted-divert-targets-with-arguments.sd"),
        "utf8",
      ).replace(/(->->|->|<-) outer\.(?!inner\b)/g, "$1 "),
    );
    const play = (ctx: typeof dotted) => ({
      shown: ctx.story.ContinueMaximally(),
      errors: ctx.errorMessages,
      warnings: ctx.warningMessages,
    });
    const expected = { shown, errors: [], warnings: [] };
    expect(play(relative)).toEqual(expected);
    expect(play(dotted)).toEqual(expected);
  });

});

describe("Diverts — multi-target tunnels", () => {
  test("`-> A -> B -> C` (last target is plain divert)", () => {
    const ctx = makeRuntimeStoryFromFile("diverts", "multi-target-tunnel");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "In first.\nIn second.\nIn third.\n",
    );
  });

  test("`-> A -> B -> C ->` (trailing arrow makes last target a tunnel too)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "multi-target-tunnel-chain",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "In first.\nIn second.\nIn third.\nBack at start.\n",
    );
  });
});

describe("Diverts — ported from ink fixture rewrites", () => {
  test("divert in conditional (rewrite of inkjs `divert_in_conditional.ink`)", () => {
    const ctx = makeRuntimeStoryFromFile("diverts", "divert-in-conditional");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("");
  });

  test("tunnel-onwards to a divert-target stored in a function parameter", () => {
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "tunnel-onwards-variable-target",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toMatch(
      "This is outer\nThis is the_esc\n",
    );
  });

  test("divert to weave points (cross-stitch label lookup + alternator-arm divert)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "divert-to-weave-points",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "gather\ntest\nchoice content\ngather\nsecond time round\n",
    );
  });
});
