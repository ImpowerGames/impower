// A choice inside a `do` block or a loop of a `choose` block's preamble on
// the program engine (#1503, docs/engine/binary-program.md, section 4). The
// body of such a block is the `choose` statement's own code, as a gated `if`
// branch's is, so the chunk that raises the choice holds its entry: a choice
// is never raised from a body's own chunk. A loop runs every pass, raising
// a choice on each, and a `break` or `continue` of it is a jump of the
// chunk. The block scopes as Luau does (#1575): a `do` block's local is gone
// after its `end`, a loop's pass reads its own variables, and a statement
// after the block's `end` is the preamble's, run before the choices are
// presented. Where the current engine's weave nests what follows a choice in
// the choice (#1588), it is wrong, and the differential run lists those
// fixtures as intended differences.
import "../../inkjs/engine/Container";
import { afterEach, describe, expect, it } from "vitest";
import { shuffleDraws } from "../../inkjs/engine/Story";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { Op } from "../../program/ProgramInstructions";
import { ProgramStory } from "../../program/ProgramStory";
import { blockScopes } from "../../program/StatementChunk";
import {
  compileScript,
  describeRoot,
  rootChunks,
  MAIN_URI,
  programCompiler,
  storyRun,
} from "./programHarness";

const injectDraws = () => {
  let s = 0x1503;
  shuffleDraws.next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff);
};

afterEach(() => {
  shuffleDraws.next = null;
});

const silence = <T>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

/** What a script shows on each engine when the choices `picks` names are
 *  taken in turn (the first one at every menu past them). */
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

const programStory = (text: string) =>
  silence(() => {
    const { program } = compileScript(text, { programChunks: true });
    expect(program.fallback).toBeUndefined();
    return new ProgramStory(program.chunks!);
  });

/** The depth of scopes the position's frame has by the block stack and the
 *  chunk's code (section 1). */
const derivedDepth = (story: ProgramStory): number | null => {
  const state = story.state;
  const position = state.position;
  if (!position) {
    return null;
  }
  let depth = 1;
  for (const block of state.blockStack) {
    depth += blockScopes(block.sequence.arrays.chunks[block.entry]!, block.block);
  }
  const chunk = position.sequence.arrays.chunks[position.entry];
  if (chunk) {
    for (let offset = 0; offset < position.offset; offset += 2) {
      const op = BinaryProgramReader.instructionAt(chunk, offset).op;
      depth += op === Op.BeginScope ? 1 : op === Op.EndScope ? -1 : 0;
    }
  }
  return depth;
};

/** Asserts that the frame holds exactly the scopes its position derives. */
const expectExactDepth = (story: ProgramStory, where: string) => {
  const derived = derivedDepth(story);
  if (derived !== null && story.state.callstackDepth === 1) {
    expect(story.state.frame!.temporaryScopes.length, where).toBe(derived);
  }
};

/** The beats a story shows, taking the choices `picks` names in turn (the
 *  first at every menu past them), and the menus it raised, with the depth
 *  of scopes checked after every step. */
const play = (story: ProgramStory, picks: number[] = []) => {
  const beats: string[] = [];
  const menus: string[][] = [];
  for (;;) {
    while (story.canContinue) {
      const text = (story.Continue() ?? "").trim();
      if (text) {
        beats.push(text);
      }
      expectExactDepth(story, `after ${JSON.stringify(text)}`);
    }
    const choices = story.currentChoices;
    if (choices.length === 0) {
      return { beats, menus };
    }
    menus.push(choices.map((choice) => choice.text));
    story.ChooseChoiceIndex(picks[menus.length - 1] ?? 0);
    expectExactDepth(story, "after a choice is taken");
  }
};

const run = (text: string, picks: number[] = []) =>
  silence(() => play(programStory(text), picks));

/** A script whose only scene holds a `choose` block with `preamble` before
 *  its last choice, `Outer`, and `after` after the block. */
const scene = (
  preamble: readonly string[],
  after: readonly string[] = ["  After."],
) =>
  [
    "-> main",
    "scene main",
    "  choose",
    ...preamble,
    "    * Outer",
    "      Chose outer.",
    "  end",
    ...after,
    "end",
    "",
  ].join("\n");

