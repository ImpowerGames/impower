// A line may begin with `..` to state that it continues the line before it.
// The mark joins nothing: the trailing `..` on the line before is what joins.
// Where the line before is a display line, the compiler checks that it ends
// with `..` and reports an error on the mark when it does not. Where the line
// before depends on the run (the first line of a scene, or a line after a
// logic statement), the call's table carries `continues`, and `display` warns
// when the line before had already ended as the call runs. The text shown is
// the text the same source shows without the leading marks.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const CONTINUES_ERROR =
  "This line continues the one before it, but that line does not end with `..`. End it with `..` to join them.";

const CONTINUES_WARNING =
  "This line begins with `..`, but the line before it had already ended.";

const BARE_GLUE_ERROR =
  "A line cannot begin with `..`. End the previous line with `..` to join them.";

// Each step's text, and every runtime error and warning the run raised.
function run(story: RuntimeStory): { texts: string[]; warnings: string[] } {
  const warnings: string[] = [];
  story.onError = (message) => {
    warnings.push(message);
  };
  const texts: string[] = [];
  while (story.canContinue) {
    texts.push(story.Continue() ?? "");
  }
  return { texts, warnings };
}

// Runs `source` and the same source with every line-leading `..` removed, and
// checks that both show the same text.
function runBoth(source: string) {
  const withMark = makeRuntimeStoryFromSource(source);
  const without = makeRuntimeStoryFromSource(
    source.replace(/^([ \t]*)\.\.(?!\.)[ \t]*/gm, "$1"),
  );
  const marked = run(withMark.story);
  const plain = run(without.story);
  expect(marked.texts).toEqual(plain.texts);
  return { ctx: withMark, ...marked };
}

// Where each compile error sits: its message and the range it covers.
function errorsOf(source: string) {
  const compiler = new SparkdownCompiler();
  const uri = "inmemory:///main.sd";
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const { program } = compiler.compile({ textDocument: { uri } });
  return Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d: any) => d.severity === 1)
    .map((d: any) => ({
      message: String(d.message?.value ?? d.message),
      start: d.range.start,
      end: d.range.end,
    }));
}

function stripWarningPrefix(message: string): string {
  return message.replace(/^RUNTIME WARNING: .*?: /, "");
}

// The compiled program's tokens, flattened, with every nested container
// visited.
function tokens(json: unknown): unknown[] {
  const out: unknown[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (value && typeof value === "object") {
      out.push(value);
      for (const item of Object.values(value)) visit(item);
    } else {
      out.push(value);
    }
  };
  visit(json);
  return out;
}

function programShape(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  const all = tokens(ctx.compiledJson);
  return {
    glue: all.filter((t) => t === "<>").length,
    continues: all.filter((t) => t === "^continues").length,
  };
}

const EXAMPLE = `store has_key = true
You see a ..
if has_key then
  .. rusty key.
else
  .. locked door.
end
`;

