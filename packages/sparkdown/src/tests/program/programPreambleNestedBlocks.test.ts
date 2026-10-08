// A choice written in a block nested inside another block of a `choose`
// block's preamble (#1681, from #705's review of the whole-program fallback):
// an `if` around a `do`, or a loop around a `do`. The language reference
// says a block's preamble offers its choices together with the block's own
// (`docs/runtime/DIVERGENCES.md`, "Weaves use `choose ... then ... end`
// blocks"), and the program engine does so for every nesting of `do`
// blocks, `if` branches and loops in the preamble (#1503): each nested body
// that offers a choice is the `choose` statement's own code, so the chunk
// that raises the choice holds its entry.
import "../../inkjs/engine/Container";
import { afterEach, describe, expect, it } from "vitest";
import { shuffleDraws } from "../../inkjs/engine/Story";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { Op } from "../../program/ProgramInstructions";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, rootChunks, storyRun } from "./programHarness";
import { run, silence } from "./programScopes";

const injectDraws = () => {
  let s = 0x1681;
  shuffleDraws.next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff);
};

afterEach(() => {
  shuffleDraws.next = null;
});

/** A script whose only scene holds a `choose` block with `preamble` before
 *  its last choice, `Outer`, and a line after the block. */
const scene = (preamble: readonly string[]) =>
  [
    "-> main",
    "scene main",
    "  choose",
    ...preamble,
    "    * Outer",
    "      Chose outer.",
    "  end",
    "  After.",
    "end",
    "",
  ].join("\n");

/** What a script shows on each engine when the choices `picks` names are
 *  taken in turn. */
const bothEngines = (text: string, picks: number[]) =>
  silence(() => {
    const { program } = compileScript(text, { programChunks: true });
    expect(program.fallback).toBeUndefined();
    const current = compileScript(text);
    injectDraws();
    current.story.ResetState();
    const expected = storyRun(current.story, picks);
    injectDraws();
    const actual = storyRun(new ProgramStory(program.chunks!), picks);
    return { expected, actual };
  });

describe("a choice in a block nested inside another block of a choose block's preamble", () => {
  const IF_AROUND_DO = [
    "    if true then",
    "      do",
    "        local x = 1",
    "        * Inner {x}",
    "          Chose inner {x}.",
    "      end",
    "    end",
  ];

  it("is offered with the block's own choices when an if holds the do, as on the current engine", () => {
    const text = scene(IF_AROUND_DO);
    for (const picks of [[0], [1]]) {
      const { expected, actual } = bothEngines(text, picks);
      expect(actual, `picks ${picks.join(",")}`).toEqual(expected);
    }
    expect(run(text, [0])).toEqual({
      beats: ["Inner 1", "Chose inner 1.", "After."],
      menus: [["Inner 1", "Outer"]],
    });
    expect(run(text, [1])).toEqual({
      beats: ["Outer", "Chose outer.", "After."],
      menus: [["Inner 1", "Outer"]],
    });
  });

  it("is not offered when the if that holds the do is false", () => {
    const text = scene(IF_AROUND_DO.map((line) => line.replace("if true", "if false")));
    for (const picks of [[0]]) {
      const { expected, actual } = bothEngines(text, picks);
      expect(actual).toEqual(expected);
    }
    expect(run(text, [0])).toEqual({
      beats: ["Outer", "Chose outer.", "After."],
      menus: [["Outer"]],
    });
  });

  // The reference offers every pass's choice together with the block's own,
  // as the program engine does for a choice written in the loop's body
  // itself (#1503). The current engine offers only the first pass's, and
  // after it is taken offers the block's own choices again, which the
  // reference does not describe, so the loops are not compared with it.
  const LOOPS: Record<string, readonly string[]> = {
    while: [
      "    local i = 0",
      "    while i < 2 do",
      "      i = i + 1",
      "      do",
      "        * Inner {i}",
      "          Chose inner {i}.",
      "      end",
      "    end",
    ],
    for: [
      "    for i = 1, 2 do",
      "      do",
      "        local twice = i * 2",
      "        * Inner {twice}",
      "          Chose inner {twice}.",
      "      end",
      "    end",
    ],
  };
  for (const [name, preamble] of Object.entries(LOOPS)) {
    it(`raises the do block's choice on every pass of a ${name} loop that holds it`, () => {
      const text = scene(preamble);
      const first = name === "for" ? "2" : "1";
      const second = name === "for" ? "4" : "2";
      const menus = [[`Inner ${first}`, `Inner ${second}`, "Outer"]];
      expect(run(text, [0])).toEqual({
        beats: [`Inner ${first}`, `Chose inner ${first}.`, "After."],
        menus,
      });
      expect(run(text, [1])).toEqual({
        beats: [`Inner ${second}`, `Chose inner ${second}.`, "After."],
        menus,
      });
      expect(run(text, [2])).toEqual({
        beats: ["Outer", "Chose outer.", "After."],
        menus,
      });
    });
  }

  // A choice's body is the lines after it up to the next choice, and a
  // block that offers one is where the next choice is.
  it("ends the body of a gated choice at a do block after it that offers a choice, and offers both, as on the current engine", () => {
    const text = scene([
      "    if true then",
      "      * Gated",
      "        Chose gated.",
      "      do",
      "        * Nested",
      "          Chose nested.",
      "      end",
      "    end",
    ]);
    for (const picks of [[0], [1], [2]]) {
      const { expected, actual } = bothEngines(text, picks);
      expect(actual, `picks ${picks.join(",")}`).toEqual(expected);
    }
    const menus = [["Gated", "Nested", "Outer"]];
    expect(run(text, [0])).toEqual({ beats: ["Gated", "Chose gated.", "After."], menus });
    expect(run(text, [1])).toEqual({ beats: ["Nested", "Chose nested.", "After."], menus });
    expect(run(text, [2])).toEqual({ beats: ["Outer", "Chose outer.", "After."], menus });
  });

  it("is offered through a do, an if and a do around it, as on the current engine", () => {
    const text = scene([
      "    do",
      "      local x = 2",
      "      if x > 1 then",
      "        do",
      "          * Deep {x}",
      "            Chose deep {x}.",
      "        end",
      "      end",
      "    end",
    ]);
    for (const picks of [[0], [1]]) {
      const { expected, actual } = bothEngines(text, picks);
      expect(actual, `picks ${picks.join(",")}`).toEqual(expected);
    }
    expect(run(text, [0])).toEqual({
      beats: ["Deep 2", "Chose deep 2.", "After."],
      menus: [["Deep 2", "Outer"]],
    });
  });

  it("raises every choice from the choose block's chunk, which holds their entries", () => {
    for (const preamble of [IF_AROUND_DO, LOOPS["while"]!, LOOPS["for"]!]) {
      const { program } = silence(() =>
        compileScript(scene(preamble), { programChunks: true }),
      );
      expect(program.fallback).toBeUndefined();
      const root = program.chunks!;
      const reader = new BinaryProgramReader(root);
      const raising = rootChunks(root).filter((chunk) =>
        [...reader.instructions(chunk)].some((i) => i.op === Op.Choice),
      );
      expect(raising.length).toBe(1);
      const ops = [...reader.instructions(raising[0]!)].map((i) => i.op);
      expect(ops.filter((op) => op === Op.Choice).length).toBe(2);
    }
  });
});