describe("a do block of a choose block's preamble that offers choices", () => {
  // The two `do` preambles of the ticket, which the current engine runs as
  // Luau does: each choice the block offers is compared.
  const AGREEING: Record<string, readonly string[]> = {
    "a do holding a choose": [
      "    do",
      "      choose",
      "        * Inner",
      "          Chose inner.",
      "      end",
      "    end",
    ],
    "a do holding a local and a choice": [
      "    do",
      "      local x = 1",
      "      * Inner {x}",
      "        Chose inner {x}.",
      "    end",
    ],
    "a do holding a do with a gated choice": [
      "    do",
      "      local x = 1",
      "      do",
      "        if x == 1 then",
      "          * Inner {x}",
      "            Chose inner {x}.",
      "        end",
      "      end",
      "    end",
    ],
  };
  for (const [name, preamble] of Object.entries(AGREEING)) {
    it(`runs ${name} from chunks as the current engine does`, () => {
      const text = scene(preamble);
      for (const picks of [[0], [1]]) {
        const { expected, actual } = bothEngines(text, picks);
        expect(actual, `picks ${picks.join(",")}`).toEqual(expected);
      }
      expect(run(text, [0]).beats[0]).toMatch(/^Inner/);
    });
  }

  it("raises the choice from the choose block's chunk, which holds its entry and no block for the do or the loop", () => {
    for (const preamble of [
      AGREEING["a do holding a local and a choice"]!,
      [
        "    for i = 1, 2 do",
        "      local twice = i * 2",
        "      * Inner {twice}",
        "    end",
      ],
    ]) {
      const { program } = silence(() =>
        compileScript(scene(preamble), { programChunks: true }),
      );
      const root = program.chunks!;
      const reader = new BinaryProgramReader(root);
      // One chunk raises both choices, and the body's local is set in it.
      const raising = rootChunks(root).filter((chunk) =>
        [...reader.instructions(chunk)].some((i) => i.op === Op.Choice),
      );
      expect(raising.length).toBe(1);
      const ops = [...reader.instructions(raising[0]!)].map((i) => i.op);
      expect(ops.filter((op) => op === Op.Choice).length).toBe(2);
      expect(ops.filter((op) => op === Op.SetVar).length).toBeGreaterThan(0);
      expect(ops).not.toContain(Op.Leave);
    }
  });

  // A label between two choices the body offers makes the current engine
  // raise the later only once the earlier is taken, as between two choices
  // an `if` gates: it is named.
  it("names a label between two choices of the do block's body", () => {
    const text = scene([
      "    do",
      "      * First",
      "      label between",
      "      * Second",
      "    end",
    ]);
    const { program } = silence(() => compileScript(text, { programChunks: true }));
    expect(program.chunks).toBeUndefined();
    expect(program.fallback?.construct).toBe("a label between choices an if gates");
  });

  // A statement after the `do` block's `end` is the preamble's: it runs
  // before the choices are presented, and the block's local is gone there.
  // The current engine's weave nests it in the block's choice (#1588).
  it("runs a statement after the do block's end before the choices, without the block's local", () => {
    const text = scene([
      "    do",
      "      local x = 1",
      "      * Inner {x}",
      "        Chose inner {x}.",
      "    end",
      "    Pre {x}.",
    ]);
    expect(run(text, [0])).toEqual({
      beats: ["Pre nil.", "Inner 1", "Chose inner 1.", "After."],
      menus: [["Inner 1", "Outer"]],
    });
    expect(run(text, [1])).toEqual({
      beats: ["Pre nil.", "Outer", "Chose outer.", "After."],
      menus: [["Inner 1", "Outer"]],
    });
  });

  // The first open question of the ticket: the outer `do`'s local is gone
  // after its `end`, on the program engine, as in Luau (#1575, #1588).
  it("drops a do block's local at its end when a nested do's gated choice is taken", () => {
    const text = [
      "store open = false",
      "-> main",
      "scene main",
      "  choose",
      "    do",
      "      local open = true",
      "      do",
      "        if open then",
      "          * Inner {open}",
      "        end",
      "      end",
      "    end",
      "    * Outer {open}",
      "  end",
      "  After {open}.",
      "end",
      "",
    ].join("\n");
    expect(run(text, [0])).toEqual({
      beats: ["Inner true", "After false."],
      menus: [["Inner true", "Outer false"]],
    });
  });

  // The second open question: a label inside the body is reachable like any
  // other, and a single choice whose body jumps to a label after the block
  // runs on there.
  it("reaches a label inside the do block's body, and a jump from the choice's body", () => {
    const labelled = scene(
      [
        "    do",
        "      label again",
        "      * Inner {again}",
        "        Chose inner.",
        "    end",
      ],
      ["  if again < 2 then", "    -> again", "  end", "  After {again}."],
    );
    expect(run(labelled, [0, 0])).toEqual({
      beats: ["Inner 1", "Chose inner.", "Outer", "Chose outer.", "After 2."],
      menus: [["Inner 1", "Outer"], ["Outer"]],
    });
    const single = [
      "-> main",
      "scene main",
      "  choose",
      "    do",
      "      * Inner",
      "        -> again",
      "    end",
      "  end",
      "  label again",
      "  Again.",
      "end",
      "",
    ].join("\n");
    expect(run(single)).toEqual({
      beats: ["Inner", "Again."],
      menus: [["Inner"]],
    });
  });
});

