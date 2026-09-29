// A script's top-level declarations compile to its declaration sequence
// (#695, docs/engine/binary-program.md, section 1): one chunk per declaration
// statement, run in the order the current engine initializes the globals. A
// compile that re-emitted a declaration chunk, or changed a function, runs
// every declaration again; one that re-emitted only statements of flows runs
// none.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { describeInstruction } from "../../program/BinaryProgramWriter";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, MAIN_URI, programCompiler } from "./programHarness";

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

/** A compiler over one script with statement chunks on, and an editor that
 *  compiles after each edit. */
function session(initial: string) {
  const c = programCompiler({ [MAIN_URI]: initial }, { programChunks: true });
  let text = initial;
  let version = 1;
  let root = c.compile().program.chunks!;
  return {
    get root() {
      return root;
    },
    get text() {
      return text;
    },
    get store() {
      return c.compiler.chunkStore!;
    },
    get build() {
      return c.compiler.lastProgramBuild!;
    },
    /** Replaces the first `find` with `replace` as one minimal edit. */
    edit(find: string, replace: string) {
      const offset = text.indexOf(find);
      expect(offset, `"${find}" is in the script`).toBeGreaterThanOrEqual(0);
      version += 1;
      c.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version },
        contentChanges: [
          {
            range: {
              start: posAt(text, offset),
              end: posAt(text, offset + find.length),
            },
            text: replace,
          },
        ],
      });
      text = text.slice(0, offset) + replace + text.slice(offset + find.length);
      const program = c.compile().program;
      expect(program.fallback).toBeUndefined();
      root = program.chunks!;
      return root;
    },
  };
}

const declarationCode = (root: ProgramRoot): string[][] => {
  const reader = new BinaryProgramReader(root);
  return root.declarations(MAIN_URI)!.arrays.chunks.map((chunk) =>
    [...reader.instructions(chunk)].map(({ offset }) =>
      describeInstruction(chunk, offset, root.table),
    ),
  );
};

/** The globals a story holds after its state is reset. */
const globalsOf = (
  story: { variablesState: { $: (name: string) => unknown } },
  names: readonly string[],
) => Object.fromEntries(names.map((name) => [name, story.variablesState.$(name)]));

/** The globals a cold compile of `text` gives on the current engine. */
const coldGlobals = (text: string, names: readonly string[]) => {
  const { story } = compileScript(text);
  story.ResetState();
  return globalsOf(story, names);
};

/** Every global a story holds, by the name it is stored under, each read as
 *  plain data (a table as its entries). */
const everyGlobal = (story: { variablesState: object }): Record<string, unknown> => {
  const plain = (value: unknown): unknown => {
    const inner = (value as { valueObject?: unknown } | undefined)?.valueObject;
    return inner instanceof Map
      ? Object.fromEntries([...inner].map(([key, entry]) => [key, plain(entry)]))
      : inner;
  };
  const globals = (story.variablesState as unknown as {
    _globalVariables: Map<string, unknown>;
  })._globalVariables;
  return Object.fromEntries([...globals].map(([name, value]) => [name, plain(value)]));
};

