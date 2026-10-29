import { describe, expect, test } from "vitest";
import {
  continueShowedSomething,
  displayRouting,
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
  runToEnd,
} from "./runtimeTestHarness";
import type { TestStory } from "../engineUnderTest";

type Routing = { target?: string; character?: string };
function beatsWithRouting(story: TestStory): [string, Routing[]][] {
  const beats: [string, Routing[]][] = [];
  while (story.canContinue) {
    const text = story.Continue() ?? "";
    if (!continueShowedSomething(story)) continue;
    beats.push([text, displayRouting(story)]);
  }
  return beats;
}

describe("Glue (ported from inkjs)", () => {
  test("simple glue across multiple lines", () => {
    const ctx = makeRuntimeStoryFromFile("glue", "simple-glue");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Some content with glue.\n");
  });

  test("trailing glue across multiple lines", () => {
    const ctx = makeRuntimeStoryFromFile("glue", "trailing-glue");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Some content with glue.\n");
  });

  test("multi-line content inside `if cond then ... end` (left-right glue)", () => {
    const ctx = makeRuntimeStoryFromFile("glue", "left-right-glue-matching");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A line.\nAnother line.\n");
  });
});

describe("Glue — ported from ink fixture rewrites", () => {
  test("inline interpolation of function-return string (rewrite of inkjs `implicit_inline_glue.ink`)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "glue",
      "inline-function-return-in-interp",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("I have five eggs.\n");
  });

  test("inline conditional that emits nothing trims trailing space (rewrite of inkjs `implicit_inline_glue_b.ink`)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "glue",
      "inline-conditional-empty-then",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A\nX\n");
  });
});

describe("Glue - across all display statement types", () => {
  const TYPES: { label: string; prefix: string; routing: Routing }[] = [
    { label: "action", prefix: "", routing: { target: "action" } },
    {
      label: "dialogue",
      prefix: "ALICE:",
      routing: { target: "dialogue", character: "ALICE" },
    },
    { label: "heading", prefix: "$:", routing: { target: "heading" } },
    { label: "title", prefix: "^:", routing: { target: "title" } },
    {
      label: "transitional",
      prefix: "%:",
      routing: { target: "transitional" },
    },
    { label: "write", prefix: "@hud:", routing: { target: "hud" } },
  ];
  const JOINED = "first second.\n";
  const ALICE: Routing = { target: "dialogue", character: "ALICE" };

  for (const { label, prefix, routing } of TYPES) {
    const p = prefix ? `${prefix} ` : "";
    const own = label === "action" ? {} : routing;

    test(`trailing \`..\` joins two ${label} lines into one beat`, () => {
      const ctx = makeRuntimeStoryFromSource(`${p}first ..\n${p}.. second.\n`);
      expect(ctx.errorMessages).toEqual([]);
      expect(beatsWithRouting(ctx.story)).toEqual([[JOINED, [routing, own]]]);
    });

    test(`touching \`..\` joins two ${label} lines with no space`, () => {
      const ctx = makeRuntimeStoryFromSource(`${p}first..\n${p}..second.\n`);
      expect(ctx.errorMessages).toEqual([]);
      expect(beatsWithRouting(ctx.story)).toEqual([
        ["firstsecond.\n", [routing, own]],
      ]);
    });

    test(`a \`..\` on one side only leaves two ${label} lines apart`, () => {
      const ctx = makeRuntimeStoryFromSource(`${p}first ..\n${p}second.\n`);
      expect(ctx.errorMessages).toEqual([]);
      expect(beatsWithRouting(ctx.story)).toEqual([
        ["first\n", [routing]],
        ["second.\n", [routing]],
      ]);
    });
  }

  test("a chain of trailing `..` joins three dialogue lines into one beat", () => {
    const ctx = makeRuntimeStoryFromSource(
      "ALICE: a ..\nALICE: .. b ..\nALICE: .. c.\n",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(beatsWithRouting(ctx.story)).toEqual([
      ["a b c.\n", [ALICE, ALICE, ALICE]],
    ]);
  });

  test("trailing `..` joins mid-body lines within a block dialogue", () => {
    const ctx = makeRuntimeStoryFromSource("ALICE:\n  first ..\n  .. second.\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(beatsWithRouting(ctx.story)).toEqual([[JOINED, [ALICE]]]);
  });

  test("touching `..` joins mid-body lines within a block dialogue", () => {
    const ctx = makeRuntimeStoryFromSource("ALICE:\n  first..\n  ..second.\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(beatsWithRouting(ctx.story)).toEqual([
      ["firstsecond.\n", [ALICE]],
    ]);
  });

  test("a non-glued multi-line block dialogue still keeps its line breaks", () => {
    const ctx = makeRuntimeStoryFromSource("ALICE:\n  one.\n  two.\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(beatsWithRouting(ctx.story)).toEqual([["one.\ntwo.\n", [ALICE]]]);
  });
});