describe("a loop of a choose block's preamble that offers choices", () => {
  // Each loop runs every pass and raises a choice on each, which reads the
  // pass's variables; taking one runs its body and continues at the block's
  // end. The current engine's weave nests the rest of the pass in the first
  // choice, or fails at runtime (`repeat`, `for ... in`), so the loops are
  // intended differences of the differential run.
  const LOOPS: Record<string, readonly string[]> = {
    while: [
      "    local i = 0",
      "    while i < 2 do",
      "      i = i + 1",
      "      * Inner {i}",
      "        Chose inner {i}.",
      "    end",
    ],
    for: [
      "    for i = 1, 2 do",
      "      * Inner {i}",
      "        Chose inner {i}.",
      "    end",
    ],
    repeat: [
      "    local i = 0",
      "    repeat",
      "      i = i + 1",
      "      * Inner {i}",
      "        Chose inner {i}.",
      "    until i >= 2",
    ],
    "for ... in": [
      '    for _, i in ipairs({"1", "2"}) do',
      "      * Inner {i}",
      "        Chose inner {i}.",
      "    end",
    ],
  };
  for (const [name, preamble] of Object.entries(LOOPS)) {
    it(`raises a choice on every pass of a ${name} loop, and a taken one continues at the block's end`, () => {
      const text = scene(preamble);
      const menus = [["Inner 1", "Inner 2", "Outer"]];
      expect(run(text, [0])).toEqual({
        beats: ["Inner 1", "Chose inner 1.", "After."],
        menus,
      });
      expect(run(text, [1])).toEqual({
        beats: ["Inner 2", "Chose inner 2.", "After."],
        menus,
      });
      expect(run(text, [2])).toEqual({
        beats: ["Outer", "Chose outer.", "After."],
        menus,
      });
    });
  }

  it("makes the lines after a choice in the pass its body, and keeps the pass's variable in it", () => {
    const text = scene([
      "    local i = 0",
      "    while i < 2 do",
      "      i = i + 1",
      "      local twice = i * 2",
      "      * Inner {i}",
      "        Chose inner {i}.",
      "        Twice {twice}.",
      "    end",
      "    After loop {i}.",
    ]);
    expect(run(text, [1])).toEqual({
      beats: ["After loop 2.", "Inner 2", "Chose inner 2.", "Twice 4.", "After."],
      menus: [["Inner 1", "Inner 2", "Outer"]],
    });
  });

  it("leaves a pass by a break or a continue written in an if of the loop's body", () => {
    const broken = scene([
      "    local i = 0",
      "    while true do",
      "      i = i + 1",
      "      if i > 2 then",
      "        break",
      "      end",
      "      * Inner {i}",
      "    end",
    ]);
    expect(run(broken, [1])).toEqual({
      beats: ["Inner 2", "After."],
      menus: [["Inner 1", "Inner 2", "Outer"]],
    });
    const skipped = scene([
      "    for i = 1, 4 do",
      "      do",
      "        local skip = i % 2 == 0",
      "        if skip then",
      "          continue",
      "        end",
      "      end",
      "      * Inner {i}",
      "    end",
    ]);
    expect(run(skipped, [1])).toEqual({
      beats: ["Inner 3", "After."],
      menus: [["Inner 1", "Inner 3", "Outer"]],
    });
  });

  it("leaves a while, repeat or for ... in pass, and an inner loop of the body, by its own exit", () => {
    const cases: [readonly string[], string[]][] = [
      [
        [
          "    local i = 0",
          "    while i < 4 do",
          "      i = i + 1",
          "      if i % 2 == 0 then",
          "        continue",
          "      end",
          "      * W {i}",
          "    end",
        ],
        ["W 1", "W 3", "Outer"],
      ],
      [
        [
          "    local i = 0",
          "    repeat",
          "      i = i + 1",
          "      if i > 2 then",
          "        break",
          "      end",
          "      * R {i}",
          "    until i >= 5",
        ],
        ["R 1", "R 2", "Outer"],
      ],
      [
        [
          '    for _, v in ipairs({"a", "b", "c"}) do',
          '      if v == "c" then',
          "        break",
          "      end",
          "      * E {v}",
          "    end",
        ],
        ["E a", "E b", "Outer"],
      ],
      [
        [
          "    for i = 1, 2 do",
          "      for j = 1, 3 do",
          "        if j == 2 then",
          "          break",
          "        end",
          "        * C {i} {j}",
          "      end",
          "      * D {i}",
          "    end",
        ],
        ["C 1 1", "D 1", "C 2 1", "D 2", "Outer"],
      ],
      [
        [
          "    if true then",
          "      local k = 10",
          "      for i = 1, 2 do",
          "        * G {k + i}",
          "      end",
          "    end",
        ],
        ["G 11", "G 12", "Outer"],
      ],
    ];
    for (const [preamble, menu] of cases) {
      const text = scene(preamble);
      expect(run(text, [1])).toEqual({
        beats: [menu[1]!, "After."],
        menus: [menu],
      });
    }
  });

  it("offers a sticky choice once per pass, and a block written in the body with its then clause", () => {
    const sticky = scene([
      "    for i = 1, 2 do",
      "      + Inner {i}",
      "    end",
    ]);
    expect(run(sticky, [1])).toEqual({
      beats: ["Inner 2", "After."],
      menus: [["Inner 1", "Inner 2", "Outer"]],
    });
    const nested = scene([
      "    local i = 0",
      "    while i < 2 do",
      "      i = i + 1",
      "      choose",
      "        * Inner {i}",
      "          Chose inner {i}.",
      "      then",
      "        Then {i}.",
      "      end",
      "    end",
    ]);
    expect(run(nested, [1])).toEqual({
      beats: ["Inner 2", "Chose inner 2.", "Then 2.", "After."],
      menus: [["Inner 1", "Inner 2", "Outer"]],
    });
  });

  it("is exact in the depth of scopes inside a raised choice's entry and body, and an image restored there runs on as it ran", () => {
    const text = scene(
      [
        "    for i = 1, 2 do",
        "      local twice = i * 2",
        "      * Inner {i}",
        "        First {twice}.",
        "        Second {i}.",
        "    end",
      ],
      ["  After {i}."],
    );
    silence(() => {
      const story = programStory(text);
      while (story.canContinue) {
        story.Continue();
        expectExactDepth(story, "before the menu");
      }
      expect(story.currentChoices.map((c) => c.text)).toEqual(["Inner 1", "Inner 2", "Outer"]);
      story.ChooseChoiceIndex(1);
      expectExactDepth(story, "at the entry");
      expect((story.Continue() ?? "").trim()).toBe("Inner 2");
      const inEntry = story.capture();
      expect((story.Continue() ?? "").trim()).toBe("First 4.");
      const inBody = story.capture();
      const ran = play(story);
      expect(ran.beats).toEqual(["Second 2.", "After nil."]);
      expect(story.restore(inBody)).toBe(true);
      expectExactDepth(story, "restored in the body");
      expect(play(story)).toEqual(ran);
      expect(story.restore(inEntry)).toBe(true);
      expectExactDepth(story, "restored in the entry");
      expect(play(story).beats).toEqual(["First 4.", ...ran.beats]);
    });
  });

  it("saves the menu a loop raised, and a loaded save takes a later pass's choice", () => {
    const text = scene(LOOPS["for"]!);
    silence(() => {
      const story = programStory(text);
      story.keepBeatImages = true;
      while (story.canContinue) {
        story.Continue();
      }
      const save = story.toSave();
      const loaded = programStory(text);
      loaded.keepBeatImages = true;
      loaded.loadSave(save);
      // The save holds the beat before the menu, whose continue raises the
      // loop's choices again.
      while (loaded.canContinue) {
        loaded.Continue();
      }
      expect(loaded.currentChoices.map((c) => c.text)).toEqual(["Inner 1", "Inner 2", "Outer"]);
      loaded.ChooseChoiceIndex(1);
      expect(play(loaded).beats).toEqual(["Inner 2", "Chose inner 2.", "After."]);
    });
  });

  it("names a break or continue inside a choice's body, which would leave a loop that has ended", () => {
    const text = scene([
      "    for i = 1, 2 do",
      "      * Inner {i}",
      "        break",
      "    end",
    ]);
    const { program } = silence(() => compileScript(text, { programChunks: true }));
    expect(program.chunks).toBeUndefined();
    expect(program.fallback).toEqual({
      construct: "a break or continue inside a choice's body",
      uri: MAIN_URI,
      line: 5,
    });
  });

  it("emits the same chunks after an edit inside the loop's body as a cold compile", () => {
    const text = scene(LOOPS["while"]!);
    const c = programCompiler({ [MAIN_URI]: text }, { programChunks: true });
    silence(() => c.compile());
    const before = "Chose inner {i}.";
    const after = "Took inner {i}.";
    const at = text.indexOf(before);
    const lines = text.slice(0, at).split("\n");
    c.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        {
          range: {
            start: { line: lines.length - 1, character: lines.at(-1)!.length },
            end: { line: lines.length - 1, character: lines.at(-1)!.length + before.length },
          },
          text: after,
        },
      ],
    });
    const edited = silence(() => c.compile().program);
    expect(edited.fallback).toBeUndefined();
    const cold = silence(() =>
      compileScript(text.replace(before, after), { programChunks: true }).program,
    );
    expect(describeRoot(edited.chunks!)).toEqual(describeRoot(cold.chunks!));
    expect(run(text.replace(before, after), [1]).beats).toEqual([
      "Inner 2",
      "Took inner 2.",
      "After.",
    ]);
  });
});
