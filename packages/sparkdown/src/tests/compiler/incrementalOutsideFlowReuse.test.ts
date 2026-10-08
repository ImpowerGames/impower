// Incremental compiles when content OUTSIDE every flow changes.
//
// An unchanged flow's statements can still compile differently after an edit
// elsewhere: a declared NAME entering or leaving the program, a change to the
// `include`/`run`/`external` structure, or a callee's parameter list each
// changes how call sites in flows whose own source never changed compile.
// Other edits outside a flow — a constant's value or type, loose prose after
// the last flow — change no other flow. Each case below is written at the
// position it is about, and after a warm-up edit inside a scene, the
// incremental compile has to build the chunks and report the diagnostics a
// cold compile of the same text does.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import { describeRoot } from "../program/describeRoot";

const URI = "file://proj/main.sd";
const SCENES = 12;

const file = (text: string, version: number): File => ({
  uri: URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version,
  languageId: "sparkdown",
});

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

function quiet<T>(fn: () => T): T {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

/** Key-sorted JSON, so two programs compare structurally. */
const stable = (value: unknown): string => {
  const seen = new WeakSet();
  const walk = (x: any): any => {
    if (x && typeof x === "object") {
      if (seen.has(x)) {
        return "[circular]";
      }
      seen.add(x);
      if (Array.isArray(x)) {
        return x.map(walk);
      }
      const out: any = {};
      for (const key of Object.keys(x).sort()) {
        out[key] = walk(x[key]);
      }
      return out;
    }
    return x;
  };
  return JSON.stringify(walk(value));
};

function edit(
  compiler: SparkdownCompiler,
  text: string,
  find: string,
  replace: string,
  version: number,
) {
  const offset = text.indexOf(find);
  expect(offset, `find ${JSON.stringify(find)}`).toBeGreaterThanOrEqual(0);
  compiler.updateDocument({
    textDocument: { uri: URI, version },
    contentChanges: [
      {
        range: {
          start: posAt(text, offset),
          end: posAt(text, offset + find.length),
        },
        text: replace,
      },
    ],
  } as any);
  return text.slice(0, offset) + replace + text.slice(offset + find.length);
}

/** The player worker's configuration. */
function configured(text: string): SparkdownCompiler {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [file(text, 1)],
  } as any);
  return compiler;
}

/** A compile's chunks by content and its diagnostics. */
function compiledOf(compiler: SparkdownCompiler): string {
  const program = (compiler.compile({ textDocument: { uri: URI } } as any) as any).program;
  return stable({
    chunks: program.chunks ? describeRoot(program.chunks) : null,
    diagnostics: program.diagnostics,
  });
}

function coldCompiledOf(text: string): string {
  return compiledOf(configured(text));
}

/**
 * Twelve five-line scenes with `const LIMIT = 5` on line 0 and the first scene
 * on line 2. Every scene READS the constant, so each scene's code refers to
 * it.
 */
function fixture(): string {
  const lines: string[] = ["const LIMIT = 5", ""];
  for (let s = 0; s < SCENES; s++) {
    lines.push(`scene s${s}`);
    lines.push(`  [[show backdrop room_${s}]]`);
    lines.push(`  Line ${s} of the fixture, limit {LIMIT}.`);
    lines.push(`  -> s${(s + 1) % SCENES}`);
    lines.push("end");
  }
  return lines.join("\n");
}

/**
 * Compile `text`, make the warm-up edit `warm`, then apply each of `steps`,
 * and require the incremental compile after each step to equal a cold
 * compile of the same text.
 */
function expectMatchesCold(
  text: string,
  warm: { find: string; replace: string },
  ...steps: { find: string; replace: string }[]
) {
  quiet(() => {
    const compiler = configured(text);
    compiler.compile({ textDocument: { uri: URI } } as any);
    text = edit(compiler, text, warm.find, warm.replace, 2);
    compiler.compile({ textDocument: { uri: URI } } as any);
    steps.forEach((step, i) => {
      text = edit(compiler, text, step.find, step.replace, 3 + i);
      expect(compiledOf(compiler), `after ${JSON.stringify(step.replace)}`).toBe(
        coldCompiledOf(text),
      );
    });
  });
}

