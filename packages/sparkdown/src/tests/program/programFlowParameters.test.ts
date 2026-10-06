// Flow parameters on the program engine (#1436): a scene or a branch that
// declares parameters binds them where it is entered, and a divert, a tunnel,
// a thread or an onward return passes them its arguments, compared with the
// current engine; a jump into the middle of such a flow binds none; and a
// change to a flow's parameter list emits again exactly the chunks that pass
// it arguments.
import "../../inkjs/engine/Container";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { shuffleDraws } from "../../inkjs/engine/Story";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { ChunkStore, type FlowSource } from "../../program/ChunkStore";
import { FACT_PARAMS, PARAM_REFERENCE, PARAM_VALUE } from "../../program/ProgramFacts";
import { Op } from "../../program/ProgramInstructions";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import type { StatementChunk } from "../../program/StatementChunk";
import {
  compileScript,
  describeRoot,
  MAIN_URI,
  programCompiler,
  rootChunks,
  storyRun,
} from "./programHarness";

const FIXTURES = join(__dirname, "..", "runtime", "fixtures");

const injectDraws = () => {
  let s = 0x1436;
  shuffleDraws.next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff);
};

afterEach(() => {
  shuffleDraws.next = null;
});

const silence = <T>(run: () => T): T => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

/** What a script shows on each engine from its top, taking the choices
 *  `picks` names at its menus, and the program's root. */
const bothEngines = (text: string, picks: number[] = []) =>
  silence(() => {
    const { program } = compileScript(text, { programChunks: true });
    expect(program.fallback).toBeUndefined();
    const current = compileScript(text);
    injectDraws();
    current.story.ResetState();
    const expected = storyRun(current.story, picks);
    injectDraws();
    const actual = storyRun(new ProgramStory(program.chunks!), picks);
    return { expected, actual, root: program.chunks! };
  });

const texts = (run: { beats: { text: string }[] }) =>
  run.beats.map((beat) => beat.text.trim());

/** The chunks of a root whose code holds instruction `op`. */
const chunksWith = (root: ProgramRoot, op: number): StatementChunk[] => {
  const reader = new BinaryProgramReader(root);
  return rootChunks(root).filter((chunk) =>
    [...reader.instructions(chunk)].some((i) => i.op === op),
  );
};

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
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

const cold = (text: string) =>
  silence(() => programCompiler({ [MAIN_URI]: text }, { programChunks: true }).compile().program);

describe("the fixtures that fell back for a flow's parameters", () => {
  // Every shared fixture that declared a flow with parameters fell back,
  // naming `Argument`, before #1436.
  for (const fixture of [
    "builtins/read-count-variable-target.sd",
    "diverts/complex-tunnels.sd",
    "diverts/divert-targets-with-parameters.sd",
    "diverts/tunnel-onwards-divert-after-with-arg.sd",
    "diverts/tunnel-onwards-variable-target.sd",
    "diverts/tunnel-onwards-with-param-default-choice.sd",
    "multiflow/multi-flow-save-load-threads.sd",
  ]) {
    it(`runs ${fixture} from its chunks as the current engine does`, () => {
      const text = readFileSync(join(FIXTURES, fixture), "utf8");
      for (const picks of [[], [1], [2]]) {
        const { expected, actual } = bothEngines(text, picks);
        expect(actual).toEqual(expected);
      }
    });
  }
});

