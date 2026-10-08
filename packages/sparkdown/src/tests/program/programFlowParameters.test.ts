// Flow parameters on the program engine (#1436): a scene or a branch that
// declares parameters binds them where it is entered, and a divert, a tunnel,
// a thread or an onward return passes them its arguments; a jump into the
// middle of such a flow binds none; and a
// change to a flow's parameter list emits again exactly the chunks that pass
// it arguments.
import "../../inkjs/engine/Container";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { shuffleDraws } from "../../runtime/evaluation";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { ChunkStore, type FlowSource } from "../../program/ChunkStore";
import { FACT_PARAMS, PARAM_REFERENCE, PARAM_VALUE } from "../../program/ProgramFacts";
import { Op } from "../../program/ProgramInstructions";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import type { StatementChunk } from "../../program/StatementChunk";
import { flowScreenplay } from "./flowScreenplay";
import {
  compileScript,
  describeRoot,
  MAIN_URI,
  programCompiler,
  programSession,
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

/** What a script shows from its top, taking the choices
 *  `picks` names at its menus, and the program's root. */
const runOf = (text: string, picks: number[] = []) =>
  silence(() => {
    const { program } = compileScript(text);
    expect(program.chunks).toBeDefined();
    injectDraws();
    const actual = storyRun(new ProgramStory(program.chunks!), picks);
    return { actual, root: program.chunks! };
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

/** A compiler over one script (`programSession`), its first program, and
 *  an edit that replaces one occurrence of `before` with `after` and gives
 *  the program it compiles. */
const session = (
  text: string,
  configure?: Parameters<typeof programSession>[1],
) => {
  const s = programSession(text, configure);
  return {
    first: s.program,
    edit(before: string, after: string) {
      s.edit(before, after);
      return s.program;
    },
    get text() {
      return s.text;
    },
  };
};

const cold = (text: string) =>
  silence(() => programCompiler({ [MAIN_URI]: text }).compile().program);

describe("the fixtures that fell back for a flow's parameters", () => {
  // Every shared fixture that declared a flow with parameters fell back,
  // naming `Argument`, before #1436. None offers a choice.
  for (const [fixture, shown] of [
    ["builtins/read-count-variable-target.sd", ["Count start - 0 0 0", "1", "2", "3", "Count end - 3 3 3"]],
    ["diverts/complex-tunnels.sd", ["one (1)", "one and a half (1.5)", "two (2)", "three (3)"]],
    ["diverts/divert-targets-with-parameters.sd", ["5"]],
    ["diverts/tunnel-onwards-divert-after-with-arg.sd", ["8"]],
    ["diverts/tunnel-onwards-variable-target.sd", ["This is outer", "This is the_esc"]],
    ["diverts/tunnel-onwards-with-param-default-choice.sd", ["8"]],
    ["multiflow/multi-flow-save-load-threads.sd", ["Default line 1", "Default line 2"]],
  ] as const) {
    it(`runs ${fixture} from its chunks`, () => {
      const text = readFileSync(join(FIXTURES, fixture), "utf8");
      const { actual } = runOf(text);
      expect(actual.menus).toEqual([]);
      expect(actual.errors).toEqual([]);
      expect(texts(actual)).toEqual(shown);
    });
  }
});

describe("a dotted target's arguments (#1642)", () => {
  // A divert, a tunnel, a thread and an onward return to a dotted target
  // pass their arguments.
  it("runs diverts/dotted-divert-targets-with-arguments.sd from its chunks", () => {
    const text = readFileSync(
      join(FIXTURES, "diverts/dotted-divert-targets-with-arguments.sd"),
      "utf8",
    );
    const { actual } = runOf(text);
    expect(texts(actual)).toEqual([
      "Inner 1.",
      "Visit 2 t.",
      "Aside 3.",
      "Second 4 b.",
      "Leave 4.",
      "Last 5.",
    ]);
  });
});

describe("a flow's parameters on the program engine", () => {
  it("binds them for a divert, a tunnel and a thread to the flow, and not for a jump into its middle", () => {
    const { actual } = runOf(
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
    const { actual } = runOf(
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
    expect(texts(actual)).toEqual(["Inner 1.", "Second 2 b."]);
  });

  it("packs a variadic flow's arguments, padding a missing parameter with nil", () => {
    const { actual } = runOf(
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
    // A thread and a divert that pass nothing pass nil and an empty `...`.
    expect(texts(actual)).toEqual(["Many 1 2.", "None nil 0.", "None nil 0."]);
  });

  it("passes an onward return's arguments to the flow it goes on to", () => {
    const { actual } = runOf(
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
    expect(texts(actual)).toEqual(["In the tunnel.", "After by onward 2."]);
  });
});

// The onward return goes on to the flow the variable holds, with the
// arguments bound.
describe("an onward return to a variable target", () => {
  it("passes its arguments to the flow the variable holds", () => {
    const text = [
      "store goal = -> after",
      "-> start",
      "scene start",
      "  -> tunnel ->",
      "end",
      "scene tunnel",
      "  In the tunnel.",
      "  ->-> goal(\"onward\")",
      "end",
      "scene after(how)",
      "  After by {how}.",
      "  done",
      "end",
      "",
    ].join("\n");
    const { program } = silence(() => compileScript(text));
    expect(program.chunks).toBeDefined();
    const run = silence(() => storyRun(new ProgramStory(program.chunks!), []));
    expect(texts(run)).toEqual(["In the tunnel.", "After by onward."]);
    expect(run.errors).toEqual([]);
  });
});

describe("a host entering a scene that takes parameters", () => {
  const text = [
    "scene pair(a, b)",
    "  Pair {a} {b}.",
    "  done",
    "end",
    "scene rest(a, ...)",
    "  Rest {a} {select(\"#\", ...)}.",
    "  done",
    "end",
    "",
  ].join("\n");

  it("passes ChoosePathString's arguments for the scene to bind", () => {
    const run = (story: { ChoosePathString(p: string, r?: boolean, a?: any[]): void; Continue(): string | null }) => {
      story.ChoosePathString("pair", true, [1, 2]);
      return story.Continue();
    };
    const { program } = silence(() => compileScript(text));
    expect(program.chunks).toBeDefined();
    const actual = silence(() => run(new ProgramStory(program.chunks!)));
    expect(actual).toBe("Pair 1 2.\n");
  });

  // A scene returns nothing; an extra argument is dropped, a missing one
  // is nil, and the rest go to `...`.
  it("arranges EvaluateFunction's arguments for the scene's parameters", () => {
    const { program } = silence(() => compileScript(text));
    const engine = new ProgramStory(program.chunks!);
    for (const [name, args, output] of [
      ["pair", [1, 2, 3], "Pair 1 2.\n"],
      ["pair", [1], "Pair 1 nil.\n"],
      ["rest", [1, 2, 3], "Rest 1 2.\n"],
      ["rest", [], "Rest nil 0.\n"],
    ] as const) {
      const actual = silence(() => engine.EvaluateFunction(name, [...args], true));
      expect(actual, `${name}(${args.join(", ")})`).toEqual({ returned: null, output });
    }
  });
});

describe("a flow's entry", () => {
  // The entry of a scene that starts with a branch jumps to it, and keeps
  // its chunk through an edit of its header that reads the same.
  it("keeps its chunk when its header is lowered again and reads the same", () => {
    const s = session(
      [
        "-> outer(1)",
        "scene outer(a)",
        "  branch inner",
        "    Inner {a}.",
        "    done",
        "  end",
        "end",
        "",
      ].join("\n"),
    );
    expect(s.first.chunks).toBeDefined();
    const entry = s.first.chunks!.flowNamed("outer")!.arrays.chunks[0]!;
    const edited = s.edit("scene outer(a)", "scene outer( a )");
    expect(edited.chunks).toBeDefined();
    expect(edited.chunks!.flowNamed("outer")!.arrays.chunks[0]).toBe(entry);
    expect(describeRoot(edited.chunks!)).toEqual(describeRoot(cold(s.text).chunks!));
  });
});

// The flow screenplay's randomized edits (#1436's acceptance) met a compile
// whose resolution stopped at a builtin call's proxy divert, which its
// generation never reached: `-- c` written inside `{READ_COUNT(-> …)}`
// leaves `READ_COUNT(-> after > Never …)`, and the story's resolution ended
// there, so a cold compile read `{mid}` below as a variable while an
// incremental one kept the label's count.
describe("a compile whose builtin call reports its arguments", () => {
  it("resolves the names after the call, as an incremental compile does", () => {
    // The edit the flow screenplay's fuzz made (#56 of its per-edit run).
    const text = flowScreenplay(3);
    const s = session(text);
    expect(s.first.chunks).toBeDefined();
    const edited = s.edit(
      "Done looping {FLOW_2.side} {count.turns(-> FLOW_2.side)} {READ_COUNT(-",
      "Done looping {FLOW_2.side} {count.turns(-> FLOW_2.side)} {READ_COUNT(--- c",
    );
    const fresh = cold(s.text);
    expect(fresh.chunks).toBeDefined();
    const coldLines = describeRoot(fresh.chunks!);
    // Both read the label's count, which the cold compile read as a
    // variable once its resolution had stopped.
    expect(coldLines.some((line) => line.includes('GetCount "FLOW_2.after.mid"'))).toBe(true);
    expect(describeRoot(edited.chunks!)).toEqual(coldLines);
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
      expect(s.first.chunks).toBeDefined();
      const before = new Set(rootChunks(s.first.chunks!));
      const edited = s.edit("scene target(a)", after);
      expect(edited.chunks).toBeDefined();
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
    const s = session(source, (compiler) => {
      const internals = compiler as unknown as {
        _binaryTable: ChunkStore["table"];
        _chunkStore: ChunkStore;
      };
      internals._chunkStore = new RefStore(internals._binaryTable);
    });
    const first = s.first;
    expect(first.chunks).toBeDefined();
    const before = new Set(rootChunks(first.chunks!));
    expect(chunksWith(first.chunks!, Op.VarPtr)).toEqual([]);
    kinds = PARAM_REFERENCE;
    const after = s.edit("Plain line.", "Plain line, again.");
    expect(after.chunks).toBeDefined();
    const emitted = rootChunks(after.chunks!).filter((chunk) => !before.has(chunk));
    // The two tunnels that pass the flow arguments, and the edited line.
    expect(emitted).toHaveLength(3);
    const pointers = chunksWith(after.chunks!, Op.VarPtr);
    expect(pointers).toHaveLength(2);
    expect(pointers.every((chunk) => emitted.includes(chunk))).toBe(true);
  });
});
