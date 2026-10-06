// `choose` blocks and their choices on the program engine (#697,
// docs/engine/binary-program.md, section 4): a block is one statement chunk
// whose choices' bodies and `then` clause are blocks, a choice's count is an
// anonymous symbol the statement owns that goes with the choice when the
// statement is emitted again, and the engine raises, presents and takes
// choices as the current engine does.
import "../../inkjs/engine/Container";
import { afterEach, describe, expect, it } from "vitest";
import { buildPreviewFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import { shuffleDraws } from "../../inkjs/engine/Story";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import {
  CHOICE_ONCE,
  DONE_HOLD,
  Op,
  OP_NAMES,
} from "../../program/ProgramInstructions";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import { SymbolKind, isAnonymousSymbol } from "../../program/ProgramSymbols";
import {
  BLOCK_CHOICE,
  BLOCK_THEN,
  B_SEQUENCE,
  blockCount,
  blockField,
  blockFlags,
  chunkId,
  codeWords,
  type StatementChunk,
} from "../../program/StatementChunk";
import {
  compileScript,
  MAIN_URI,
  programCompiler,
  rootChunks,
  storyRun,
} from "./programHarness";

const injectDraws = () => {
  let s = 0x697;
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
 *  taken in turn (the first one at every menu past them), and the program's
 *  root. */
const bothEngines = (text: string, picks: number[] = [], from?: string) =>
  silence(() => {
    const { program } = compileScript(text, { programChunks: true });
    expect(program.fallback).toBeUndefined();
    const current = compileScript(text);
    injectDraws();
    current.story.ResetState();
    const expected = storyRun(current.story, picks, { from });
    injectDraws();
    const actual = storyRun(new ProgramStory(program.chunks!), picks, { from });
    return { expected, actual, root: program.chunks! };
  });

/** Compares a script on both engines for each of `pickLists`, and returns
 *  the runs. */
const agrees = (text: string, pickLists: number[][], from?: string) =>
  pickLists.map((picks) => {
    const run = bothEngines(text, picks, from);
    expect(run.actual, `picks ${picks.join(",")}`).toEqual(run.expected);
    return run;
  });

/** The texts of a run's beats, trimmed. */
const texts = (run: { beats: { text: string }[] }) =>
  run.beats.map((beat) => beat.text.trim());

/** The texts of the choices of each menu of a run. */
const menuTexts = (run: { menus: { choices: { text: string }[] }[] }) =>
  run.menus.map((menu) => menu.choices.map((choice) => choice.text));

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

/** A compiler over one script that an edit replaces `before` with `after`
 *  in, one occurrence, and compiles again. */
const session = (text: string) => {
  const c = programCompiler({ [MAIN_URI]: text }, { programChunks: true });
  let current = text;
  let version = 1;
  const first = silence(() => c.compile().program);
  expect(first.fallback).toBeUndefined();
  return {
    compiler: c.compiler,
    first,
    edit(before: string, after: string) {
      const at = current.indexOf(before);
      expect(at, before).toBeGreaterThanOrEqual(0);
      version += 1;
      c.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version },
        contentChanges: [
          {
            range: { start: posAt(current, at), end: posAt(current, at + before.length) },
            text: after,
          },
        ],
      });
      current = current.slice(0, at) + after + current.slice(at + before.length);
      const program = silence(() => c.compile().program);
      expect(program.fallback).toBeUndefined();
      return program.chunks!;
    },
    get emitted() {
      return c.compiler.chunkStore!.emittedLastBuild;
    },
  };
};

/** The chunks of a root whose code holds a `Choice`: its `choose` blocks. */
const chooseChunks = (root: ProgramRoot): StatementChunk[] => {
  const reader = new BinaryProgramReader(root);
  return rootChunks(root).filter((chunk) =>
    [...reader.instructions(chunk)].some((i) => i.op === Op.Choice),
  );
};

/** The instructions of a chunk's code. */
const instructionsOf = (chunk: StatementChunk) => {
  const out = [];
  for (let offset = 0; offset < codeWords(chunk); offset += 2) {
    out.push(BinaryProgramReader.instructionAt(chunk, offset));
  }
  return out;
};

/** The `Choice` instructions of a chunk, each with the count symbol its
 *  entry's `Visit` names. */
const choicesOf = (chunk: StatementChunk) =>
  instructionsOf(chunk)
    .filter((i) => i.op === Op.Choice)
    .map((i) => {
      const entry = BinaryProgramReader.instructionAt(chunk, i.offset + 2 + i.arg);
      expect(OP_NAMES[entry.op]).toBe("Visit");
      return { offset: i.offset, flags: i.flags, symbol: entry.arg };
    });

/** The sequence of block `k` of `chunk` in `root`. */
const bodyOf = (root: ProgramRoot, chunk: StatementChunk, k: number): SequenceRow =>
  root.body(chunk, k)!;

