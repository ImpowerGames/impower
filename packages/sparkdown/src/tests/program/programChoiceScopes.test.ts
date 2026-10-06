// The scopes of a `choose` block on the program engine (#1575,
// docs/engine/binary-program.md, section 4): the program engine scopes a
// block as Luau does, where the current engine's weave differs. A `local`
// is visible from its declaration to the end of the block that holds it: a
// gated branch's scope closes where the branch ends, before the next
// choice's condition, a `do` block's local is gone after its `end`, and a
// `then` clause runs after the block it belongs to, once. The depth of
// scopes at every offset of the chunk is exact, so a position restored or
// landed on inside a choice's entry or body derives it from the block stack
// and the chunk's code.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import {
  expectExactDepth,
  play,
  programStory,
  run,
  silence,
} from "./programScopes";

describe("a gated choice's branch on the program engine", () => {
  // The branch's `local open` is visible in the branch, to the choices it
  // gates and their bodies, and nowhere else: the later choice's condition,
  // its body and the line after the block read the global.
  const GATED = [
    "store open = false",
    "-> main",
    "scene main",
    "  choose",
    "    if true then",
    "      local open = true",
    "      * A {open}",
    "      * B {open}",
    "        In B {open}.",
    "    end",
    "    * if not open [Global]",
    "      In global {open}.",
    "  end",
    "  After {open}.",
    "end",
    "",
  ].join("\n");

  it("closes its scope where the branch ends, so a later condition, a later body and the line after the block read the global", () => {
    const [a, b, global] = [0, 1, 2].map((pick) => run(GATED, [pick]));
    expect(a!.menus).toEqual([["A true", "B true", "Global"]]);
    expect(a!.beats).toEqual(["A true", "After false."]);
    expect(b!.beats).toEqual(["B true", "In B true.", "After false."]);
    expect(global!.beats).toEqual(["In global false.", "After false."]);
  });

  it("drops the branch's local after the block when a choice the branch gated is taken", () => {
    const text = [
      "store open = false",
      "-> main",
      "scene main",
      "  choose",
      "    if true then",
      "      local open = true",
      "      * First",
      "        Inside {open}.",
      "    end",
      "    * Second {open}",
      "  end",
      "  After {open}.",
      "end",
      "",
    ].join("\n");
    expect(run(text, [0])).toEqual({
      beats: ["First", "Inside true.", "After false."],
      menus: [["First", "Second false"]],
    });
    expect(run(text, [1]).beats).toEqual(["Second false", "After false."]);
  });
});

describe("a do block of a choose block's preamble on the program engine", () => {
  it("drops its local at its end, so a choice's condition, text and body and the line after the block read the global", () => {
    const text = [
      "store x = \"global\"",
      "-> main",
      "scene main",
      "  choose",
      "    do",
      "      local x = \"local\"",
      "    end",
      "    * if (x == \"global\") [Pick {x}]",
      "      Body {x}.",
      "  end",
      "  After {x}.",
      "end",
      "",
    ].join("\n");
    expect(run(text)).toEqual({
      beats: ["Body global.", "After global."],
      menus: [["Pick global"]],
    });
  });
});

describe("then clauses of blocks written in a preamble on the program engine", () => {
  // Three blocks, each written in the preamble of the one around it. A
  // clause runs after a choice of its own block is taken (a choice an `if`
  // of the block gates included), once, and then the clause of the block
  // around it; never while the choices are presented.
  const NESTED = (gated: boolean) =>
    [
      "-> main",
      "scene main",
      "  choose",
      "    choose",
      "      choose",
      ...(gated
        ? ["        if true then", "          * Inner", "            Took inner.", "        end"]
        : ["        * Inner", "          Took inner."]),
      "      then",
      "        Inner then.",
      "      end",
      ...(gated ? ["      if true then", "        * Middle", "      end"] : ["      * Middle"]),
      "    then",
      "      Middle then.",
      "    end",
      "    * Outer",
      "  then",
      "    Outer then.",
      "  end",
      "  After.",
      "end",
      "",
    ].join("\n");

  for (const gated of [false, true]) {
    it(`runs each clause after its own block, once, three deep${gated ? ", with the inner choices gated" : ""}`, () => {
      const [inner, middle, outer] = [0, 1, 2].map((pick) => run(NESTED(gated), [pick]));
      expect(inner!.menus).toEqual([["Inner", "Middle", "Outer"]]);
      expect(inner!.beats).toEqual([
        "Inner",
        "Took inner.",
        "Inner then.",
        "Middle then.",
        "Outer then.",
        "After.",
      ]);
      expect(middle!.beats).toEqual(["Middle", "Middle then.", "Outer then.", "After."]);
      expect(outer!.beats).toEqual(["Outer", "Outer then.", "After."]);
    });
  }

  it("runs a clause inside the branch its block is written in, with the branch's locals", () => {
    const text = [
      "store inner = 0",
      "-> main",
      "scene main",
      "  choose",
      "    if true then",
      "      local inner = 3",
      "      choose",
      "        * Inner one",
      "          Inner {inner}.",
      "      then",
      "        Inner then {inner}.",
      "      end",
      "    end",
      "    * Outer {inner}",
      "  then",
      "    Outer then {inner}.",
      "  end",
      "end",
      "",
    ].join("\n");
    expect(run(text, [0])).toEqual({
      beats: ["Inner one", "Inner 3.", "Inner then 3.", "Outer then 0."],
      menus: [["Inner one", "Outer 0"]],
    });
    expect(run(text, [1]).beats).toEqual(["Outer 0", "Outer then 0."]);
  });
});

