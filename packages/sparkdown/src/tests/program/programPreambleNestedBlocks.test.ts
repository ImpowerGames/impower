import { describe, expect, it } from "vitest";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { Op } from "../../program/ProgramInstructions";
import {
  compileScript,
  describeRoot,
  programSession,
  rootChunks,
} from "./programHarness";
import { run, silence } from "./programScopes";

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

  it("is offered with the block's own choices when an if holds the do", () => {
    const text = scene(IF_AROUND_DO);
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
    expect(run(text, [0])).toEqual({
      beats: ["Outer", "Chose outer.", "After."],
      menus: [["Outer"]],
    });
  });

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

  it("ends the body of a gated choice at a do block after it that offers a choice, and offers both", () => {
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
    const menus = [["Gated", "Nested", "Outer"]];
    expect(run(text, [0])).toEqual({ beats: ["Gated", "Chose gated.", "After."], menus });
    expect(run(text, [1])).toEqual({ beats: ["Nested", "Chose nested.", "After."], menus });
    expect(run(text, [2])).toEqual({ beats: ["Outer", "Chose outer.", "After."], menus });
  });

  it("is offered through a do, an if and a do around it", () => {
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
    expect(run(text, [0])).toEqual({
      beats: ["Deep 2", "Chose deep 2.", "After."],
      menus: [["Deep 2", "Outer"]],
    });
    expect(run(text, [1])).toEqual({
      beats: ["Outer", "Chose outer.", "After."],
      menus: [["Deep 2", "Outer"]],
    });
  });

  it("emits the chunks of a cold compile after edits inside the nested do block, its loop and the lines around them", () => {
    const text = scene([
      ...LOOPS["while"]!,
      ...IF_AROUND_DO,
      ...Array.from({ length: 40 }, (_, i) => `    & n${i} = ${i}`),
    ]);
    const s = programSession(text);
    for (const [find, replace] of [
      ["& n20 = 20", "& n20 = 21"],
      ["Chose inner {x}.", "Chose inner {x}, again."],
      ["i = i + 1", "i = i + 1 -- counted"],
      ["& n30 = 30", "& n30 = 31"],
    ] as const) {
      const root = s.edit(find, replace);
      const { program } = silence(() => compileScript(s.text));
      expect(describeRoot(root), find).toEqual(describeRoot(program.chunks!));
      expect(run(s.text, [1]).menus).toEqual([["Inner 1", "Inner 2", "Inner 1", "Outer"]]);
    }
  });

  it("raises every choice from the choose block's chunk, which holds their entries", () => {
    for (const preamble of [IF_AROUND_DO, LOOPS["while"]!, LOOPS["for"]!]) {
      const { program } = silence(() =>
        compileScript(scene(preamble)),
      );
      expect(program.chunks).toBeDefined();
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