describe("choose blocks on the program engine", () => {
  it("raises a block's choices and takes each one as the current engine does", () => {
    const text = [
      "-> main",
      "scene main",
      "  The door is shut.",
      "  choose",
      "    + if true [Open the door]",
      "      The door swings open.",
      "    * Knock",
      "      Nobody answers.",
      "  then (hallway)",
      "    You step back.",
      "  end",
      "  After.",
      "end",
      "",
    ].join("\n");
    const [first, second] = agrees(text, [[0], [1]]);
    expect(menuTexts(first!.expected)).toEqual([["Open the door", "Knock"]]);
    // A choice whose words are all choice-only shows an empty line when
    // taken.
    expect(texts(first!.actual)).toEqual([
      "The door is shut.",
      "",
      "The door swings open.",
      "You step back.",
      "After.",
    ]);
    expect(texts(second!.actual)).toEqual([
      "The door is shut.",
      "Knock",
      "Nobody answers.",
      "You step back.",
      "After.",
    ]);
  });

  it("runs nested blocks, whose inner choices continue after their own block", () => {
    const text = [
      "-> main",
      "scene main",
      "  choose",
      "    * Outer one",
      "      Inside one.",
      "      choose",
      "        * Inner A",
      "          Took inner A.",
      "        * Inner B",
      "      then",
      "        Inner then.",
      "      end",
      "      Back in outer one.",
      "    * Outer two",
      "  then",
      "    Outer then.",
      "  end",
      "  done",
      "end",
      "",
    ].join("\n");
    const [a, b, c] = agrees(text, [[0, 0], [0, 1], [1]]);
    expect(texts(a!.actual)).toEqual([
      "Outer one",
      "Inside one.",
      "Inner A",
      "Took inner A.",
      "Inner then.",
      "Back in outer one.",
      "Outer then.",
    ]);
    expect(menuTexts(b!.actual)).toEqual([["Outer one", "Outer two"], ["Inner A", "Inner B"]]);
    expect(texts(c!.actual)).toEqual(["Outer two", "Outer then."]);
  });

  it("hides a conditional choice whose condition is false, and an `if` that gates a choice", () => {
    const text = [
      "store has_key = false",
      "store coins = 2",
      "-> main",
      "scene main",
      "  choose",
      "    if has_key then",
      "      * Unlock",
      "        Unlocked.",
      "    end",
      "    if coins > 1 then",
      "      * Pay",
      "        Paid.",
      "    end",
      "    * if (coins > 5) Bribe",
      "    * if (coins > 0) [Beg] for more",
      "      Begged.",
      "  end",
      "  After.",
      "end",
      "",
    ].join("\n");
    const [pay, beg] = agrees(text, [[0], [1]]);
    expect(menuTexts(pay!.actual)).toEqual([["Pay", "Beg"]]);
    expect(texts(pay!.actual)).toEqual(["Pay", "Paid.", "After."]);
    expect(texts(beg!.actual)).toEqual(["for more", "Begged.", "After."]);
  });

  it("hides a once-only choice taken before, and offers a sticky one again", () => {
    const text = [
      "-> main",
      "scene main",
      "  label top",
      "  choose",
      "    * Once",
      "      Took once.",
      "    + Sticky",
      "      Took sticky.",
      "    * Leave",
      "      -> out",
      "  end",
      "  -> top",
      "end",
      "scene out",
      "  Out.",
      "end",
      "",
    ].join("\n");
    const [run] = agrees(text, [[0, 0, 0, 0]]);
    expect(menuTexts(run!.actual).slice(0, 5)).toEqual([
      ["Once", "Sticky", "Leave"],
      ["Sticky", "Leave"],
      ["Sticky", "Leave"],
      ["Sticky", "Leave"],
      ["Sticky", "Leave"],
    ]);
    agrees(text, [[0, 1], [1, 1, 1, 0, 1], [2]]);
  });

  // A choice an `if` gates is raised inside the scope its branch opens, which
  // closes where the branch ends, and its entry runs inside it and closes it
  // after the body (#1575): the body reads the branch's locals, through a
  // jump inside the body too, whichever branches before it ran, and the line
  // after the block no longer sees them. These scripts read no branch's
  // local outside its branch, so both engines agree on them.
  it("keeps the locals of the branch that gates a choice, through a jump inside its body, and drops them after it", () => {
    agrees(
      [
        "-> main",
        "scene main",
        "  choose",
        "    if true then",
        "      * A",
        "    end",
        "    if true then",
        "      local saved = 7",
        "      * B",
        "        -> again",
        "        label again",
        "        Value {saved}.",
        "    end",
        "  end",
        "end",
        "",
      ].join("\n"),
      [[0], [1]],
    );
    const text = [
      "store flag = true",
      "-> main",
      "scene main",
      "  label top",
      "  local outer = \"o\"",
      "  choose",
      "    if flag then",
      "      local saved = 7",
      "      * A {saved}",
      "        -> again_a",
      "        label again_a",
      "        Value A {saved} {outer}.",
      "    end",
      "    if flag then",
      "      local saved = 8",
      "      * B",
      "        Value B {saved}.",
      "    end",
      "    if top > 1 then",
      "      if true then",
      "        local deep = 9",
      "        * Deep",
      "          -> again_d",
      "          label again_d",
      "          Deep {deep}.",
      "      end",
      "    end",
      "    if true then",
      "      local inner = 3",
      "      choose",
      "        * Inner one",
      "          Inner {inner}.",
      "      then (inner_then)",
      "        Inner then {inner} {inner_then}.",
      "      end",
      "    end",
      "    + Leave",
      "      -> out",
      "  end",
      "  -> top",
      "end",
      "scene out",
      "  Out.",
      "end",
      "",
    ].join("\n");
    const runs = agrees(text, [[0], [1], [1, 2], [2, 0, 1, 2, 3], [0, 1, 2, 3, 4], [4, 3, 2, 1]]);
    expect(texts(runs[0]!.actual)).toContain("Value A 7 o.");
    expect(texts(runs[1]!.actual)).toContain("Value B 8.");
    expect(texts(runs[2]!.actual)).toContain("Deep 9.");
    // A gate before the choice that does not hold opens no scope, and the
    // line after the block reads the global again.
    const [after] = agrees(
      [
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
        "        -> again",
        "        label again",
        "        Inside {open}.",
        "    end",
        "  end",
        "  After {open}.",
        "end",
        "",
      ].join("\n"),
      [[0]],
    );
    expect(texts(after!.actual)).toEqual(["Pick", "Inside true.", "After false."]);
  });

  // A gated branch's scope closes where the branch ends, as Luau closes a
  // block's, so a later condition reads the global the branch's local
  // shadowed (#1575). The current engine leaves the branch's scope open for
  // the rest of the presentation and finds the local, which is its defect;
  // `programChoiceScopes.test.ts` asserts the rest of the rule.
  it("reads the global in a later choice's condition, not the local of the branch that gated an earlier choice", () => {
    const { actual } = bothEngines(
      [
        "store open = false",
        "-> main",
        "scene main",
        "  choose",
        "    if true then",
        "      local open = true",
        "      * First",
        "    end",
        "    * if open Global",
        "  end",
        "end",
        "",
      ].join("\n"),
      [0],
    );
    expect(menuTexts(actual)).toEqual([["First"]]);
  });

  // A block written in another block's preamble offers its choices with that
  // block's; with a `then` clause of its own, its choices continue there, and
  // the clause continues at the outer block's end, as the current engine's
  // weave passes the clause's gather up; three such blocks, one in another's
  // preamble, continue clause after clause.
  it("runs a block written in another block's preamble, with and without a then clause of its own", () => {
    for (const inner of [
      ["      choose", "        * Inner A", "          Took inner A.", "        * Inner B", "      then (inner_then)", "        Inner then {inner_then}.", "      end"],
      ["      choose", "        * Inner A", "          Took inner A.", "      end", "      Still in the preamble."],
    ]) {
      const text = [
        "-> main",
        "scene main",
        "  label top",
        "  choose",
        "    Caption {top}.",
        "    if true then",
        ...inner,
        "    end",
        "    + Outer",
        "      Took outer.",
        "    + Leave",
        "      -> out",
        "  end",
        "  -> top",
        "end",
        "scene out",
        "  Out.",
        "end",
        "",
      ].join("\n");
      const runs = agrees(text, [[0, 2], [1, 2], [2], [0, 0, 0, 2]]);
      expect(menuTexts(runs[0]!.actual)[0]).toContain("Inner A");
      expect(menuTexts(runs[0]!.actual)[0]).toContain("Outer");
    }
    const [inner, middle, outer] = agrees(
      [
        "-> main",
        "scene main",
        "  choose",
        "    choose",
        "      choose",
        "        * Inner",
        "      then",
        "        Inner then.",
        "      end",
        "      * Middle",
        "    then",
        "      Middle then.",
        "    end",
        "    * Outer",
        "  then",
        "    Outer then.",
        "  end",
        "end",
        "",
      ].join("\n"),
      [[0], [1], [2]],
    );
    expect(texts(inner!.actual)).toEqual(["Inner", "Inner then.", "Middle then.", "Outer then."]);
    expect(texts(middle!.actual)).toEqual(["Middle", "Middle then.", "Outer then."]);
    expect(texts(outer!.actual)).toEqual(["Outer", "Outer then."]);
  });

  // A block written in another block's preamble whose choices an `if` gates:
  // its gated choices are its own, so they continue at its `then` clause,
  // which runs after a choice of the block is taken and never while the
  // choices are presented (#1575). The current engine's weave enters the
  // clause where it stands when the block has no choice outside an `if`, and
  // sends a gated choice past it to the outer block's end, which is its
  // defect. Both forms run from chunks, and an edit inside the clause keeps
  // the outer block's chunk.
  it("runs a preamble block whose choices an if gates, with its then clause, and keeps the owner through an edit of the clause", () => {
    const nested = [
      "-> main",
      "scene main",
      "  choose",
      "    choose",
      "      if true then",
      "        * Inner",
      "          Took inner.",
      "      end",
      "    then (inner_then)",
      "      Inner then.",
      "      Inner then again.",
      "    end",
      "    + Outer",
      "      Took outer.",
      "  end",
      "end",
      "",
    ].join("\n");
    const program = (text: string, picks: number[]) => bothEngines(text, picks).actual;
    expect(menuTexts(program(nested, [0]))).toEqual([["Inner", "Outer"]]);
    expect(texts(program(nested, [0]))).toEqual([
      "Inner",
      "Took inner.",
      "Inner then.",
      "Inner then again.",
    ]);
    expect(texts(program(nested, [1]))).toEqual(["Outer", "Took outer."]);
    const mixed = [
      "-> main",
      "scene main",
      "  label top",
      "  choose",
      "    Caption {top}.",
      "    choose",
      "      if top < 3 then",
      "        local g = \"gated\"",
      "        * Gated",
      "          Took {g}.",
      "      end",
      "      * Direct",
      "        Took direct.",
      "    then (inner_then)",
      "      Inner then {inner_then}.",
      "    end",
      "    + Outer",
      "      Took outer.",
      "    + Leave",
      "      -> out",
      "  end",
      "  -> top",
      "end",
      "scene out",
      "  Out.",
      "end",
      "",
    ].join("\n");
    expect(texts(program(mixed, [0, 2]))).toEqual([
      "Caption 1.",
      "Gated",
      "Took gated.",
      "Inner then 1.",
      "Caption 2.",
      "Leave",
      "Out.",
    ]);
    expect(texts(program(mixed, [1, 2]))).toEqual([
      "Caption 1.",
      "Direct",
      "Took direct.",
      "Inner then 1.",
      "Caption 2.",
      "Leave",
      "Out.",
    ]);
    expect(texts(program(mixed, [2, 3]))).toEqual([
      "Caption 1.",
      "Outer",
      "Took outer.",
      "Caption 2.",
      "Leave",
      "Out.",
    ]);
    // A once-only choice taken is not offered again, and past the gate the
    // block offers only its own choice.
    expect(menuTexts(program(mixed, [0, 0, 1]))).toEqual([
      ["Gated", "Direct", "Outer", "Leave"],
      ["Direct", "Outer", "Leave"],
      ["Outer", "Leave"],
    ]);
    const s = session(nested);
    const [chunk] = chooseChunks(s.first.chunks!);
    const root = s.edit("Inner then again.", "Inner then once more.");
    expect(s.emitted).toBe(1);
    expect(chooseChunks(root)[0]).toBe(chunk);
  });

  // A choice in a `do` block or a loop of a block's preamble, directly or in
  // a block written there, is raised by the block's chunk, whose own code
  // the body is, so the chunk holds its entry (#1503, section 4): a `do`
  // block's choices run from chunks as the current engine runs them. A
  // loop's run every pass, which the current engine's weave does not
  // (#1588); `programPreambleBlocks.test.ts` covers them.
  it("runs a choice inside a do block of a block's preamble from chunks as the current engine does", () => {
    const preambles = [
      ["    do", "      choose", "        * Inner", "          Chose inner.", "      end", "    end"],
      ["    do", "      local x = 1", "      * Inner {x}", "        Chose inner.", "    end"],
    ];
    for (const preamble of preambles) {
      const text = [
        "-> main",
        "scene main",
        "  choose",
        ...preamble,
        "    * Outer",
        "  end",
        "  After.",
        "end",
        "",
      ].join("\n");
      const [inner, outer] = agrees(text, [[0], [1]]);
      expect(texts(inner!.actual)).toEqual([
        preamble.length === 6 ? "Inner" : "Inner 1",
        "Chose inner.",
        "After.",
      ]);
      expect(texts(outer!.actual)).toEqual(["Outer", "After."]);
    }
  });

  it("follows a fallback choice when every other choice is unavailable", () => {
    const text = [
      "store has_key = false",
      "-> main",
      "scene main",
      "  label top",
      "  choose",
      "    if has_key then",
      "      * Unlock",
      "    end",
      "    * Look",
      "      Looked.",
      "    * ->",
      "  then",
      "    Given up {top}.",
      "  end",
      "  if top < 3 then",
      "    -> top",
      "  end",
      "  Gone.",
      "end",
      "",
    ].join("\n");
    const [run] = agrees(text, [[0]]);
    expect(texts(run!.actual)).toEqual([
      "Look",
      "Looked.",
      "Given up 1.",
      "Given up 2.",
      "Given up 3.",
      "Gone.",
    ]);
  });

  it("raises the choices a thread offers before the block's own, and takes one in the thread's scene", () => {
    const text = [
      "-> hub",
      "scene hub",
      "  <- side",
      "  Hub {side}.",
      "  choose",
      "    * Hub choice",
      "      In the hub.",
      "  end",
      "  Hub after.",
      "end",
      "scene side",
      "  choose",
      "    * Side choice",
      "      In the side {side} {hub}.",
      "  end",
      "  Side after.",
      "  done",
      "end",
      "",
    ].join("\n");
    const [side, hub] = agrees(text, [[0], [1]]);
    expect(menuTexts(side!.actual)).toEqual([["Side choice", "Hub choice"]]);
    // Taking the side's choice enters the side scene from the hub, where the
    // flow stopped, so the scene counts a second visit.
    expect(texts(side!.actual)).toEqual([
      "Hub 1.",
      "Side choice",
      "In the side 2 1.",
      "Side after.",
    ]);
    expect(texts(hub!.actual)).toEqual(["Hub 1.", "Hub choice", "In the hub.", "Hub after."]);
  });

  it("runs a labelled then clause another scene diverts to, and the scene after the clause", () => {
    const text = [
      "-> main",
      "scene main",
      "  choose",
      "    * Stay",
      "      Stayed.",
      "    * Away",
      "      -> away",
      "  then (rejoin)",
      "    Rejoined {rejoin}.",
      "  end",
      "  More of the scene.",
      "  done",
      "end",
      "scene away",
      "  Away.",
      "  -> main.rejoin",
      "end",
      "",
    ].join("\n");
    const [stay, away] = agrees(text, [[0], [1]]);
    expect(texts(stay!.actual)).toEqual(["Stay", "Stayed.", "Rejoined 1.", "More of the scene."]);
    expect(texts(away!.actual)).toEqual(["Away", "Away.", "Rejoined 1.", "More of the scene."]);
  });

  it("gives a choice its tags and its text in parts, and a named choice a count that a divert reaches", () => {
    const text = [
      "-> main",
      "scene main",
      "  label top",
      "  choose",
      "    * Start [only] after # first # second",
      "      Took it {pick}.",
      "    * (pick) Named [choice]",
      "      Named {pick}.",
      "    + {top > 2 ? \"Leave\" : \"Wait\"}",
      "      -> out",
      "  end",
      "  -> top",
      "end",
      "scene out",
      "  -> main.pick",
      "end",
      "",
    ].join("\n");
    agrees(text, [[0], [1], [2], [1, 0, 1]]);
  });

  // #696 left this part of its thread criterion to this slice: a thread that
  // raises choices between two beats ends at its `Done`, which pops the
  // thread and does not end the continue's look-ahead, so the assignment
  // after the first line has not run when the first line is returned.
  it("returns the first line of two with a thread that raises choices between them before the assignment after it", () => {
    const text = [
      "store x = 0",
      "-> main",
      "scene main",
      "  First line.",
      "  & x = 1",
      "  <- side",
      "  Second line {x}.",
      "  done",
      "end",
      "scene side",
      "  choose",
      "    * Side choice",
      "      Took the side.",
      "  end",
      "  done",
      "end",
      "",
    ].join("\n");
    silence(() => {
      const { program } = compileScript(text, { programChunks: true });
      expect(program.fallback).toBeUndefined();
      const current = compileScript(text).story;
      current.ResetState();
      const story = new ProgramStory(program.chunks!);
      for (const engine of [current, story] as const) {
        expect(engine.Continue()).toBe("First line.\n");
        expect(engine.variablesState.$("x")).toBe(0);
        expect(engine.Continue()).toBe("Second line 1.\n");
        expect(engine.variablesState.$("x")).toBe(1);
        while (engine.canContinue) engine.Continue();
        expect(engine.currentChoices.map((c) => c.text)).toEqual(["Side choice"]);
        engine.ChooseChoiceIndex(0);
        expect(engine.Continue()).toBe("Side choice\n");
        expect(engine.Continue()).toBe("Took the side.\n");
      }
    });
  });
});