describe("a flow's parameters on the program engine", () => {
  it("binds them for a divert, a tunnel and a thread to the flow, and not for a jump into its middle", () => {
    const { expected, actual } = bothEngines(
      [
        "-> start",
        "scene start",
        "  -> visit(\"tunnel\") ->",
        "  <- forked(\"thread\")",
        "  -> visit(\"divert\")",
        "end",
        "scene visit(how)",
        "  Visit by {how}.",
        "  if how == \"tunnel\" then",
        "    ->->",
        "  end",
        "  how = \"kept\"",
        "  label middle",
        "  Middle {how}.",
        "  -> again",
        "end",
        "scene again",
        "  & passes = passes + 1",
        "  if passes < 2 then",
        "    -> visit.middle",
        "  end",
        "  done",
        "end",
        "scene forked(name)",
        "  Forked by {name}.",
        "  done",
        "end",
        "store passes = 0",
        "",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    // The divert binds `how`; the jump to `middle` binds nothing, so the
    // flow's `how` is the one the divert's pass assigned.
    expect(texts(actual)).toEqual([
      "Visit by tunnel.",
      "Forked by thread.",
      "Visit by divert.",
      "Middle kept.",
      "Middle kept.",
    ]);
  });

  it("binds a branch's parameters, and a scene's before it enters its first branch", () => {
    const { expected, actual } = bothEngines(
      [
        "-> outer(1)",
        "scene outer(a)",
        "  branch inner",
        "    Inner {a}.",
        "    -> second(a + 1, \"b\")",
        "  end",
        "  branch second(n, s)",
        "    Second {n} {s}.",
        "    done",
        "  end",
        "end",
        "",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    expect(texts(actual)).toEqual(["Inner 1.", "Second 2 b."]);
  });

  it("packs a variadic flow's arguments, padding a missing parameter with nil", () => {
    const { expected, actual } = bothEngines(
      [
        "-> many(1, 2, 3)",
        "scene many(a, ...)",
        "  Many {a} {select(\"#\", ...)}.",
        "  -> few",
        "end",
        "scene few",
        "  <- none",
        "  -> none",
        "end",
        "scene none(a, ...)",
        "  None {a} {select(\"#\", ...)}.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    // A thread and a divert that pass nothing pass nil and an empty `...`.
    expect(texts(actual)).toEqual(["Many 1 2.", "None nil 0.", "None nil 0."]);
  });

  it("passes an onward return's arguments to the flow it goes on to", () => {
    const { expected, actual } = bothEngines(
      [
        "-> start",
        "scene start",
        "  -> tunnel ->",
        "end",
        "scene tunnel",
        "  In the tunnel.",
        "  ->-> after(\"onward\", 2)",
        "end",
        "scene after(how, n)",
        "  After by {how} {n}.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(actual).toEqual(expected);
    expect(texts(actual)).toEqual(["In the tunnel.", "After by onward 2."]);
  });
});

describe("a flow's parameter list", () => {
  const text = [
    "-> start",
    "scene start",
    "  Start.",
    "  -> target(1) ->",
    "  Between.",
    "  -> target.middle",
    "end",
    "scene target(a)",
    "  Target {a}.",
    "  ->->",
    "  label middle",
    "  Middle.",
    "  -> other",
    "end",
    "scene other",
    "  -> target(2) ->",
    "  done",
    "end",
    "",
  ].join("\n");

  // The statements that pass the flow arguments read its parameters; the
  // flow's entry binds them; nothing else depends on them.
  for (const [what, after] of [
    ["a parameter added", "scene target(a, b)"],
    ["a variadic parameter", "scene target(a, ...)"],
  ] as const) {
    it(`emits again, for ${what}, the chunks that pass the flow arguments and its entry, and no other`, () => {
      const s = session(text);
      expect(s.first.fallback).toBeUndefined();
      const before = new Set(rootChunks(s.first.chunks!));
      const edited = s.edit("scene target(a)", after);
      expect(edited.fallback).toBeUndefined();
      expect(describeRoot(edited.chunks!)).toEqual(describeRoot(cold(s.text).chunks!));
      const emitted = rootChunks(edited.chunks!).filter((chunk) => !before.has(chunk));
      const reader = new BinaryProgramReader(edited.chunks!);
      const ops = (chunk: StatementChunk) =>
        [...reader.instructions(chunk)].map((i) => i.op);
      // The two tunnels that pass arguments, and the entry, which binds the
      // parameters and holds nothing else.
      expect(emitted).toHaveLength(3);
      const calls = chunksWith(edited.chunks!, Op.Call);
      expect(calls).toHaveLength(2);
      expect(calls.every((chunk) => emitted.includes(chunk))).toBe(true);
      const entry = emitted.filter((chunk) => !calls.includes(chunk));
      expect(entry.map(ops)).toEqual([[Op.SetVar, Op.SetVar]]);
    });
  }

  // No syntax declares a by-reference parameter (`lowerArguments` makes each
  // one a value), so the store's definition of the flow says it takes one,
  // as the parameter kinds a parser that read `ref` would give it.
  it("emits again, for a by-reference parameter, the chunks that pass the flow arguments, each with a pointer at its variable, and no other", () => {
    let kinds = PARAM_VALUE;
    class RefStore extends ChunkStore {
      protected override definitionFacts(flow: FlowSource) {
        const facts = super.definitionFacts(flow);
        return flow.name === "target" ? { ...facts, [FACT_PARAMS]: kinds } : facts;
      }
    }
    const source = [
      "store held = 1",
      "-> start",
      "scene start",
      "  -> target(held) ->",
      "  Between.",
      "  -> other",
      "end",
      "scene target(a)",
      "  Target.",
      "  ->->",
      "end",
      "scene other",
      "  -> target(held) ->",
      "  Plain line.",
      "  done",
      "end",
      "",
    ].join("\n");
    const c = programCompiler({ [MAIN_URI]: source }, { programChunks: true });
    const compiler = c.compiler as unknown as {
      _binaryTable: ChunkStore["table"];
      _chunkStore: ChunkStore;
    };
    compiler._chunkStore = new RefStore(compiler._binaryTable);
    const first = silence(() => c.compile().program);
    expect(first.fallback).toBeUndefined();
    const before = new Set(rootChunks(first.chunks!));
    expect(chunksWith(first.chunks!, Op.VarPtr)).toEqual([]);
    kinds = PARAM_REFERENCE;
    c.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        {
          range: {
            start: posAt(source, source.indexOf("Plain line.")),
            end: posAt(source, source.indexOf("Plain line.") + "Plain line.".length),
          },
          text: "Plain line, again.",
        },
      ],
    });
    const after = silence(() => c.compile().program);
    expect(after.fallback).toBeUndefined();
    const emitted = rootChunks(after.chunks!).filter((chunk) => !before.has(chunk));
    // The two tunnels that pass the flow arguments, and the edited line.
    expect(emitted).toHaveLength(3);
    const pointers = chunksWith(after.chunks!, Op.VarPtr);
    expect(pointers).toHaveLength(2);
    expect(pointers.every((chunk) => emitted.includes(chunk))).toBe(true);
  });
});
