// Flow on the program engine (#696): scenes and branches, labels, diverts
// with fixed and variable targets, visit and turn counts, alternators,
// threads and tunnels run as statement chunks, compared with the current
// engine; the symbols, the definitions and the counts they rest on; the chunk
// store on the compiler's persistent table and its reseed.
import "../../inkjs/engine/Container";
import { afterEach, describe, expect, it } from "vitest";
import { shuffleDraws } from "../../inkjs/engine/Story";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { OP_NAMES, Op } from "../../program/ProgramInstructions";
import type { ProgramRoot } from "../../program/ProgramRoot";
import {
  SymbolKind,
  countIdOf,
  isAnonymousSymbol,
} from "../../program/ProgramSymbols";
import { ProgramStory } from "../../program/ProgramStory";
import {
  HEADER_WORDS,
  blockCount,
  chunkId,
  type StatementChunk,
} from "../../program/StatementChunk";
import { flowScreenplay } from "./flowScreenplay";
import {
  compileScript,
  describeRoot,
  MAIN_URI,
  programCompiler,
  rootChunks,
  storyBeats,
} from "./programHarness";

// The shuffle draws both engines take, from one seeded stream each run, so a
// shuffle picks the same arms on both (`shuffleDraws`).
const injectDraws = () => {
  let s = 0x696;
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

/** What a script shows on each engine, from its top or from scene `from`,
 *  with the same shuffle draws, and the program's root. */
const bothEngines = (text: string, from?: string) =>
  silence(() => {
    const { program } = compileScript(text, { programChunks: true });
    expect(program.fallback).toBeUndefined();
    const current = compileScript(text);
    injectDraws();
    current.story.ResetState();
    const expected = storyBeats(current.story, from);
    injectDraws();
    const actual = storyBeats(new ProgramStory(program.chunks!), from);
    return { expected, actual, root: program.chunks! };
  });

/** The texts of a run's beats. */
const texts = (run: { beats: { text: string }[] }) =>
  run.beats.map((beat) => beat.text.trim());

/** The names of the instructions a root's chunks hold. */
const opsOf = (root: ProgramRoot): Set<string> => {
  const reader = new BinaryProgramReader(root);
  const out = new Set<string>();
  for (const chunk of rootChunks(root)) {
    for (const { op } of reader.instructions(chunk)) {
      out.add(OP_NAMES[op]!);
    }
  }
  return out;
};

/** The chunks of a root whose code holds instruction `op` with operand
 *  `arg`, when one is given. */
const chunksWith = (root: ProgramRoot, op: number, arg?: number): StatementChunk[] => {
  const reader = new BinaryProgramReader(root);
  return rootChunks(root).filter((chunk) =>
    [...reader.instructions(chunk)].some(
      (i) => i.op === op && (arg === undefined || i.arg === arg),
    ),
  );
};

const symbolOf = (root: ProgramRoot, name: string): number => {
  const id = root.table.symbolIds.get(name);
  expect(id, name).toBeDefined();
  return id!;
};

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
      return silence(() => c.compile().program);
    },
    get text() {
      return current;
    },
  };
};