describe("the choose chunk", () => {
  const text = [
    "-> main",
    "scene main",
    "  The door is shut.",
    "  choose",
    "    + if true [Open the door]",
    "      The door swings open.",
    "      You go in.",
    "    * Knock",
    "      Nobody answers.",
    "  then (hallway)",
    "    You step back.",
    "    The hallway is dark.",
    "  end",
    "  After.",
    "end",
    "",
  ].join("\n");

  it("is one chunk whose choices' bodies and then clause are blocks, with a Choice per choice targeting the Visit of its count", () => {
    const { program } = compileScript(text, { programChunks: true });
    const root = program.chunks!;
    const [chunk, ...others] = chooseChunks(root);
    expect(others).toEqual([]);
    expect(blockCount(chunk!)).toBe(3);
    expect([0, 1, 2].map((k) => blockFlags(chunk!, k))).toEqual([
      BLOCK_CHOICE,
      BLOCK_CHOICE,
      BLOCK_THEN,
    ]);
    expect([0, 1, 2].map((k) => bodyOf(root, chunk!, k).arrays.chunks.length)).toEqual([2, 1, 2]);
    const choices = choicesOf(chunk!);
    expect(choices.map((c) => c.flags & CHOICE_ONCE)).toEqual([0, CHOICE_ONCE]);
    for (const choice of choices) {
      expect(isAnonymousSymbol(root.table, choice.symbol)).toBe(true);
      expect(root.kindOf(choice.symbol)).toBe(SymbolKind.Choice);
    }
    expect(new Set(choices.map((c) => c.symbol)).size).toBe(2);
    // The then clause's label is exported where its `Visit` counts it.
    expect(root.kindOf(root.table.symbolIds.get("main.hallway")!)).toBe(SymbolKind.Label);
    // Each `Choice` and each entry stands under a line table row of its
    // choice's own line, which counts from the end of the body above it.
    const at = root.position(chunkId(chunk!))!;
    const reader = new BinaryProgramReader(root);
    const lineOf = (offset: number) =>
      reader.rangeAt(at.sequence, at.entry, offset)!.startLine;
    const lines = text.split("\n");
    expect(choices.map((c) => lineOf(c.offset))).toEqual([
      lines.indexOf("    + if true [Open the door]"),
      lines.indexOf("    * Knock"),
    ]);
    expect(choices.map((c) => lineOf(c.offset + 2 + instructionsOf(chunk!).find((i) => i.offset === c.offset)!.arg))).toEqual([
      lines.indexOf("    + if true [Open the door]"),
      lines.indexOf("    * Knock"),
    ]);
  });

  // A choice's identity for the route planner is the address of its `Choice`
  // instruction (section 4), which a choice with a condition is a decision
  // at, as a conditional choice point is on the current engine.
  it("names each choice by the address of its Choice, pauses before a conditional one and takes the verdict and the choice a route forces", () => {
    const script = [
      "store open = true",
      "-> main",
      "scene main",
      "  choose",
      "    * if open Enter",
      "      Entered.",
      "    * Wait",
      "      Waited.",
      "  end",
      "end",
      "",
    ].join("\n");
    const { program } = compileScript(script, { programChunks: true });
    const root = program.chunks!;
    const [chunk] = chooseChunks(root);
    const [enter, wait] = choicesOf(chunk!).map((c) =>
      ProgramStory.addressOf(chunk!, c.offset),
    );
    const paused = new ProgramStory(root);
    paused.pauseBeforeEvaluatingConditions = true;
    while (paused.canContinue && paused.pausedBeforeCondition === null) {
      paused.Continue();
    }
    expect(paused.pausedBeforeCondition).toBe(enter);
    paused.pauseBeforeEvaluatingConditions = false;
    while (paused.canContinue) paused.Continue();
    expect(paused.currentChoices.map((c) => c.sourcePath)).toEqual([enter, wait]);

    const forced = new ProgramStory(root);
    const sites: string[] = [];
    forced.simulator = {
      forceCondition: (site) => (site === enter ? false : null),
      forceChoice: (site) => {
        sites.push(site);
        return wait!;
      },
      willForceCondition: () => true,
      willForceChoice: () => true,
      saveSnapshot: () => ({ conditionPointer: {}, choicePointer: {} }),
    };
    const shown: string[] = [];
    while (forced.canContinue) shown.push(forced.Continue()!.trim());
    // The verdict hid `Enter`, and the route took `Wait` at the menu, which
    // it was asked for by the address of the `Done` that held there.
    expect(shown.filter(Boolean)).toEqual(["Wait", "Waited."]);
    const done = instructionsOf(chunk!).find((i) => i.op === Op.Done)!;
    expect(sites[0]).toBe(ProgramStory.addressOf(chunk!, done.offset));
  });

  // Section 4: the code the block itself adds before the `Done` that ends the
  // presentation (its captures, conditions and `Choice`s) reads state and
  // writes only the captured texts. This block's preamble and choice texts
  // write nothing of their own; a preamble's statements or an alternator in a
  // choice's text would run as written.
  it("holds no Visit and no assignment of the writer's own before the Done that ends the presentation", () => {
    const { program } = compileScript(
      [
        "store gold = 3",
        "-> main",
        "scene main",
        "  Caption {gold}.",
        "  choose",
        "    if gold > 1 then",
        "      * Pay [up] now # paid",
        "    end",
        "    * if gold > 2 Spend {gold}",
        "    + Leave",
        "    * ->",
        "  then (after)",
        "    Done.",
        "  end",
        "end",
        "",
      ].join("\n"),
      { programChunks: true },
    );
    const [chunk] = chooseChunks(program.chunks!);
    const ops = [...new BinaryProgramReader(program.chunks!).instructions(chunk!)];
    const done = ops.findIndex((i) => i.op === Op.Done && i.flags & DONE_HOLD);
    expect(done).toBeGreaterThan(0);
    const before = ops.slice(0, done).map((i) => OP_NAMES[i.op]);
    expect(before.filter((op) => op === "Choice")).toHaveLength(4);
    expect(before).not.toContain("Visit");
    expect(before).not.toContain("SetVar");
    expect(before).not.toContain("StoreIndex");
  });

  // A choice an `if` of the preamble gates has a body that is a block too:
  // the lines after it in its branch, which the current engine runs when it
  // is taken.
  it("re-emits only the edited statement for an edit inside the body of a choice an if gates, and keeps the choose chunk", () => {
    const gated = [
      "store open = true",
      "-> main",
      "scene main",
      "  choose",
      "    if open then",
      "      Before the gated choice.",
      "      * Pay",
      "        Paid.",
      "        Paid again.",
      "      + Wait",
      "        Waited.",
      "    end",
      "    + Leave",
      "      Left.",
      "  end",
      "  After.",
      "end",
      "",
    ].join("\n");
    agrees(gated, [[0], [1], [2], [0, 0]]);
    const s = session(gated);
    const [chunk] = chooseChunks(s.first.chunks!);
    expect(blockCount(chunk!)).toBe(3);
    const before = new Set(rootChunks(s.first.chunks!));
    for (const [from, to] of [
      ["Paid again.", "Paid once more."],
      ["Waited.", "Waited a while."],
      ["Left.", "Left at once."],
    ] as const) {
      const root = s.edit(from, to);
      expect(s.emitted, from).toBe(1);
      expect(chooseChunks(root)[0]).toBe(chunk);
      const after = rootChunks(root);
      expect(after.filter((c) => !before.has(c))).toHaveLength(1);
      after.forEach((c) => before.add(c));
    }
  });

  it("re-emits only the edited statement for an edit inside the then clause or a choice's body, and keeps the choose chunk", () => {
    const s = session(text);
    const [chunk] = chooseChunks(s.first.chunks!);
    const before = new Set(rootChunks(s.first.chunks!));
    for (const [from, to] of [
      ["The hallway is dark.", "The hallway is darker."],
      ["You go in.", "You walk in."],
      ["Nobody answers.", "Nobody answers at all."],
    ] as const) {
      const root = s.edit(from, to);
      expect(s.emitted, from).toBe(1);
      expect(chooseChunks(root)[0]).toBe(chunk);
      const after = rootChunks(root);
      expect(after.filter((c) => !before.has(c))).toHaveLength(1);
      after.forEach((c) => before.add(c));
    }
  });
});