describe("the depth of scopes inside a choose chunk", () => {
  // A gate that does not hold before a gated choice: on an upper bound, the
  // choice's body would count the scope of the branch that did not run.
  const RESTORED = [
    "store open = false",
    "-> main",
    "scene main",
    "  choose",
    "    if false then",
    "      * Hidden",
    "    end",
    "    if true then",
    "      local open = true",
    "      * Pick",
    "        First {open}.",
    "        Second {open}.",
    "        -> again",
    "        label again",
    "        Third {open}.",
    "    end",
    "  end",
    "  After {open}.",
    "end",
    "",
  ].join("\n");

  it("is exact in a gated choice's entry and body, and an image restored there runs on to the end of the flow as it ran", () => {
    expect(run(RESTORED)).toEqual({
      beats: ["Pick", "First true.", "Second true.", "Third true.", "After false."],
      menus: [["Pick"]],
    });
    silence(() => {
      const story = programStory(RESTORED);
      while (story.canContinue) {
        story.Continue();
        expectExactDepth(story, "before the menu");
      }
      expect(story.currentChoices.map((c) => c.text)).toEqual(["Pick"]);
      story.ChooseChoiceIndex(0);
      expectExactDepth(story, "at the entry");
      expect((story.Continue() ?? "").trim()).toBe("Pick");
      expectExactDepth(story, "in the entry");
      const inEntry = story.capture();
      expect((story.Continue() ?? "").trim()).toBe("First true.");
      expectExactDepth(story, "in the body");
      const inBody = story.capture();
      const ran = play(story);
      expect(ran.beats).toEqual(["Second true.", "Third true.", "After false."]);
      expect(story.restore(inBody)).toBe(true);
      expectExactDepth(story, "restored in the body");
      expect(play(story)).toEqual(ran);
      expect(story.restore(inEntry)).toBe(true);
      expectExactDepth(story, "restored in the entry");
      expect(play(story).beats).toEqual(["First true.", ...ran.beats]);
    });
  });

  // A jump from after the block lands on the `then` clause's label and on a
  // named gated choice's entry, whose depth the landing derives; a `while`
  // loop of the preamble, whose pass scope the engine closes, leaves the
  // count read in order at the depth after it.
  for (const preamble of [[], ["    while false do", "      local unused = 0", "    end"]]) {
    it(`is exact where a jump lands on a named choice's entry and on a then clause's label${preamble.length ? ", after a while loop of the preamble" : ""}`, () => {
      const text = [
        "store open = false",
        "store n = 0",
        "-> main",
        "scene main",
        "  choose",
        ...preamble,
        "    if n > 5 then",
        "      * Hidden",
        "    end",
        "    if true then",
        "      local open = true",
        "      * (picked) Pick",
        "        Picked {n}.",
        "    end",
        "  then (joined)",
        "    Joined {open}.",
        "  end",
        "  After {open}.",
        "  n = n + 1",
        "  if n == 1 then",
        "    -> joined",
        "  end",
        "  if n == 2 then",
        "    -> picked",
        "  end",
        "end",
        "",
      ].join("\n");
      expect(run(text).beats).toEqual([
        "Pick",
        "Picked 0.",
        "Joined false.",
        "After false.",
        "Joined false.",
        "After false.",
        "Pick",
        "Picked 2.",
        "Joined false.",
        "After false.",
      ]);
    });
  }
});