describe("flows on the program engine", () => {
  it("runs a divert into the middle of a scene from another scene, counting the scene it enters", () => {
    const { expected, actual, root } = bothEngines(
      [
        "-> A",
        "scene A",
        "  In A {A}.",
        "  -> B.mid",
        "end",
        "scene B",
        "  B's start, not shown.",
        "  label mid",
        "  B's middle {B} {mid} {A}.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    expect(texts(actual)).toEqual(["In A 1.", "B's middle 1 1 1."]);
    expect(opsOf(root)).toContain("JumpSym");
    expect(opsOf(root)).toContain("Visit");
    expect(opsOf(root)).toContain("GetCount");
  });

  it("runs a divert to the target a variable holds", () => {
    const { expected, actual, root } = bothEngines(
      [
        "store target = -> there",
        "-> here",
        "scene here",
        "  Here.",
        "  -> target",
        "end",
        "scene there",
        "  There {there}.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    expect(texts(actual)).toEqual(["Here.", "There 1."]);
    expect(opsOf(root)).toContain("JumpVar");
    expect(opsOf(root)).toContain("Sym");
  });

  it("runs a tunnel that returns, and one that returns onward to a named target", () => {
    const { expected, actual, root } = bothEngines(
      [
        "-> main",
        "scene main",
        "  Start.",
        "  -> back ->",
        "  Returned {back}.",
        "  -> A ->",
        "  Never shown.",
        "  done",
        "end",
        "scene back",
        "  In back.",
        "  ->->",
        "end",
        "scene A",
        "  In A.",
        "  ->-> B",
        "end",
        "scene B",
        "  In B {A} {B}.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    expect(texts(actual)).toEqual(["Start.", "In back.", "Returned 1.", "In A.", "In B 1 1."]);
    expect(opsOf(root)).toContain("TunnelReturn");
    expect(chunksWith(root, Op.Call).length).toBeGreaterThan(0);
  });

  it("runs a thread that forks inside a scene, and resumes the scene when the thread is done", () => {
    const { expected, actual, root } = bothEngines(
      [
        "-> main",
        "scene main",
        "  Before.",
        "  <- side",
        "  After {side}.",
        "  <- side",
        "  Again {side}.",
        "  done",
        "end",
        "scene side",
        "  In side.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    expect(texts(actual)).toEqual(["Before.", "In side.", "After 1.", "In side.", "Again 2."]);
    expect(opsOf(root)).toContain("Thread");
    // A state saved while the fork runs holds the thread it suspended, and
    // resumes it when the fork is done.
    const story = new ProgramStory(root);
    expect(story.Continue()).toBe("Before.\n");
    expect(story.Continue()).toBe("In side.\n");
    const saved = story.state.toJson();
    const loaded = new ProgramStory(root);
    loaded.state.LoadJson(saved);
    expect(texts(storyBeats(loaded))).toEqual(["After 1.", "In side.", "Again 2."]);
  });

  // The thread's `done` ends the thread and not the continue, and a continue
  // returns at its line's newline, so the assignment after the first line
  // has not run when the first line is returned, on either engine.
  it("returns the first line of two with a thread between them before the assignment after it", () => {
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
      }
    });
  });

  it("runs every kind of alternator, inline, glued, on one line and as a block, as the current engine does", () => {
    const kinds = ["queue", "cycle", "chain", "shuffle queue", "shuffle cycle", "shuffle chain", "shuffle"];
    const lines = ["-> main", "scene main", "  label start", "  & i = i + 1"];
    kinds.forEach((kind, k) => {
      lines.push(`  Inline ${k} {${kind}|"A"|"B"|"C"}.`);
      lines.push(`  Glued ${k} .. ${kind}|A|B|C .. after.`);
      lines.push(`  ${kind} | One ${k}. | Two ${k}. | Three ${k}. end`);
      lines.push(`  ${kind}`, `    | First ${k}.`, `    | Second ${k}.`, "  end");
    });
    lines.push("  Tagged .. queue|red # red|blue # blue .. sequence.");
    lines.push("  if i < 5 then", "    -> start", "  end", "  done", "end", "store i = 0", "");
    const { expected, actual, root } = bothEngines(lines.join("\n"));
    expect(actual).toEqual(expected);
    expect(actual.beats.length).toBeGreaterThan(40);
    for (const op of ["Visit", "VisitIndex", "ShuffleIndex", "Tag"]) {
      expect(opsOf(root), op).toContain(op);
    }
  });

  it("picks different arms of a shuffle without the injected draws only as its seed says", () => {
    // Without injection each engine seeds a shuffle its own way: the program
    // engine from the alternator's symbol, which a compile does not renumber,
    // so two runs of one root pick the same arms.
    const text = [
      "-> main",
      "scene main",
      "  label start",
      "  & i = i + 1",
      '  {shuffle|"A"|"B"|"C"|"D"|"E"}',
      "  if i < 8 then",
      "    -> start",
      "  end",
      "  done",
      "end",
      "store i = 0",
      "",
    ].join("\n");
    silence(() => {
      const { program } = compileScript(text, { programChunks: true });
      const run = () => {
        const story = new ProgramStory(program.chunks!);
        story.state.storySeed = 3;
        return texts(storyBeats(story));
      };
      expect(run()).toEqual(run());
    });
  });

  describe("counts", () => {
    // #653: the bottom line reads one label's count, then the other's.
    for (const label of ["alpha", "beta"]) {
      it(`agree with the current engine when the bottom line reads {main.${label}}`, () => {
        const { expected, actual } = bothEngines(
          [
            "-> main",
            "scene main",
            "  label alpha",
            "  & n = n + 1",
            "  label beta",
            "  if n < 3 then",
            "    -> alpha",
            "  end",
            "  if n < 4 then",
            "    & n = n + 1",
            "    -> beta",
            "  end",
            `  Counted {main.${label}}.`,
            "  done",
            "end",
            "store n = 0",
            "",
          ].join("\n"),
        );
        expect(actual).toEqual(expected);
        expect(texts(actual)).toEqual([`Counted ${label === "alpha" ? 3 : 4}.`]);
      });
    }

    it("count a flow entered by a jump into its middle", () => {
      const { expected, actual } = bothEngines(
        [
          "-> outside",
          "scene outside",
          "  -> inside.middle",
          "end",
          "scene inside",
          "  Not shown.",
          "  label middle",
          "  Inside {inside}, middle {middle}.",
          "  done",
          "end",
          "",
        ].join("\n"),
      );
      expect(actual).toEqual(expected);
      expect(texts(actual)).toEqual(["Inside 1, middle 1."]);
    });

    it("do not count a flow again for a jump from inside it to its own first statement", () => {
      const { expected, actual } = bothEngines(
        [
          "-> main",
          "scene main",
          "  & k = k + 1",
          "  Pass {k}: {main}.",
          "  if k < 3 then",
          "    -> main",
          "  end",
          "  done",
          "end",
          "store k = 0",
          "",
        ].join("\n"),
      );
      expect(actual).toEqual(expected);
      expect(texts(actual)).toEqual(["Pass 1: 1.", "Pass 2: 1.", "Pass 3: 1."]);
    });

    it("count a label passed once by falling through and once by a jump", () => {
      const { expected, actual } = bothEngines(
        [
          "-> main",
          "scene main",
          "  label here",
          "  Here {here}.",
          "  if not again then",
          "    & again = true",
          "    -> here",
          "  end",
          "  done",
          "end",
          "store again = false",
          "",
        ].join("\n"),
      );
      expect(actual).toEqual(expected);
      expect(texts(actual)).toEqual(["Here 1.", "Here 2."]);
    });

    it("count a branch and its scene, a scene that starts with a branch, and turns since, read through the language", () => {
      const { expected, actual, root } = bothEngines(
        [
          "store spot = -> hall.lobby",
          "-> hall.lobby ->",
          "-> hall.lobby ->",
          "-> hall ->",
          "Lobby {hall.lobby}, hall {hall}, turns {count.turns(-> hall.lobby)}, read {READ_COUNT(spot)} {count.visits(-> hall)} {count.visited(-> hall.lobby)}.",
          "done",
          "",
          "scene hall",
          "  branch lobby",
          "    In the lobby.",
          "    ->->",
          "  end",
          "end",
          "",
        ].join("\n"),
      );
      expect(actual).toEqual(expected);
      expect(texts(actual).at(-1)).toBe("Lobby 3, hall 3, turns 0, read 3 3 true.");
      expect(opsOf(root)).toContain("CountOf");
    });

    it("include the visits made before a reference to them existed, and a reference added in another flow emits no chunk of the counted flow", () => {
      const text = [
        "-> main",
        "scene main",
        "  label visit",
        "  & k = k + 1",
        "  if k < 3 then",
        "    -> visit",
        "  end",
        "  -> reader",
        "end",
        "scene reader",
        "  Reader.",
        "  done",
        "end",
        "store k = 0",
        "",
      ].join("\n");
      const s = session(text);
      const first = s.first.chunks!;
      const game = new ProgramStory(first);
      expect(game.Continue()).toBe("Reader.\n");
      const saved = game.state.toJson();
      const flowChunks = (root: ProgramRoot) => {
        const flow = root.flowNamed("main")!;
        const out: StatementChunk[] = [];
        const walk = (chunks: readonly StatementChunk[]) => {
          for (const chunk of chunks) {
            out.push(chunk);
            for (let k = 0; k < blockCount(chunk); k += 1) {
              walk(root.body(chunk, k)?.arrays.chunks ?? []);
            }
          }
        };
        walk(flow.arrays.chunks);
        return out;
      };
      const edited = s.edit("  Reader.", "  Reader {main.visit}.");
      expect(edited.fallback).toBeUndefined();
      const after = edited.chunks!;
      // Every chunk of the counted flow is the one the first compile emitted.
      const before = flowChunks(first);
      expect(before.length).toBeGreaterThan(3);
      flowChunks(after).forEach((chunk, i) => expect(chunk).toBe(before[i]));
      // The visits counted while nothing read them are there to read.
      const resumed = new ProgramStory(after);
      resumed.state.LoadJson(saved);
      expect(resumed.state.VisitCount(countIdOf(after.table, symbolOf(after, "main.visit")))).toBe(3);
      resumed.ChoosePathString("reader");
      expect(resumed.Continue()).toBe("Reader 3.\n");
    });
  });

  // The design's rule (docs/engine/binary-program.md, section 5): the jump
  // lands in the innermost body, and each body that runs out resumes its
  // owner, so the loop it landed in goes on for its passes. The current
  // engine, entered at a label in an `if` inside a `while` body, leaves the
  // loop when the label's branch ends ("Target 0 1.", "After the loop 0.").
  it("rebuilds the block stack and the scopes of a jump that lands inside blocks, and runs on to the end of each of them", () => {
    const { program } = silence(() =>
      compileScript(
        [
        "-> outer",
        "scene outer",
        "  Outer.",
        "  -> inner.target",
        "end",
        "scene inner",
        "  Not shown.",
        "  if true then",
        "    Not shown either.",
        "    while i < 3 do",
        "      & i = i + 1",
        "      if i == 2 then",
        "        label target",
        "        Target {i} {target}.",
        "      end",
        "      Body end {i}.",
        "    end",
        "    After the loop {i}.",
        "  end",
        "  After the if.",
        "  done",
        "end",
        "store i = 0",
        "",
        ].join("\n"),
        { programChunks: true },
      ),
    );
    expect(program.fallback).toBeUndefined();
    const root = program.chunks!;
    expect(texts(storyBeats(new ProgramStory(root)))).toEqual([
      "Outer.",
      "Target 0 1.",
      "Body end 0.",
      "Body end 1.",
      "Target 2 2.",
      "Body end 2.",
      "Body end 3.",
      "After the loop 3.",
      "After the if.",
    ]);
    // Where the jump lands, the frame holds its own scope and one for each
    // block it stands in: the outer `if`'s branch, the `while`'s pass and
    // the inner `if`'s branch.
    const story = new ProgramStory(root);
    expect(story.Continue()).toBe("Outer.\n");
    expect(story.Continue()).toBe("Target 0 1.\n");
    expect(story.state.blockStack).toHaveLength(3);
    expect(story.state.frame!.temporaryScopes).toHaveLength(4);
    // The label stands three blocks deep: an `if`, a `while` and an `if`.
    const target = symbolOf(root, "inner.target");
    const at = root.place(target)!;
    let depth = 0;
    for (let row = at.sequence; row.owner >= 0; depth += 1) {
      row = root.position(row.owner)!.sequence;
    }
    expect(depth).toBe(3);
  });

  it("runs a jump to a target the program does not define as the current engine's runtime error, at the jump's line", () => {
    const text = ["-> main", "scene main", "  Before.", "  -> nowhere", "end", ""].join("\n");
    const { program } = silence(() => compileScript(text, { programChunks: true }));
    expect(program.fallback).toBeUndefined();
    const messages = Object.values(program.diagnostics ?? {})
      .flat()
      .map((d: any) => d.message?.value ?? d.message);
    expect(messages).toContain("target not found: `-> nowhere`");
    const run = storyBeats(new ProgramStory(program.chunks!));
    expect(texts(run)).toEqual(["Before."]);
    expect(run.errors).toEqual(["1: RUNTIME ERROR: 'main' line 4: Divert target not found."]);
  });

  it("keeps the referring chunk before its target disappears, while it is gone and after it returns", () => {
    const target = "scene other\n  Other.\n  done\nend\n";
    const text = ["-> main", "scene main", "  Before.", "  -> other", "end", target].join("\n");
    const s = session(text);
    const symbol = symbolOf(s.first.chunks!, "other");
    const referring = chunksWith(s.first.chunks!, Op.JumpSym, symbol);
    expect(referring).toHaveLength(1);
    const gone = s.edit(target, "");
    expect(gone.fallback).toBeUndefined();
    expect(chunksWith(gone.chunks!, Op.JumpSym, symbol)[0]).toBe(referring[0]);
    expect(gone.chunks!.definition(symbol)).toBeUndefined();
    expect(storyBeats(new ProgramStory(gone.chunks!)).errors).toEqual([
      "1: RUNTIME ERROR: 'main' line 4: Divert target not found.",
    ]);
    const back = s.edit("  -> other\nend\n", `  -> other\nend\n${target}`);
    expect(chunksWith(back.chunks!, Op.JumpSym, symbol)[0]).toBe(referring[0]);
    expect(texts(storyBeats(new ProgramStory(back.chunks!)))).toEqual(["Before.", "Other."]);
  });

  // Round 1 of the review of #1431: a jump keeps the bindings of the blocks
  // it stays in.
  it("keeps the locals of the blocks a jump stays in", () => {
    const { expected, actual } = bothEngines(
      [
        "-> main",
        "scene main",
        "  if true then",
        "    local x = 7",
        "    -> here",
        "    label here",
        "    Value {x}.",
        "  end",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    expect(texts(actual)).toEqual(["Value 7."]);
  });

  // Round 1 of the review of #1431: an onward return leaves from the caller
  // the tunnel returned to, so it does not count the caller's flow again.
  it("counts an onward return to the caller's own flow from the caller", () => {
    const { expected, actual } = bothEngines(
      [
        "-> main",
        "scene main",
        "  -> side ->",
        "  label after",
        "  Visits {main}.",
        "  done",
        "end",
        "scene side",
        "  ->-> main.after",
        "end",
        "",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    expect(texts(actual)).toEqual(["Visits 1."]);
  });

  // Round 1 of the review of #1431: a checkpoint drains visits and turns
  // apart, and fills the count slots of a state saved without them.
  it("hands a checkpoint its visit and turn deltas apart, and restores counts it injects into a state saved without them", () => {
    const { program } = silence(() =>
      compileScript(
        [
          "-> main",
          "scene main",
          "  label top",
          "  & n = n + 1",
          "  Pass {n}, {top}.",
          "  if n < 2 then",
          "    -> top",
          "  end",
          "  done",
          "end",
          "store n = 0",
          "",
        ].join("\n"),
        { programChunks: true },
      ),
    );
    const root = program.chunks!;
    const story = new ProgramStory(root);
    expect(story.Continue()).toBe("Pass 1, 1.\n");
    const visits = story.state.DrainVisitCountDeltas();
    const turns = story.state.DrainTurnIndexDeltas();
    expect(visits).toContainEqual(["main.top", 1]);
    expect(turns.map(([key]) => key)).toContain("main.top");
    expect(story.state.DrainVisitCountDeltas()).toEqual([]);
    expect(story.Continue()).toBe("Pass 2, 2.\n");
    // As `CheckpointStore.injectCounts` fills a state saved without counts.
    const bare = story.state.ToJsonWithoutCounts();
    expect(bare).toContain('"visitCounts":{}');
    expect(bare).toContain('"turnIndices":{}');
    const injected = bare
      .replace(
        '"visitCounts":{}',
        `"visitCounts":${JSON.stringify(Object.fromEntries(story.state.GetVisitCountEntries()))}`,
      )
      .replace(
        '"turnIndices":{}',
        `"turnIndices":${JSON.stringify(Object.fromEntries(story.state.GetTurnIndexEntries()))}`,
      );
    const loaded = new ProgramStory(root);
    loaded.state.LoadJson(injected);
    const top = countIdOf(root.table, symbolOf(root, "main.top"));
    expect(loaded.state.VisitCount(top)).toBe(2);
    expect(loaded.state.TurnsSince(top)).toBe(story.state.TurnsSince(top));
  });

  // Round 1 of the review of #1431: the current engine's weave nests a label
  // as the first content of the label written right before it, and a jump
  // to the second counts the first as it enters its container at its start.
  it("counts the labels written right before the label a jump lands on, as the current engine does", () => {
    const { expected, actual } = bothEngines(
      [
        "-> main.beta",
        "scene main",
        "  label alpha",
        "  label beta",
        "  Counts {alpha} {beta}.",
        "  label gamma",
        "  label delta",
        "  & n = n + 1",
        "  Then {alpha} {beta} {gamma} {delta}.",
        "  if n < 2 then",
        "    -> delta",
        "  end",
        "  done",
        "end",
        "store n = 0",
        "",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    expect(texts(actual)).toEqual(["Counts 1 1.", "Then 1 1 1 1.", "Then 1 1 2 2."]);
  });

  // Round 1 of the review of #1431: a host's evaluation of a scene that
  // starts with a branch runs the branch and counts it, as the current
  // engine does.
  it("counts the first branch a host's evaluation of its scene runs", () => {
    const text = [
      "scene hall",
      "  branch lobby",
      "    Lobby {hall.lobby} {hall}.",
      "    ->->",
      "  end",
      "end",
      "",
    ].join("\n");
    silence(() => {
      const { program } = compileScript(text, { programChunks: true });
      expect(program.fallback).toBeUndefined();
      const current = compileScript(text).story;
      current.ResetState();
      const expected = current.EvaluateFunction("hall", [], true);
      const actual = new ProgramStory(program.chunks!).EvaluateFunction("hall", [], true);
      expect(actual).toEqual(expected);
      expect(actual.output).toBe("Lobby 1 0.\n");
    });
  });

  // Round 1 of the review of #1431: a label's chunk holds no function's code,
  // so an edit that adds a label runs no declaration again.
  it("runs no declaration again for an edit that adds a label", () => {
    const s = session(
      ["store x = 1", "-> main", "scene main", "  Line {x}.", "  done", "end", ""].join("\n"),
    );
    const store = s.compiler.chunkStore!;
    const before = store.initializerRuns;
    const edited = s.edit("  Line {x}.", "  label extra\n  Line {x}.");
    expect(edited.fallback).toBeUndefined();
    expect(chunksWith(edited.chunks!, Op.Visit)).toHaveLength(1);
    expect(store.initializerRuns).toBe(before);
  });

  // Round 1 of the review of #1431: a label an author names as a loop's
  // lowering names its own labels is the author's label, and a jump to it
  // records the symbol it names, so renaming the scene emits the jump again.
  it("keeps an authored label named like a loop's own as a label of its flow through a rename", () => {
    const text = [
      "-> A",
      "scene A",
      "  label __while_user_loop",
      "  & n = n + 1",
      "  Pass {n}.",
      "  if n < 2 then",
      "    -> __while_user_loop",
      "  end",
      "  done",
      "end",
      "store n = 0",
      "",
    ].join("\n");
    const s = session(text);
    expect(texts(storyBeats(new ProgramStory(s.first.chunks!)))).toEqual(["Pass 1.", "Pass 2."]);
    const coldOf = () =>
      silence(() =>
        programCompiler({ [MAIN_URI]: s.text }, { programChunks: true }).compile().program,
      );
    const renamed = s.edit("-> A\nscene A", "-> B\nscene B");
    expect(describeRoot(renamed.chunks!)).toEqual(describeRoot(coldOf().chunks!));
    expect(texts(storyBeats(new ProgramStory(renamed.chunks!)))).toEqual(["Pass 1.", "Pass 2."]);
    // The label's chunk is kept by the next compile, which edits another
    // line.
    const label = chunksWith(renamed.chunks!, Op.Visit)[0];
    const next = s.edit("Pass {n}.", "Pass {n}!");
    expect(chunksWith(next.chunks!, Op.Visit)[0]).toBe(label);
    expect(describeRoot(next.chunks!)).toEqual(describeRoot(coldOf().chunks!));
    expect(texts(storyBeats(new ProgramStory(next.chunks!)))).toEqual(["Pass 1!", "Pass 2!"]);
  });

  // Round 1 of the review of #1431: an alternator keeps its count symbol
  // when the line that writes it is edited, so a saved count reads on.
  it("keeps an alternator's count when the statement that writes it is edited", () => {
    const s = session(['scene main', '  Pick {queue|"one"|"two"}.', "  done", "end", ""].join("\n"));
    const first = s.first.chunks!;
    const game = new ProgramStory(first);
    game.ChoosePathString("main");
    expect(game.Continue()).toBe("Pick one.\n");
    while (game.canContinue) {
      game.Continue();
    }
    const saved = game.state.toJson();
    const alternatorOf = (root: ProgramRoot) =>
      chunksWith(root, Op.VisitIndex).map(
        (chunk) =>
          [...new BinaryProgramReader(root).instructions(chunk)].find(
            (i) => i.op === Op.VisitIndex,
          )!.arg,
      );
    const before = alternatorOf(first);
    const edited = s.edit("  Pick", "  Selection").chunks!;
    expect(alternatorOf(edited)).toEqual(before);
    const resumed = new ProgramStory(edited);
    resumed.state.LoadJson(saved);
    resumed.ChoosePathString("main");
    expect(resumed.Continue()).toBe("Selection two.\n");
  });

  it("re-emits, for a renamed scene, the chunks that refer to it and no other", () => {
    const text = [
      "-> place",
      "scene place",
      "  label top",
      "  Top {top}.",
      "  & seen = seen + 1",
      "  if seen < 2 then",
      "    -> top",
      "  end",
      "  Plain line.",
      "  done",
      "end",
      "store seen = 0",
      "",
    ].join("\n");
    const s = session(text);
    const before = new Set(rootChunks(s.first.chunks!));
    const renamed = s.edit("scene place", "scene spot");
    // The edit leaves the top-level divert without its target.
    expect(renamed.fallback).toBeUndefined();
    const cold = silence(() =>
      programCompiler({ [MAIN_URI]: s.text }, { programChunks: true }).compile().program,
    );
    expect(describeRoot(renamed.chunks!)).toEqual(describeRoot(cold.chunks!));
    const emitted = rootChunks(renamed.chunks!).filter((chunk) => !before.has(chunk));
    // The label, the count of it and the jump to it name the scene's new name.
    const reader = new BinaryProgramReader(renamed.chunks!);
    const names = emitted.map((chunk) =>
      [...reader.instructions(chunk)]
        .filter((i) => [Op.Visit, Op.GetCount, Op.JumpSym].includes(i.op as never))
        .map((i) => renamed.chunks!.table.symbols[i.arg])
        .join(" "),
    );
    expect(names.sort()).toEqual(["spot.top", "spot.top", "spot.top"]);
  });
});

describe("symbols", () => {
  it("interns scenes, branches and labels with their kind and a count id, and resolves each through the root's definition arrays", () => {
    const { program } = silence(() =>
      compileScript(
        [
          "-> hall",
          "scene hall",
          "  Hall.",
          "  label door",
          "  Door.",
          "  -> hall.cellar",
          "  branch cellar",
          "    Cellar.",
          "    done",
          "  end",
          "end",
          "",
        ].join("\n"),
        { programChunks: true },
      ),
    );
    const root = program.chunks!;
    const counted = new Set<number>();
    for (const [name, kind] of [
      ["hall", SymbolKind.Scene],
      ["hall.cellar", SymbolKind.Branch],
      ["hall.door", SymbolKind.Label],
    ] as const) {
      const symbol = symbolOf(root, name);
      expect(root.kindOf(symbol), name).toBe(kind);
      const id = countIdOf(root.table, symbol);
      expect(id, name).toBeGreaterThanOrEqual(0);
      counted.add(id);
    }
    expect(counted.size).toBe(3);
    expect(root.parentOf(symbolOf(root, "hall.cellar"))).toBe(symbolOf(root, "hall"));
    // A label is defined where its chunk exports it, at its `Visit`.
    const door = symbolOf(root, "hall.door");
    const at = root.place(door)!;
    const chunk = at.sequence.arrays.chunks[at.entry]!;
    expect(chunk[HEADER_WORDS + at.offset]! & 0xff).toBe(Op.Visit);
    expect(chunk[HEADER_WORDS + at.offset + 1]).toBe(door);
    expect(root.definition(door)).toEqual({
      sequence: at.sequence.id,
      entry: at.entry,
      offset: at.offset,
    });
    // An alternator's symbol is anonymous.
    expect(isAnonymousSymbol(root.table, door)).toBe(false);
  });

  it("falls back for a label named as another flow's symbol", () => {
    const { program } = silence(() =>
      compileScript(
        ["-> hall", "scene hall", "  label cellar", "  Hall.", "  branch cellar", "    Cellar.", "  end", "end", ""].join("\n"),
        { programChunks: true },
      ),
    );
    expect(program.fallback?.construct).toBe("a label named as another");
  });
});

describe("the chunk store's table", () => {
  it("is the compiler's persistent table, and a reseed between two compiles leaves a game on the first root reading its own generation", () => {
    const text = [
      "store where = -> there",
      "-> here",
      "scene here",
      "  Here {here}.",
      "  Still here.",
      "  -> where",
      "end",
      "scene there",
      "  There {there}.",
      "  done",
      "end",
      "",
    ].join("\n");
    const s = session(text);
    const compiler = s.compiler as any;
    const store = s.compiler.chunkStore!;
    expect(store.table).toBe(compiler._binaryTable);
    const first = s.first.chunks!;
    const game = new ProgramStory(first);
    expect(game.Continue()).toBe("Here 1.\n");
    const strings = first.table.strings;
    const generation = first.generation;
    const there = symbolOf(first, "there");
    // The table grows past what `maybeReseedBinaryTable` bounds it at, and
    // the compiler reseeds it.
    const grown = strings.length * 2 + 600;
    for (let i = 0; i < grown; i += 1) {
      store.table.strings.push(`unused ${i}`);
    }
    compiler.maybeReseedBinaryTable();
    expect(store.table.generation).toBe(generation + 1);
    expect(first.table.strings).toBe(strings);
    expect(store.table.strings).not.toBe(strings);
    // The next compile emits every chunk again.
    const next = s.edit("  Still here.", "  Still here!");
    const second = next.chunks!;
    expect(second.generation).toBe(generation + 1);
    const old = new Set(rootChunks(first));
    expect(rootChunks(second).some((chunk) => old.has(chunk))).toBe(false);
    expect(s.compiler.lastProgramBuild?.coverage.emitted).toBe(
      s.compiler.lastProgramBuild?.coverage.statements,
    );
    // The symbols are remapped through the reseed's arrays.
    expect(second.symbolFrom(there, generation)).toBe(symbolOf(second, "there"));
    // The game on the first root runs on as it would have.
    expect(game.Continue()).toBe("Still here.\n");
    expect(game.Continue()).toBe("There 1.\n");
    // A game on the second root runs the edit.
    expect(texts(storyBeats(new ProgramStory(second)))).toEqual(["Here 1.", "Still here!", "There 1."]);
    expect(chunkId(rootChunks(second)[0]!)).toBeGreaterThan(Math.max(...rootChunks(first).map(chunkId)));
  });

  // Round 1 of the review of #1431: a reseed that drops a symbol moves the
  // ids after it, and a state saved before the reseed loads its counts
  // through the remap, an alternator's anonymous count among them.
  it("moves the ids a reseed renumbers, and loads the counts a state saved before it holds", () => {
    const early = "scene early\n  Early.\n  done\nend\n";
    const s = session(
      ["-> here", early + "scene here", "  label top", '  Pick {cycle|"a"|"b"} {top}.', "  done", "end", ""].join("\n"),
    );
    const compiler = s.compiler as any;
    const store = s.compiler.chunkStore!;
    const before = s.edit(early, "").chunks!;
    const generation = before.generation;
    const top = symbolOf(before, "here.top");
    const game = new ProgramStory(before);
    expect(texts(storyBeats(game))).toEqual(["Pick a 1."]);
    const saved = game.state.toJson();
    const grown = store.table.strings.length * 2 + 600;
    for (let i = 0; i < grown; i += 1) {
      store.table.strings.push(`unused ${i}`);
    }
    compiler.maybeReseedBinaryTable();
    expect(store.table.generation).toBe(generation + 1);
    const after = s.edit("  Pick", "  Picked").chunks!;
    expect(after.generation).toBe(generation + 1);
    // `early` is gone, so the ids after it move.
    const moved = symbolOf(after, "here.top");
    expect(moved).not.toBe(top);
    expect(after.symbolFrom(top, generation)).toBe(moved);
    const resumed = new ProgramStory(after);
    resumed.state.LoadJson(saved);
    expect(resumed.state.VisitCount(countIdOf(after.table, moved))).toBe(1);
    resumed.ChoosePathString("here");
    expect(resumed.Continue()).toBe("Picked b 2.\n");
  });
});

describe("the flow screenplay", () => {
  it("runs each scene as the current engine does", () => {
    const text = flowScreenplay(3);
    for (const scene of ["FLOW_0", "FLOW_1", "FLOW_2", "ENDING"]) {
      const { expected, actual } = bothEngines(text, scene);
      expect(actual).toEqual(expected);
      expect(expected.beats.length).toBeGreaterThan(0);
      expect(expected.errors).toEqual([]);
    }
  });
});