describe("the counts of choices", () => {
  // A scene whose block loops back after each choice; `Second.` stands
  // between the label and the block so a state saved after `Top.` rests at
  // a statement no edit below touches.
  const looping = (choices: string[]) =>
    [
      "-> main",
      "scene main",
      "  label top",
      "  Top.",
      "  Second.",
      "  choose",
      ...choices,
      "    + Leave",
      "      -> out",
      "  end",
      "  -> top",
      "end",
      "scene out",
      "  Out.",
      "end",
      "",
    ].join("\n");

  /** Runs `root` to its first menu, takes the choice whose text is `take`,
   *  and runs on to the next `Top.`, where it saves the state. */
  const takeAndSave = (root: ProgramRoot, take: string): string => {
    const story = new ProgramStory(root);
    while (story.canContinue) story.Continue();
    const index = story.currentChoices.findIndex((c) => c.text === take);
    expect(index, take).toBeGreaterThanOrEqual(0);
    story.ChooseChoiceIndex(index);
    for (;;) {
      expect(story.canContinue).toBe(true);
      if (story.Continue() === "Top.\n") break;
    }
    return story.state.toJson();
  };

  /** The texts of the menu a state saved by `takeAndSave` reaches on
   *  `root`. */
  const menuAfter = (root: ProgramRoot, saved: string): string[] => {
    const story = new ProgramStory(root);
    story.state.LoadJson(saved);
    while (story.canContinue) story.Continue();
    return story.currentChoices.map((c) => c.text);
  };

  it("leaves no chunk and no count symbol of a block changed when a second block is inserted above it, and a once-only choice taken stays hidden", () => {
    const text = looping(["    * Once", "      Took once."]);
    const s = session(text);
    const root = s.first.chunks!;
    const [chunk] = chooseChunks(root);
    const symbols = choicesOf(chunk!).map((c) => c.symbol);
    const chunks = rootChunks(root);
    const saved = takeAndSave(root, "Once");
    expect(menuAfter(root, saved)).toEqual(["Leave"]);
    const edited = s.edit(
      "  label top\n",
      "  choose\n    * Before\n      Took before.\n  end\n  label top\n",
    );
    const chooses = chooseChunks(edited);
    expect(chooses).toHaveLength(2);
    expect(chooses).toContain(chunk);
    expect(choicesOf(chunk!).map((c) => c.symbol)).toEqual(symbols);
    const kept = new Set(rootChunks(edited));
    expect(chunks.filter((c) => !kept.has(c))).toEqual([]);
    expect(menuAfter(edited, saved)).toEqual(["Leave"]);
  });

  it("offers a choice written above a once-only choice taken, and keeps the taken one hidden", () => {
    const s = session(looping(["    * Once", "      Took once."]));
    const saved = takeAndSave(s.first.chunks!, "Once");
    const edited = s.edit("    * Once\n", "    * New\n      Took new.\n    * Once\n");
    expect(menuAfter(edited, saved)).toEqual(["New", "Leave"]);
  });

  for (const [where, choices, edit] of [
    ["the first", ["    * Alpha", "      A.", "    * Beta", "      B."], "Alpha"],
    ["the last", ["    * Alpha", "      A.", "    * Beta", "      B."], "Beta"],
    ["the only", ["    * Alpha", "      A."], "Alpha"],
  ] as const) {
    it(`keeps the count of ${where} choice when its text is edited`, () => {
      const s = session(looping([...choices]));
      const saved = takeAndSave(s.first.chunks!, edit);
      const edited = s.edit(`* ${edit}`, `* ${edit} edited`);
      expect(menuAfter(edited, saved)).not.toContain(`${edit} edited`);
      expect(menuAfter(edited, saved)).toContain("Leave");
    });
  }

  it("keeps each choice's count when two choices swap places", () => {
    const s = session(looping(["    * Alpha", "      A.", "    * Beta", "      B."]));
    const saved = takeAndSave(s.first.chunks!, "Alpha");
    const edited = s.edit(
      "    * Alpha\n      A.\n    * Beta\n      B.\n",
      "    * Beta\n      B.\n    * Alpha\n      A.\n",
    );
    expect(menuAfter(edited, saved)).toEqual(["Beta", "Leave"]);
  });

  it("keeps each body's sequence id and arrays when a choice is added or removed above it", () => {
    const s = session(
      looping(["    * Alpha", "      A one.", "      A two.", "    * Beta", "      B one."]),
    );
    const bodies = (root: ProgramRoot) => {
      const [chunk] = chooseChunks(root);
      const out = new Map<string, { id: number; arrays: unknown }>();
      for (let k = 0; k < blockCount(chunk!); k += 1) {
        const body = bodyOf(root, chunk!, k);
        const first = new BinaryProgramReader(root).listing(body).join("\n");
        out.set(first.includes("A one.") ? "alpha" : first.includes("B one.") ? "beta" : `other${k}`, {
          id: blockField(chunk!, k, B_SEQUENCE),
          arrays: body.arrays,
        });
      }
      return out;
    };
    const before = bodies(s.first.chunks!);
    const added = bodies(s.edit("    * Alpha\n", "    * Gamma\n      G.\n    * Alpha\n"));
    const removed = bodies(s.edit("    * Gamma\n      G.\n", ""));
    for (const after of [added, removed]) {
      for (const name of ["alpha", "beta"]) {
        expect(after.get(name)!.id, name).toBe(before.get(name)!.id);
        expect(after.get(name)!.arrays, name).toBe(before.get(name)!.arrays);
      }
    }
  });

  // The stated limit of the alignment (section 2): parts that read the same
  // cannot be told apart, so deleting the first of three identical once-only
  // choices of which the second was taken leaves the taken one offered again.
  it("pins the limit of three identical once-only choices: deleting the first leaves the taken one offered again", () => {
    const s = session(
      looping(["    * Same", "      One.", "    * Same", "      Two.", "    * Same", "      Three."]),
    );
    const root = s.first.chunks!;
    const story = new ProgramStory(root);
    while (story.canContinue) story.Continue();
    expect(story.currentChoices.map((c) => c.text)).toEqual(["Same", "Same", "Same", "Leave"]);
    story.ChooseChoiceIndex(1);
    const shown: string[] = [];
    for (;;) {
      const line = story.Continue()!;
      shown.push(line.trim());
      if (line === "Top.\n") break;
    }
    expect(shown).toContain("Two.");
    const saved = story.state.toJson();
    expect(menuAfter(root, saved)).toEqual(["Same", "Same", "Leave"]);
    const edited = s.edit("    * Same\n      One.\n", "");
    // The two left align with the first two of three, the second of which
    // was taken: the first is offered and the second, the old third, is not.
    const after = new ProgramStory(edited);
    after.state.LoadJson(saved);
    while (after.canContinue) after.Continue();
    expect(after.currentChoices.map((c) => c.text)).toEqual(["Same", "Leave"]);
    after.ChooseChoiceIndex(0);
    expect(after.Continue()).toBe("Same\n");
    expect(after.Continue()).toBe("Two.\n");
  });
});

