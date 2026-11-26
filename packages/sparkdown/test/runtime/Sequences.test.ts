import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";

describe("Sequences — inline `{...}` form (expression arms)", () => {
  test("queue plays through arms once, then emits nothing", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-queue");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A\nB\nC\n\n\n");
  });

  test("cycle wraps around indefinitely", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-cycle");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A\nB\nC\nA\nB\nC\nA\n");
  });

  test("chain plays through, then sticks on the last arm", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-chain");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A\nB\nC\nC\nC\n");
  });
});

describe("Sequences — inline-glued form (`..keyword|a|b|c..`)", () => {
  test("inline-glued queue plays once, then emits nothing between the surrounding text", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-glued-queue");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "Before A After.\nBefore B After.\nBefore C After.\nBefore After.\nBefore After.\n",
    );
  });

  test("inline-glued cycle wraps around indefinitely", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-glued-cycle");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "Before A After.\nBefore B After.\nBefore C After.\nBefore A After.\nBefore B After.\nBefore C After.\nBefore A After.\n",
    );
  });

  test("inline-glued chain plays through, then sticks on the last arm", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-glued-chain");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "Before A After.\nBefore B After.\nBefore C After.\nBefore C After.\nBefore C After.\n",
    );
  });

  test("inline-glued shuffle queue emits each arm once in some order", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-glued-shuffle");
    expect(ctx.errorMessages).toEqual([]);
    const output = ctx.story.ContinueMaximally();
    const lines = output.split("\n").filter((line) => line.length > 0);
    const populated = lines.slice(0, 3);
    const arms = populated.map((line) =>
      line.replace(/^Got /, "").replace(/ ?!$/, "").trim(),
    );
    expect([...arms].sort()).toEqual(["A", "B", "C"]);
  });

  test("inline-glued plain shuffle shows one arm per pass, never its source text (#1706)", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-glued-plain-shuffle");
    expect(ctx.errorMessages).toEqual([]);
    const lines = ctx.story
      .ContinueMaximally()
      .split("\n")
      .filter((line) => line.length > 0);
    expect(lines).toHaveLength(5);
    for (const line of lines) {
      expect(line).toMatch(/^Before [ABC] After\.$/);
    }
  });

  test("a glued keyword with no `|` separator stays text instead of opening an alternator (#1706)", () => {
    for (const head of ["shuffle,A,B,C", "queue,A,B"]) {
      const ctx = makeRuntimeStoryFromSource(
        ["scene start", `  Before .. ${head} .. After.`, "  done", "end", ""].join("\n"),
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.Continue()).toBe(`Before .. ${head} .. After.\n`);
    }
  });

  test("plural.category(n) is directly callable as a stdlib function", () => {
    const ctx = makeRuntimeStoryFromFile(
      "sequences",
      "plural-category-direct",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "other\none\nother\nzero\none\ntwo\nfew\nmany\n",
    );
  });

  test("inline-glued plural respects lang.current at runtime — French CLDR rules", () => {
    const ctx = makeRuntimeStoryFromFile(
      "sequences",
      "inline-glued-plural-french",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "Vous avez 1 pomme\nVous avez 2 pommes\nVous avez 3 pommes\n",
    );
  });

  test("inline-glued plural with positional arms (no `key=`) — `|apple|apples`", () => {
    const ctx = makeRuntimeStoryFromFile(
      "sequences",
      "inline-glued-plural-positional",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "You have 1 apple in the basket.\nYou have 2 apples in the basket.\nYou have 3 apples in the basket.\n",
    );
  });

  test("inline-glued plural with single positional arm — always catch-all", () => {
    const ctx = makeRuntimeStoryFromFile(
      "sequences",
      "inline-glued-plural-positional-single",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "You have 1 item\nYou have 2 item\nYou have 3 item\n",
    );
  });

  test("inline-glued plural matches CLDR categories with bare display-text arms", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-glued-plural");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "You have 1 apple in the basket.\nYou have 2 apples in the basket.\nYou have 3 apples in the basket.\n",
    );
  });
});

describe("Sequences — block form (display-text arms)", () => {
  test("block-form queue with bare-word display arms", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "block-display-text");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("apple\nbanana\ncherry\n");
  });

  test("single-line block-form queue (`queue | a | b | c end` on one line)", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "single-line-block-queue");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "apple\nbanana\ncherry\n",
    );
  });

  test("single-line block-form cycle wraps around indefinitely", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "single-line-block-cycle");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "A\nB\nC\nA\nB\nC\nA\n",
    );
  });

  test("single-line block-form plural with named keys", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "single-line-block-plural");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "apple\napples\napples\n",
    );
  });
});

describe("Sequences — empty arms (porting `blanks_in_inline_sequences`)", () => {
  test("chain with empty middle arm: `chain | a | | b end`", () => {
    const ctx = makeRuntimeStoryFromFile(
      "sequences",
      "empty-middle-arm-chain",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "a\nb\nb\nb\n",
    );
  });
});

describe("Sequences — shuffle variants", () => {
  test("shuffle queue plays each arm once in some order, then emits nothing", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-shuffle-queue");
    expect(ctx.errorMessages).toEqual([]);
    const lines = ctx.story
      .ContinueMaximally()
      .split("\n")
      .filter((s) => s.length > 0);
    expect(lines).toHaveLength(3);
    expect([...lines].sort()).toEqual(["A", "B", "C"]);
  });

  test("shuffle cycle wraps with each cycle reshuffled", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-shuffle-cycle");
    expect(ctx.errorMessages).toEqual([]);
    const lines = ctx.story
      .ContinueMaximally()
      .split("\n")
      .filter((s) => s.length > 0);
    expect(lines).toHaveLength(6);
    const counts: Record<string, number> = { A: 0, B: 0, C: 0 };
    for (const line of lines) counts[line] = (counts[line] ?? 0) + 1;
    expect(counts).toEqual({ A: 2, B: 2, C: 2 });
  });

  test("shuffle chain plays each arm once in some order, then sticks on last", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-shuffle-chain");
    expect(ctx.errorMessages).toEqual([]);
    const lines = ctx.story
      .ContinueMaximally()
      .split("\n")
      .filter((s) => s.length > 0);
    expect(lines).toHaveLength(5);
    expect([lines[0], lines[1], lines[2]].sort()).toEqual(["A", "B", "C"]);
    expect(lines[3]).toBe(lines[2]);
    expect(lines[4]).toBe(lines[2]);
  });
});