describe("a line that begins with `..` after a line that ends with `..`", () => {
  test("shows the joined text in each branch of an if, with no diagnostics", () => {
    for (const [value, expected] of [
      ["true", "You see a rusty key.\n"],
      ["false", "You see a locked door.\n"],
    ] as const) {
      const source = EXAMPLE.replace("has_key = true", `has_key = ${value}`);
      const { ctx, texts, warnings } = runBoth(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.warningMessages).toEqual([]);
      expect(warnings).toEqual([]);
      expect(texts).toEqual([expected]);
    }
  });

  test("inline, in a block body and in a dialogue block", () => {
    for (const [source, expected] of [
      [`A ..\n.. B\n`, ["A B\n"]],
      [`A ..\n..B\n`, ["A B\n"]],
      [`ALICE:\n  A ..\n  .. B\n`, ["A B\n"]],
      [`ALICE: A ..\nALICE:\n  .. B\n`, ["A B\n"]],
      [`A ..\n// note\n.. B\n`, ["A B\n"]],
      [`A ..\n...and then.\n`, ["A ...and then.\n"]],
    ] as const) {
      const { ctx, texts, warnings } = runBoth(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(warnings).toEqual([]);
      expect(texts).toEqual(expected);
    }
  });
});

describe("a line that begins with `..` after a display line that does not end with `..`", () => {
  test("inline", () => {
    const source = `A\n.. B\n`;
    expect(errorsOf(source)).toEqual([
      {
        message: CONTINUES_ERROR,
        start: { line: 1, character: 0 },
        end: { line: 1, character: 2 },
      },
    ]);
    expect(runBoth(source).texts).toEqual(["A\n", "B\n"]);
  });

  test("touching", () => {
    expect(errorsOf(`A\n..B\n`)).toEqual([
      {
        message: CONTINUES_ERROR,
        start: { line: 1, character: 0 },
        end: { line: 1, character: 2 },
      },
    ]);
  });

  test("in a block body", () => {
    const source = `ALICE:\n  A\n  .. B\n`;
    expect(errorsOf(source)).toEqual([
      {
        message: CONTINUES_ERROR,
        start: { line: 2, character: 2 },
        end: { line: 2, character: 4 },
      },
    ]);
    expect(runBoth(source).texts).toEqual(["A\nB\n"]);
  });

  test("as the first line of an if branch", () => {
    const source = `A\nif true then\n  .. B\nend\n`;
    expect(errorsOf(source)).toEqual([
      {
        message: CONTINUES_ERROR,
        start: { line: 2, character: 2 },
        end: { line: 2, character: 4 },
      },
    ]);
    expect(runBoth(source).texts).toEqual(["A\n", "B\n"]);
  });

  test("after an interpolation line", () => {
    expect(errorsOf(`store n = 3\n{n}\n.. B\n`)).toEqual([
      {
        message: CONTINUES_ERROR,
        start: { line: 2, character: 0 },
        end: { line: 2, character: 2 },
      },
    ]);
  });
});

describe("a line that begins with `..` whose line before depends on the run", () => {
  const SCENE = `\n\nscene s\n  .. outside.\nend\n`;

  // A divert holds its line open, so the scene's first line joins it.
  test("the first line of a scene a divert on an open line reaches", () => {
    for (const first of [`You go -> s`, `You go ..\n-> s`]) {
      const source = `${first}${SCENE}`;
      const { ctx, texts, warnings } = runBoth(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(warnings).toEqual([]);
      expect(texts).toEqual(["You go outside.\n"]);
    }
  });

  test("the first line of a scene a divert from a closed line reaches", () => {
    const source = `You go.\n-> s${SCENE}`;
    const { ctx, texts, warnings } = runBoth(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(texts).toEqual(["You go.\n", "outside.\n"]);
    expect(warnings.map(stripWarningPrefix)).toEqual([CONTINUES_WARNING]);
  });

  test("after a logic statement that follows an open line", () => {
    const source = `store x = 0\nA ..\n& x = 1\n.. B\n`;
    const { ctx, texts, warnings } = runBoth(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(warnings).toEqual([]);
    expect(texts).toEqual(["A B\n"]);
  });

  test("after a logic statement that follows a closed line", () => {
    const source = `store x = 0\nA\n& x = 1\n.. B\n`;
    const { ctx, texts, warnings } = runBoth(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(texts).toEqual(["A\n", "B\n"]);
    expect(warnings.map(stripWarningPrefix)).toEqual([CONTINUES_WARNING]);
  });

  test("the first line of the story", () => {
    const { warnings } = runBoth(`.. A\n`);
    expect(warnings.map(stripWarningPrefix)).toEqual([CONTINUES_WARNING]);
  });
});

test("a line that begins with an ellipsis is text", () => {
  const ctx = makeRuntimeStoryFromSource(`A\n...and then.\n`);
  expect(ctx.errorMessages).toEqual([]);
  expect(run(ctx.story)).toEqual({
    texts: ["A\n", "...and then.\n"],
    warnings: [],
  });
});

describe("marks that keep their error", () => {
  test("a bare `..` line", () => {
    for (const source of [`A\n  ..\nB\n`, `A ..\n..\nB\n`]) {
      const errors = errorsOf(source);
      expect(errors.map((e) => e.message)).toEqual([BARE_GLUE_ERROR]);
    }
  });

  // A comment or a tag after the mark shows nothing, so the line is bare.
  test("a `..` line with only a comment or a tag after it", () => {
    for (const source of [
      `A ..\n.. // note\nB\n`,
      `A ..\n.. # tag\nB\n`,
      `ALICE:\n  A ..\n  .. // note\n  B\n`,
    ]) {
      const errors = errorsOf(source);
      expect(errors.map((e) => e.message), source).toEqual([BARE_GLUE_ERROR]);
    }
  });
});

// A `load` line's `..` joins nothing, so the line after it does not continue
// it, whether the `load` line is inline or the last line of a block.
describe("a line that begins with `..` after a `load` line", () => {
  test("is an error", () => {
    for (const [source, line] of [
      [`load overworld ..\n.. B\n`, 1],
      [`:\n  load overworld ..\n.. B\n`, 2],
      [`:\n  load overworld ..\n  .. B\n`, 2],
    ] as const) {
      expect(
        errorsOf(source).filter((e) => e.message === CONTINUES_ERROR),
        source,
      ).toEqual([
        {
          message: CONTINUES_ERROR,
          start: { line, character: source.split("\n")[line]!.indexOf("..") },
          end: {
            line,
            character: source.split("\n")[line]!.indexOf("..") + 2,
          },
        },
      ]);
    }
  });
});

describe("the compiled program", () => {
  test("emits no Glue for a leading `..`", () => {
    for (const source of [
      EXAMPLE,
      `A ..\n.. B\n`,
      `ALICE:\n  A ..\n  .. B\n`,
      `A -> s\n\nscene s\n  .. B\nend\n`,
      `store x = 0\nA ..\n& x = 1\n.. B\n`,
    ]) {
      expect(programShape(source).glue).toBe(0);
    }
  });

  test("marks `continues` only where the line before is not a known display line", () => {
    for (const [source, continues] of [
      [EXAMPLE, 0],
      [`A ..\n.. B\n`, 0],
      [`ALICE:\n  A ..\n  .. B\n`, 0],
      [`A ..\nALICE:\n  .. B\n`, 0],
      [`A -> s\n\nscene s\n  .. B\nend\n`, 1],
      [`A -> s\n\nscene s\n  ALICE:\n    .. B\nend\n`, 1],
      [`store x = 0\nA ..\n& x = 1\n.. B\n`, 1],
      [`.. A\n`, 1],
      [`A ..\nB\n`, 0],
    ] as const) {
      expect(programShape(source).continues, source).toBe(continues);
    }
  });
});