describe("a menu restored from the beat before it", () => {
  it("raises the same choices with the same texts, order, tags and flags, and a once-only choice taken stays hidden", () => {
    const text = [
      "store gold = 2",
      "-> main",
      "scene main",
      "  label top",
      "  Before the menu {top}.",
      "  choose",
      "    * if (gold > 1) Pay # paid [now]",
      "      Paid.",
      "    + [Wait # idle]",
      "      Waited.",
      "    * ->",
      "      -> top",
      "  end",
      "  -> top",
      "end",
      "",
    ].join("\n");
    const { program } = compileScript(text, { programChunks: true });
    const root = program.chunks!;
    const story = new ProgramStory(root);
    // Every choice waiting, invisible defaults included, as a menu holds it.
    const menuOf = (s: ProgramStory) =>
      s.state.currentChoices.map((c) => ({
        text: c.text,
        tags: c.tags,
        invisible: c.isInvisibleDefault,
        source: c.sourcePath,
      }));
    const toMenu = (s: ProgramStory) => {
      while (s.canContinue) s.Continue();
    };
    // Runs to the beat before the menu, saves its image, runs on to the
    // menu, and checks that the image restored raises the same menu.
    const menuFromImage = () => {
      for (;;) {
        expect(story.canContinue).toBe(true);
        if (story.Continue()!.startsWith("Before the menu")) break;
      }
      const image = story.state.toJson();
      toMenu(story);
      const restored = new ProgramStory(root);
      restored.state.LoadJson(image);
      toMenu(restored);
      expect(menuOf(restored)).toEqual(menuOf(story));
      return menuOf(restored);
    };
    const first = menuFromImage();
    expect(first.map((c) => [c.text, c.tags, c.invisible])).toEqual([
      ["Pay now", ["paid"], false],
      ["Wait", ["idle"], false],
      ["", [], true],
    ]);
    story.ChooseChoiceIndex(0);
    // `Pay now` was taken: the menu restored from the beat before it holds
    // `Wait` and the fallback alone.
    const second = menuFromImage();
    expect(second.map((c) => c.text)).toEqual(["Wait", ""]);
    story.ChooseChoiceIndex(0);
    expect(menuFromImage()).toEqual(second);
  });
});

