import { describe, expect, it } from "vitest";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { describeInstruction } from "../../program/BinaryProgramWriter";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import { chunkId } from "../../program/ProgramChunk";
import { compileScript, describeRoot, MAIN_URI, programCompiler } from "./programHarness";

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

function session(initial: string) {
  const c = programCompiler({ [MAIN_URI]: initial });
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
      expect(program.chunks).toBeDefined();
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

const globalsOf = (
  story: { variablesState: { $: (name: string) => unknown } },
  names: readonly string[],
) => Object.fromEntries(names.map((name) => [name, story.variablesState.$(name)]));

const coldGlobals = (text: string, names: readonly string[]) => {
  const { program } = compileScript(text);
  return globalsOf(new ProgramStory(program.chunks!), names);
};

const everyGlobal = (story: { variablesState: object }): Record<string, unknown> => {
  const plain = (value: unknown, path: readonly unknown[] = []): unknown => {
    const inner = (value as { valueObject?: unknown } | undefined)?.valueObject;
    if (!(inner instanceof Map)) {
      return inner;
    }
    if (path.includes(inner)) {
      return "(cycle)";
    }
    return Object.fromEntries(
      [...inner].map(([key, entry]) => [key, plain(entry, [...path, inner])]),
    );
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
    const root = compileScript(text).program.chunks!;
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
    expect(root.flowNamed("")!.arrays.chunks).toHaveLength(1);
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
    expect(root.initialization.map(declared)).toEqual(["C", "a", "b", "$character_hero"]);
    const story = new ProgramStory(root);
    expect(story.declarationsRun).toBe(4);
    expect(globalsOf(story, ["a", "b", "C"])).toEqual({ a: 1, b: 2, C: 3 });
  });

  it("declares the builtins' globals, with their values, before the script's own", () => {
    const text = "store count = 1\nHello {count}.\n";
    const config = { seedBuiltinsIntoStory: true };
    const { program } = compileScript(text, { ...config });
    expect(program.chunks).toBeDefined();
    const actual = everyGlobal(new ProgramStory(program.chunks!));
    expect(Object.keys(actual).length).toBeGreaterThan(300);
    expect(actual).toHaveProperty("$typewriter_typewriter");
    expect(Object.keys(actual).slice(0, 4)).toEqual(["metadata", "world", "config", "$config_ui"]);
    expect(Object.keys(actual).at(-1)).toBe("count");
    expect(actual).toMatchObject({
      world: { src: "" },
      $config_typecheck: { mode: "nonstrict" },
      video: { src: "" },
      count: 1,
    });
  });

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
    const { program } = compileScript(text);
    expect(program.chunks).toBeDefined();
    const names = ["X", "y", "Z"];
    expect(globalsOf(new ProgramStory(program.chunks!), names)).toEqual({ X: 1, y: 6, Z: 5 });
    expect(coldGlobals(text, names)).toEqual({ X: 1, y: 6, Z: 5 });
    expect(program.chunks!.initialization).toHaveLength(3);
  });

  it("emits a statement's declarations again when an edit elsewhere changes which globals they hold", () => {
    const text = [
      "if true then",
      "  const X = 1",
      "  store y = 2",
      "end",
      "const Z = 5",
      "Line {y} and {X}.",
      "",
    ].join("\n");
    const s = session(text);
    const cold = (source: string) =>
      compileScript(source).program.chunks!;
    const names = ["X", "y"];
    expect(declarationCode(s.root)).toEqual(declarationCode(cold(s.text)));
    s.edit("const Z = 5\n", "");
    expect(declarationCode(s.root)).toEqual([["Int 1", "SetVar X flags 3", "Int 2", "SetVar y flags 3"]]);
    expect(describeRoot(s.root)).toEqual(describeRoot(cold(s.text)));
    expect(globalsOf(new ProgramStory(s.root), names)).toEqual({ X: 1, y: 2 });
    s.edit("end\n", "end\nconst Z = 5\n");
    expect(describeRoot(s.root)).toEqual(describeRoot(cold(s.text)));
    expect(globalsOf(new ProgramStory(s.root), [...names, "Z"])).toEqual({ X: 1, y: 2, Z: 5 });
  });

  it("emits a builtin's declaration again when an author's declaration shadows it or stops shadowing it", () => {
    const c = programCompiler(
      { [MAIN_URI]: "Line.\n" },
      { seedBuiltinsIntoStory: true },
    );
    let text = "Line.\n";
    let version = 1;
    const edit = (next: string) => {
      version += 1;
      c.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version },
        contentChanges: [{ range: { start: posAt(text, 0), end: posAt(text, text.length) }, text: next }],
      });
      text = next;
      return c.compile().program;
    };
    const cold = () => {
      const { program } = compileScript(text, { seedBuiltinsIntoStory: true });
      return everyGlobal(new ProgramStory(program.chunks!));
    };
    c.compile();
    const shadowing = "define action as typewriter with\n  letter_pause = 0.5\nend\nLine.\n";
    for (const next of [shadowing, "Line.\n", shadowing]) {
      const program = edit(next);
      expect(program.chunks).toBeDefined();
      expect(everyGlobal(new ProgramStory(program.chunks!))).toEqual(cold());
    }
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

  it("runs every declaration again when a function changes", () => {
    const s = session(
      ["store g = f()", "Line {g}.", "", "function f()", "  return 1", "end", ""].join("\n"),
    );
    expect(globalsOf(new ProgramStory(s.root), ["g"])).toEqual({ g: 1 });
    const runs = s.store.initializerRuns;
    s.edit("return 1", "return 2");
    expect(s.build.declarationsChanged).toBe(true);
    expect(s.store.initializerRuns).toBe(runs + 1);
    expect(globalsOf(new ProgramStory(s.root), ["g"])).toEqual(coldGlobals(s.text, ["g"]));
    expect(globalsOf(new ProgramStory(s.root), ["g"])).toEqual({ g: 2 });
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
  const diagnostics = (text: string) => {
    const { program } = compileScript(text);
    return Object.values(program.diagnostics ?? {})
      .flat()
      .map((d) => ({
        line: d.range.start.line,
        message: typeof d.message === "string" ? d.message : d.message.value,
      }));
  };

  it("stops the declarations at a chunk the root cannot place, and names it", () => {
    const { program } = compileScript("store a = 1\nstore b = 2\nHello {a} {b}.\n", {
    });
    const root = program.chunks!;
    expect(root.initialization).toHaveLength(2);
    const unplaced = chunkId(root.initialization[1]!);
    const broken: ProgramRoot = Object.create(root);
    broken.position = (id, near) => (id === unplaced ? undefined : root.position(id, near));
    expect(() => new ProgramStory(broken)).toThrow(
      `The program has no place for declaration chunk ${unplaced}.`,
    );
  });

  it("reports a constant that reads a variable at the constant's line", () => {
    const text = "store y = 2\nconst C = y + 1\nHello.\n";
    const reported = diagnostics(text);
    expect(reported).toEqual([
      { line: 1, message: "A const must be initialized to a constant expression; `y` is not a const." },
    ]);
  });

  it("raises an initializer's error from the compile, which emits no program", () => {
    const text = 'const A = 2\nconst C = A * 3 + "x"\nHello.\n';
    const compiled = () => {
      const { warn, error } = console;
      const logged: string[] = [];
      console.warn = console.error = (...args: unknown[]) => {
        logged.push(String(args[0]));
      };
      try {
        const { program } = compileScript(text);
        return { program, logged };
      } finally {
        console.warn = warn;
        console.error = error;
      }
    };
    const result = compiled();
    expect(result.program.chunks).toBeUndefined();
    expect(result.logged).toEqual([
      "StoryException: Ink had errors or warnings. It is strongly suggested that you assign an error handler to story.onError. The first issue was: RUNTIME ERROR: 'main' line 2: attempt to perform arithmetic (add) on number and string",
    ]);
  });
});
