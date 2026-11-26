import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromFile,
  runToEnd,
  visitCountOf,
} from "./runtimeTestHarness";

describe("Builtins (ported from inkjs)", () => {
  test("count.turns() returns the current turn count", () => {
    const ctx = makeRuntimeStoryFromFile("builtins", "count-turns");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("0\n");
  });

  test("math.floor and math.ceil", () => {
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "floor-ceiling-and-casts",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("1\n2\n2\n1\n2\n1\n");
  });

  test("read count survives across tunnel callstack", () => {
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "read-count-across-callstack",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "1) Seen first 1 times.\nIn second.\n2) Seen first 1 times.\n",
    );
  });

  test("read count across threads", () => {
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "read-count-across-thread",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("0\nInside aside.\n1\n");
  });

  test("count.visited(-> t) — boolean has-the-reader-been-here shorthand", () => {
    const ctx = makeRuntimeStoryFromFile("builtins", "visited-shorthand");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "false\nInside aside.\ntrue\nSeen it.\nNever been there.\n",
    );
  });

  test("read count dot-separated path", () => {
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "read-count-dot-separated-path",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("hi\nhi\nhi\n3\n");
  });

  test("read count via variable divert target (`store x = -> knot; -> x(arg)`)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "read-count-variable-target",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "Count start - 0 0 0\n1\n2\n3\nCount end - 3 3 3\n",
    );
  });

  test("turns since nested (choice depth-driven TURNS_SINCE)", () => {
    const ctx = makeRuntimeStoryFromFile("builtins", "turns-since-nested");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("-1 = -1\n");
    expect(ctx.story.currentChoices.length).toBe(1);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("stuff\n0 = 0\n");
    expect(ctx.story.currentChoices.length).toBe(1);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("more stuff\n1 = 1\n");
  });

  test("turns since with variable target", () => {
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "turns-since-variable-target",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("0\n0\n");
    expect(ctx.story.currentChoices.length).toBe(1);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("1\n");
  });

  test("turns (choice loop)", () => {
    const ctx = makeRuntimeStoryFromFile("builtins", "turns-choice-loop");
    expect(ctx.errorMessages).toEqual([]);
    for (let i = 0; i < 10; i++) {
      expect(ctx.story.Continue()).toBe(`${i}\n`);
      expect(ctx.story.Continue()).toBe("");
      ctx.story.ChooseChoiceIndex(0);
    }
  });

  test("visit counts when choosing (VisitCountAtPathString)", () => {
    const ctx = makeRuntimeStoryFromFile("builtins", "visit-counts-when-choosing");
    expect(ctx.errorMessages).toEqual([]);

    expect(visitCountOf(ctx.story, "TestKnot")).toBe(0);
    expect(visitCountOf(ctx.story, "TestKnot2")).toBe(0);

    ctx.story.ChoosePathString("TestKnot", true, []);
    expect(visitCountOf(ctx.story, "TestKnot")).toBe(1);
    expect(visitCountOf(ctx.story, "TestKnot2")).toBe(0);

    ctx.story.Continue();
    expect(visitCountOf(ctx.story, "TestKnot")).toBe(1);
    expect(visitCountOf(ctx.story, "TestKnot2")).toBe(0);

    ctx.story.Continue();
    expect(visitCountOf(ctx.story, "TestKnot2")).toBe(0);

    ctx.story.ChooseChoiceIndex(0);
    expect(visitCountOf(ctx.story, "TestKnot")).toBe(1);
    expect(visitCountOf(ctx.story, "TestKnot2")).toBe(0);

    ctx.story.Continue();
    expect(visitCountOf(ctx.story, "TestKnot")).toBe(1);
    expect(visitCountOf(ctx.story, "TestKnot2")).toBe(1);
  });

  test("visit count bug due to nested containers", () => {
    const ctx = makeRuntimeStoryFromFile("builtins", "visit-count-bug-nested-containers");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("1\n");
    expect(ctx.story.Continue()).toBe("");
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("choice\n1\n");
  });
});

describe("Builtins — ported from ink fixture rewrites", () => {
  test("turns since (rewrite of inkjs `turns_since.ink`)", () => {
    const ctx = makeRuntimeStoryFromFile("builtins", "turns-since");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("-1\n0\n");
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("1\n");
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("2\n");
  });
});