describe("a state saved at a waiting menu", () => {
  // The in-session save (`toJson`) writes the choices waiting with the
  // frames of the threads they hold; the durable image of a menu, the beat
  // before it, is #699's.
  it("loads the choices waiting with their threads, and takes one with the thread's locals", () => {
    const text = [
      "-> hub",
      "scene hub",
      "  local here = \"hub local\"",
      "  <- side",
      "  Hub.",
      "  choose",
      "    * Hub choice",
      "      Took the hub with {here}.",
      "  end",
      "  Hub after.",
      "end",
      "scene side",
      "  local there = \"side local\"",
      "  choose",
      "    * Side choice",
      "      Took the side with {there}.",
      "  end",
      "  Side after.",
      "  done",
      "end",
      "",
    ].join("\n");
    const { program } = compileScript(text, { programChunks: true });
    expect(program.fallback).toBeUndefined();
    const root = program.chunks!;
    for (const pick of [0, 1]) {
      const story = new ProgramStory(root);
      while (story.canContinue) story.Continue();
      const saved = story.state.toJson();
      const loaded = new ProgramStory(root);
      loaded.state.LoadJson(saved);
      const menu = (s: ProgramStory) =>
        s.currentChoices.map((c) => [c.text, c.tags, c.sourcePath]);
      expect(menu(loaded)).toEqual(menu(story));
      expect(menu(loaded).map(([t]) => t)).toEqual(["Side choice", "Hub choice"]);
      const after = (s: ProgramStory) => {
        s.ChooseChoiceIndex(pick);
        const shown: string[] = [];
        while (s.canContinue) shown.push(s.Continue()!.trim());
        return shown.filter(Boolean);
      };
      const expected = after(story);
      expect(after(loaded)).toEqual(expected);
      expect(expected[1]).toBe(
        pick === 0 ? "Took the side with side local." : "Took the hub with hub local.",
      );
    }
  });
});