describe("the declaration sequence", () => {
  it("holds a chunk for each declaration statement, run in the order the story initializes the globals", () => {
    const text = [
      "store a = 1",
      "store b = a + 1",
      "const C = 3",
      "define hero as character with",
      '  name = "Hero"',
      "end",
      "Line {b}.",
      "",
    ].join("\n");
    const root = compileScript(text, { programChunks: true }).program.chunks!;
    const code = declarationCode(root);
    expect(code.slice(0, 3)).toEqual([
      ["Int 1", "SetVar a flags 3"],
      ["GetVar a", "Int 1", "Native +/2", "SetVar b flags 3"],
      ["Int 3", "SetVar C flags 3"],
    ]);
    expect(code[3]).toEqual([
      'Str "name"',
      'Str "Hero"',
      "MakeTable 1",
      'Str "hero"',
      'Str "character"',
      "CallStd __def/3",
      "SetVar $character_hero flags 3",
    ]);
    // The flow holds the line alone: the declarations stand in their
    // sequence.
    expect(root.flowNamed("")!.arrays.chunks).toHaveLength(1);
    // The sequence is in line order, and the declarations run in the order
    // the current engine's `global decl` container assigns the globals in,
    // constants first.
    const declared = (chunk: Int32Array) =>
      declarationCode(root)[root.declarations(MAIN_URI)!.arrays.chunks.indexOf(chunk)]!
        .at(-1)!
        .replace(/^SetVar (\S+) flags 3$/, "$1");
    expect(root.declarations(MAIN_URI)!.arrays.chunks.map(declared)).toEqual([
      "a",
      "b",
      "C",
      "$character_hero",
    ]);
    const decl = (compileScript(text).program.compiled as { root: unknown[] }).root.at(-1) as {
      "global decl": unknown[];
    };
    const assigned = decl["global decl"].flatMap((obj) =>
      obj && typeof obj === "object" && "VAR=" in obj ? [(obj as { "VAR=": string })["VAR="]] : [],
    );
    expect(root.initialization.map(declared)).toEqual(assigned);
    expect(assigned).toEqual(["C", "a", "b", "$character_hero"]);
    const story = new ProgramStory(root);
    expect(story.declarationsRun).toBe(4);
    expect(globalsOf(story, ["a", "b", "C"])).toEqual({ a: 1, b: 2, C: 3 });
  });

  // The builtins define `typewriter` as a synth, a typewriter, a mixer and a
  // channel. The story keeps each under its own name (`typewriter`,
  // `$typewriter_typewriter`, `$mixer_typewriter`, `$channel_typewriter`),
  // while every one of those declarations is named `typewriter` itself.
  it("gives every global, the builtins' included, the name and value the current engine gives it", () => {
    const text = "store count = 1\nHello {count}.\n";
    const config = { seedBuiltinsIntoStory: true };
    const current = compileScript(text, config).story;
    current.ResetState();
    const { program } = compileScript(text, { ...config, programChunks: true });
    expect(program.fallback).toBeUndefined();
    const expected = everyGlobal(current);
    expect(Object.keys(expected).length).toBeGreaterThan(300);
    expect(expected).toHaveProperty("$typewriter_typewriter");
    expect(everyGlobal(new ProgramStory(program.chunks!))).toEqual(expected);
  });

  // The story initializes every constant before any variable, so a block
  // statement that declares a constant and a variable has another constant
  // initialized between them.
  it("runs a statement's globals in the story's order when another statement's stand between them", () => {
    const text = [
      "if true then",
      "  const X = 1",
      "  store y = Z + X",
      "end",
      "const Z = 5",
      "Line {y}.",
      "",
    ].join("\n");
    const { program } = compileScript(text, { programChunks: true });
    expect(program.fallback).toBeUndefined();
    const names = ["X", "y", "Z"];
    expect(globalsOf(new ProgramStory(program.chunks!), names)).toEqual({ X: 1, y: 6, Z: 5 });
    expect(coldGlobals(text, names)).toEqual({ X: 1, y: 6, Z: 5 });
    // The `if` statement's globals are two declarations, before and after
    // `Z`'s.
    expect(program.chunks!.initialization).toHaveLength(3);
  });

  it("runs no initializer for a compile that re-emitted only statements of flows", () => {
    const s = session(
      [
        "store a = 1",
        "scene MAIN",
        "  Hello {a}.",
        "  if a > 0 then",
        "    Positive.",
        "  end",
        "end",
        "",
      ].join("\n"),
    );
    const runs = s.store.initializerRuns;
    expect(runs).toBe(1);
    const declarations = s.root.declarations(MAIN_URI)!.arrays;
    s.edit("Hello {a}.", "Hi {a}.");
    s.edit("Positive.", "Plus.");
    expect(s.store.emittedLastBuild).toBe(1);
    expect(s.build.declarationsChanged).toBe(false);
    expect(s.store.initializerRuns).toBe(runs);
    expect(s.root.declarations(MAIN_URI)!.arrays).toBe(declarations);
  });

  it("runs every declaration again when an initializer changes, so a global that reads it gets a cold compile's value", () => {
    const s = session(
      [
        "store a = 1",
        "store b = a + 1",
        "store c = 10",
        "scene MAIN",
        "  Values {a} {b} {c}.",
        "end",
        "",
      ].join("\n"),
    );
    const runs = s.store.initializerRuns;
    const [aChunk, bChunk, cChunk] = s.root.declarations(MAIN_URI)!.arrays.chunks;
    s.edit("store a = 1", "store a = 5");
    // Only `a`'s chunk is new; `b` reads `a` and keeps its chunk, but the
    // whole sequence ran again.
    const [aAfter, bAfter, cAfter] = s.root.declarations(MAIN_URI)!.arrays.chunks;
    expect(aAfter).not.toBe(aChunk);
    expect(bAfter).toBe(bChunk);
    expect(cAfter).toBe(cChunk);
    expect(s.build.declarationsChanged).toBe(true);
    expect(s.store.initializerRuns).toBe(runs + 1);
    const names = ["a", "b", "c"];
    expect(globalsOf(new ProgramStory(s.root), names)).toEqual({ a: 5, b: 6, c: 10 });
    expect(globalsOf(new ProgramStory(s.root), names)).toEqual(coldGlobals(s.text, names));
  });

  // An initializer cannot call a function on the program engine until
  // functions are emitted (#698): such a call makes the program fall back.
  // A function's edit still runs every declaration again, which is the rule
  // that keeps such an initializer's global fresh.
  it("runs every declaration again when a function changes", () => {
    const s = session(
      ["store a = 1", "function f()", "  return 1", "end", "Line {a}.", ""].join("\n"),
    );
    const runs = s.store.initializerRuns;
    s.edit("return 1", "return 2");
    expect(s.build.declarationsChanged).toBe(true);
    expect(s.store.initializerRuns).toBe(runs + 1);
    expect(globalsOf(new ProgramStory(s.root), ["a"])).toEqual(coldGlobals(s.text, ["a"]));
    const { program } = compileScript(
      "function f()\n  return 1\nend\nstore g = f()\nLine {g}.\n",
      { programChunks: true },
    );
    expect(program.fallback?.construct).toBe("FunctionCall");
  });

  it("gives every global a cold compile's value through a series of edits", () => {
    const s = session(
      [
        "store a = 1",
        "store b = a * 2",
        "const K = 4",
        "const L = K + 1",
        "Line {a} {b} {L}.",
        "",
      ].join("\n"),
    );
    const names = ["a", "b", "K", "L"];
    for (const [find, replace] of [
      ["store a = 1", "store a = 3"],
      ["const K = 4", "const K = 7"],
      ["store b = a * 2", "store b = a * 2 + K"],
      ["Line {a}", "Line: {a}"],
    ] as const) {
      s.edit(find, replace);
      expect(globalsOf(new ProgramStory(s.root), names)).toEqual(coldGlobals(s.text, names));
    }
    expect(globalsOf(new ProgramStory(s.root), names)).toEqual({ a: 3, b: 13, K: 7, L: 8 });
  });
});