const WARM = { find: "Line 3 of", replace: "Line 3 from" };

describe("incremental compiles when content outside a flow changes", () => {
  it("an in-scene edit compiles as a cold compile does", () => {
    expectMatchesCold(fixture(), WARM, { find: "Line 7 of", replace: "Line 7 from" });
  });

  it("editing a constant's value above the first flow compiles as a cold compile does", () => {
    expectMatchesCold(fixture(), WARM, { find: "const LIMIT = 5", replace: "const LIMIT = 6" });
  });

  it("retyping a constant above the first flow compiles as a cold compile does", () => {
    expectMatchesCold(fixture(), WARM, { find: "const LIMIT = 5", replace: 'const LIMIT = "five"' });
  });

  it("loose text after the last flow compiles as a cold compile does", () => {
    expectMatchesCold(fixture(), WARM, {
      find: `  -> s0\nend`,
      replace: `  -> s0\nend\n\nA trailing line of prose.`,
    });
  });

  for (const [where, step] of [
    [
      "above the first flow",
      { find: "const LIMIT = 5", replace: "store extra = 1\nconst LIMIT = 5" },
    ],
    [
      "between two flows",
      { find: "scene s6", replace: "store extra = 1\n\nscene s6" },
    ],
    [
      "after the last flow",
      { find: `  -> s0\nend`, replace: `  -> s0\nend\n\nstore extra = 1` },
    ],
  ] as const) {
    it(`declaring a global ${where} compiles as a cold compile does`, () => {
      expectMatchesCold(fixture(), WARM, step);
    });
  }

  it("changing an external declaration's arity compiles as a cold compile does", () => {
    expectMatchesCold(
      fixture().replace("const LIMIT = 5", "const LIMIT = 5\nexternal myAction()"),
      WARM,
      { find: "external myAction()", replace: "external myAction(a)" },
    );
  });
});

// Every scene calls a flow that takes a parameter; declaring a global with
// that flow's name shadows it, which changes how each call site compiles
// though the calling scenes' own source never changes.
describe("a global that shadows a flow name", () => {
  function shadowFixture(): string {
    const lines: string[] = [];
    for (let s = 0; s < SCENES; s++) {
      lines.push(`scene s${s}`);
      lines.push(`  Line ${s}.`);
      lines.push(`  -> helper(${s}) ->`);
      lines.push(`  -> s${(s + 1) % SCENES}`);
      lines.push("end");
      lines.push("");
    }
    lines.push("scene helper(n: number)");
    lines.push("  Helper got {n}.");
    lines.push("end");
    return lines.join("\n");
  }

  const SHADOW_WARM = { find: "Line 3.", replace: "Line 3!" };

  for (const where of ["above the first flow", "between two flows"] as const) {
    it(`declared ${where}, the calling flows compile as a cold compile does`, () => {
      const anchor = where === "above the first flow" ? "scene s0" : "scene s6";
      expectMatchesCold(shadowFixture(), SHADOW_WARM, {
        find: anchor,
        replace: `store helper = 1\n\n${anchor}`,
      });
    });
  }

  it("changing a callee's parameter list compiles its callers as a cold compile does", () => {
    expectMatchesCold(shadowFixture(), SHADOW_WARM, {
      find: "scene helper(n: number)",
      replace: "scene helper(n: number, m: number)",
    });
  });
});

describe("a script holding an anonymous function", () => {
  const script = () =>
    [
      "scene s0",
      "  Hi.",
      "end",
      "",
      "scene s1",
      "  There.",
      "end",
      "",
      "store f = function(n) return n end",
    ].join("\n");

  it("edits after a cold compile compile as a cold compile does", () => {
    expectMatchesCold(script(), { find: "Hi.", replace: "Hi." }, { find: "Hi.", replace: "Hi." });
  });

  it("changing the function's parameter list compiles as a cold compile does", () => {
    expectMatchesCold(script(), { find: "Hi.", replace: "Hi!" }, {
      find: "function(n)",
      replace: "function(n, m)",
    });
  });
});