describe("large blocks", () => {
  it("compiles and runs a choose of 5,000 choices", () => {
    const count = 5000;
    const lines = ["-> main", "scene main", "  Pick one.", "  choose"];
    for (let i = 0; i < count; i += 1) {
      lines.push(`    * Choice ${i}`, `      Took ${i}.`);
    }
    lines.push("  end", "  After.", "end", "");
    const text = lines.join("\n");
    const { program } = silence(() => compileScript(text, { programChunks: true }));
    expect(program.fallback).toBeUndefined();
    const story = new ProgramStory(program.chunks!);
    expect(story.Continue()).toBe("Pick one.\n");
    while (story.canContinue) story.Continue();
    expect(story.currentChoices).toHaveLength(count);
    expect(story.currentChoices[count - 1]!.text).toBe(`Choice ${count - 1}`);
    story.ChooseChoiceIndex(count - 1);
    const shown: string[] = [];
    while (story.canContinue) shown.push(story.Continue()!.trim());
    expect(shown.filter(Boolean)).toEqual([
      `Choice ${count - 1}`,
      `Took ${count - 1}.`,
      "After.",
    ]);
  });

  it("runs the preview fixture, whose then clause holds 1,100 lines, without the fallback, as the current engine does", () => {
    const { files } = buildPreviewFixture();
    const text = files
      .get("main.sd")!
      .replace("include scripts/characters\n", "")
      .replace("include scripts/portraits\n", "");
    const [first, other] = agrees(text, [[0], [1]], "MAIN");
    expect(first!.expected.beats.length).toBeGreaterThan(700);
    expect(texts(first!.expected).at(-1)).toBe("A CRASH of thunder.");
    expect(first!.expected.menus).toHaveLength(1);
    expect(other!.actual.menus[0]!.picked).toBe(1);
  });
});
