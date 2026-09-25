// A line that begins with `..` joins the line shown before it when that line
// ends with `..`: glue needs a mark on both sides. Which line is shown before
// it can depend on the run (a divert, a branch, a scene's first line), so the
// compiler reports nothing about the marks. The call's table carries
// `continues`, and `display` joins it or, when the line before does not end
// with `..`, warns and shows it as a line of its own. Inside a block body both
// lines are known, and the compiler joins them in the body's text.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
  continueShowedSomething,
  displayRouting,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const NOT_JOINED =
  "This line begins with `..`, but the line shown before it does not end with `..`, so it does not join it.";

// Each step's text, and every runtime error and warning the run raised.
function run(story: RuntimeStory): { texts: string[]; warnings: string[] } {
  const warnings: string[] = [];
  story.onError = (message) => {
    warnings.push(message.replace(/^RUNTIME WARNING: .*?: /, ""));
  };
  const texts: string[] = [];
  while (story.canContinue) {
    const text = story.Continue() ?? "";
    if (continueShowedSomething(story)) texts.push(text);
  }
  return { texts, warnings };
}

function runSource(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages, source).toEqual([]);
  return run(ctx.story);
}

// Every compile error and warning the source reports, leaving out the ones
// about characters these sources never define.
function diagnosticsOf(source: string) {
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
    .filter((d: any) => d.severity === 1 || d.severity === 2)
    .map((d: any) => String(d.message?.value ?? d.message))
    .filter((message) => !message.startsWith("Cannot find character"));
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
  test("joins it in each branch of an if", () => {
    for (const [value, expected] of [
      ["true", "You see a rusty key.\n"],
      ["false", "You see a locked door.\n"],
    ] as const) {
      const source = EXAMPLE.replace("has_key = true", `has_key = ${value}`);
      expect(diagnosticsOf(source)).toEqual([]);
      expect(runSource(source)).toEqual({ texts: [expected], warnings: [] });
    }
  });

  test("inline, in a block body and in a dialogue block", () => {
    for (const source of [
      `A ..\n.. B\n`,
      `A ..\n..B\n`,
      `ALICE:\n  A ..\n  .. B\n`,
      `ALICE: A ..\nALICE:\n  .. B\n`,
      `ALICE: A ..\nALICE: .. B\n`,
      `A ..\n// note\n.. B\n`,
    ]) {
      expect(runSource(source), source).toEqual({
        texts: ["A B\n"],
        warnings: [],
      });
    }
  });

  test("joins across a divert, logic, and a `..` line that shows nothing", () => {
    for (const source of [
      `You go ..\n-> s\n\nscene s\n  .. outside.\nend\n`,
      `store x = 0\nYou go ..\n& x = 1\n.. outside.\n`,
      `You go ..\n..\n.. outside.\n`,
      `You go ..\n.. // note\n.. outside.\n`,
    ]) {
      expect(diagnosticsOf(source), source).toEqual([]);
      expect(runSource(source), source).toEqual({
        texts: ["You go outside.\n"],
        warnings: [],
      });
    }
  });

  test("a divert that holds its line open joins the scene's first line", () => {
    expect(runSource(`You go -> s\n\nscene s\n  .. outside.\nend\n`)).toEqual({
      texts: ["You go outside.\n"],
      warnings: [],
    });
  });
});

describe("a line that begins with `..` after a line that does not end with `..`", () => {
  // The compiler cannot always tell which line runs before, so it reports
  // nothing; the run warns and shows the line on its own.
  test.each([
    ["inline", `A\n.. B\n`],
    ["touching", `A\n..B\n`],
    ["as the first line of an if branch", `A\nif true then\n  .. B\nend\n`],
    ["after an interpolation line", `store n = 3\n{n}\n.. B\n`],
    ["the first line of a scene", `You go.\n-> s\n\nscene s\n  .. B\nend\n`],
    ["after logic", `store x = 0\nA\n& x = 1\n.. B\n`],
    ["after a `load` line", `load overworld\n.. B\n`],
  ])("%s", (_label, source) => {
    expect(diagnosticsOf(source)).toEqual([]);
    const { texts, warnings } = runSource(source);
    expect(texts.at(-1)).toBe("B\n");
    expect(texts.length).toBeGreaterThan(1);
    expect(warnings).toEqual([NOT_JOINED]);
  });

  test("the first line of the story", () => {
    expect(runSource(`.. A\n`)).toEqual({
      texts: ["A\n"],
      warnings: [NOT_JOINED],
    });
  });

  test("in a block body, where the line break stays", () => {
    const source = `ALICE:\n  A\n  .. B\n`;
    expect(diagnosticsOf(source)).toEqual([]);
    expect(runSource(source)).toEqual({ texts: ["A\nB\n"], warnings: [] });
  });

  test("a line that begins with an ellipsis is text, and joins nothing", () => {
    for (const source of [`A\n...and then.\n`, `A ..\n...and then.\n`]) {
      expect(runSource(source), source).toEqual({
        texts: ["A\n", "...and then.\n"],
        warnings: [],
      });
    }
  });
});

describe("a line that ends with `..` before a line that does not begin with `..`", () => {
  test("joins nothing, and the run does not warn", () => {
    for (const source of [
      `A ..\nB\n`,
      `A ..\n-> s\n\nscene s\n  B\nend\n`,
      `A ..\nif true then\n  B\nend\n`,
    ]) {
      expect(diagnosticsOf(source), source).toEqual([]);
      expect(runSource(source), source).toEqual({
        texts: ["A\n", "B\n"],
        warnings: [],
      });
    }
  });

  test("in a block body, where the line break stays", () => {
    expect(runSource(`ALICE:\n  A ..\n  B\n`)).toEqual({
      texts: ["A\nB\n"],
      warnings: [],
    });
  });
});

// Lowering decides a `load` directive per beat: after a `>` break, a beat of
// text that ends with `..` joins the next line.
test("after a break in a `load` statement, the text beat joins", () => {
  for (const load of [
    `load overworld > You see a ..`,
    `:\n  load overworld\n  > You see a ..`,
  ]) {
    const source = `${load}\n.. rusty key.\n`;
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages, source).toEqual([]);
    const texts: string[] = [];
    const routing: unknown[] = [];
    while (ctx.story.canContinue) {
      const text = ctx.story.Continue() ?? "";
      if (!continueShowedSomething(ctx.story)) continue;
      texts.push(text);
      routing.push(displayRouting(ctx.story));
    }
    expect(texts.at(-1), source).toBe("You see a rusty key.\n");
    expect((routing.at(-1) as unknown[]).at(-1), source).toEqual({});
  }
});

describe("the compiled program", () => {
  test("emits no Glue for a `..`", () => {
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

  test("marks `continues` on each line that begins with `..`, except inside a block body", () => {
    for (const [source, continues] of [
      [EXAMPLE, 2],
      [`A ..\n.. B\n`, 1],
      [`ALICE:\n  A ..\n  .. B\n`, 0],
      [`A ..\nALICE:\n  .. B\n`, 1],
      [`A -> s\n\nscene s\n  .. B\nend\n`, 1],
      [`A -> s\n\nscene s\n  ALICE:\n    .. B\nend\n`, 1],
      [`.. A\n`, 1],
      [`A ..\nB\n`, 0],
    ] as const) {
      expect(programShape(source).continues, source).toBe(continues);
    }
  });
});