describe("a bad initializer", () => {
  const diagnostics = (text: string, programChunks: boolean) => {
    const { program } = compileScript(text, { programChunks });
    return Object.values(program.diagnostics ?? {})
      .flat()
      .map((d) => ({
        line: d.range.start.line,
        message: typeof d.message === "string" ? d.message : d.message.value,
      }));
  };

  it("reports a constant that reads a variable on the line it reports it without chunks", () => {
    const text = "store y = 2\nconst C = y + 1\nHello.\n";
    const reported = diagnostics(text, true);
    expect(reported).toEqual(diagnostics(text, false));
    expect(reported.map((d) => d.line)).toEqual([1]);
  });

  // The declarations the store runs raise the error, and the program falls
  // back to the current engine, whose reset raises it as it does without
  // chunks: the compile logs it and emits no program.
  it("raises an initializer's error from the compile as the current engine does", () => {
    const text = 'const A = 2\nconst C = A * 3 + "x"\nHello.\n';
    const compiled = (programChunks: boolean) => {
      const { warn, error } = console;
      const logged: string[] = [];
      console.warn = console.error = (...args: unknown[]) => {
        logged.push(String(args[0]));
      };
      try {
        const { program } = compileScript(text, { programChunks });
        return { program, logged };
      } finally {
        console.warn = warn;
        console.error = error;
      }
    };
    const withChunks = compiled(true);
    const without = compiled(false);
    expect(withChunks.program.fallback?.construct).toBe("initializer error");
    expect(withChunks.program.chunks).toBeUndefined();
    expect(withChunks.program.compiled).toBeUndefined();
    expect(without.program.compiled).toBeUndefined();
    expect(withChunks.logged).toEqual(without.logged);
    expect(withChunks.logged.join("\n")).toContain(
      "attempt to perform arithmetic (+) on a string value",
    );
  });
});
