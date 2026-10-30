import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
  continueShowedSomething,
  displayRouting,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";
import { programListing, stringCount } from "../programListing";
import type { TestStory } from "../engineUnderTest";

const NOT_JOINED =
  "This line begins with `..`, but the line shown before it does not end with `..`, so it does not join it.";

function run(story: TestStory): { texts: string[]; warnings: string[] } {
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

function programShape(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  const all = programListing(ctx.root);
  return {
    continues: stringCount(all, "continues"),
  };
}

const EXAMPLE = `store has_key = true
scene start
  You see a ..
  if has_key then
    .. rusty key.
  else
    .. locked door.
  end
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
      `scene start\n  A ..\n  .. B\nend\n`,
      `scene start\n  A ..\n  ..B\nend\n`,
      `scene start\n  ALICE:\n    A ..\n    .. B\nend\n`,
      `scene start\n  ALICE: A ..\n  ALICE:\n    .. B\nend\n`,
      `scene start\n  ALICE: A ..\n  ALICE: .. B\nend\n`,
      `scene start\n  A ..\n  // note\n  .. B\nend\n`,
    ]) {
      expect(runSource(source), source).toEqual({
        texts: ["A B\n"],
        warnings: [],
      });
    }
  });

  test("joins across a divert, logic, and a `..` line that shows nothing", () => {
    for (const source of [
      `scene start\n  You go ..\n  -> s\nend\n\nscene s\n  .. outside.\nend\n`,
      `store x = 0\nscene start\n  You go ..\n  & x = 1\n  .. outside.\nend\n`,
      `scene start\n  You go ..\n  ..\n  .. outside.\nend\n`,
      `scene start\n  You go ..\n  .. // note\n  .. outside.\nend\n`,
    ]) {
      expect(diagnosticsOf(source), source).toEqual([]);
      expect(runSource(source), source).toEqual({
        texts: ["You go outside.\n"],
        warnings: [],
      });
    }
  });

  test("a divert that holds its line open joins the scene's first line", () => {
    expect(runSource(
        `scene start\n  You go -> s\nend\n\nscene s\n  .. outside.\nend\n`,
      )).toEqual({
      texts: ["You go outside.\n"],
      warnings: [],
    });
  });

  test("after a cue's parenthetical and a chain", () => {
    expect(runSource(`scene start\n  BUNNY: (aside) \\ ..\n  ..joined\nend\n`)).toEqual({
      texts: ["(aside)\njoined\n"],
      warnings: [],
    });
  });
});

describe("a line that begins with `..` after a line that does not end with `..`", () => {
  test.each([
    ["inline", `scene start\n  A\n  .. B\nend\n`],
    ["touching", `scene start\n  A\n  ..B\nend\n`],
    [
      "as the first line of an if branch",
      `scene start\n  A\n  if true then\n    .. B\n  end\nend\n`,
    ],
    [
      "after an interpolation line",
      `store n = 3\nscene start\n  {n}\n  .. B\nend\n`,
    ],
    [
      "the first line of a scene",
      `scene start\n  You go.\n  -> s\nend\n\nscene s\n  .. B\nend\n`,
    ],
    [
      "after logic",
      `store x = 0\nscene start\n  A\n  & x = 1\n  .. B\nend\n`,
    ],
    ["after a `load` line", `scene start\n  load overworld\n  .. B\nend\n`],
  ])("%s", (_label, source) => {
    expect(diagnosticsOf(source)).toEqual([]);
    const { texts, warnings } = runSource(source);
    expect(texts.at(-1)).toBe("B\n");
    expect(texts.length).toBeGreaterThan(1);
    expect(warnings).toEqual([NOT_JOINED]);
  });

  test("the first line of the story", () => {
    expect(runSource(`scene start\n  .. A\nend\n`)).toEqual({
      texts: ["A\n"],
      warnings: [NOT_JOINED],
    });
  });

  test("in a block body, where the line break stays", () => {
    for (const source of [
      `scene start\n  ALICE:\n    A\n    .. B\nend\n`,
      `scene start\n  :\n    A\n    .. B\n    C ..\n    .. D\nend\n`,
    ]) {
      expect(diagnosticsOf(source), source).toEqual([]);
      const { texts, warnings } = runSource(source);
      expect(texts[0]!.startsWith("A\nB"), source).toBe(true);
      expect(warnings, source).toEqual([NOT_JOINED]);
    }
  });

  test("a line that begins with an ellipsis is text, and joins nothing", () => {
    for (const source of [
      `scene start\n  A\n  ...and then.\nend\n`,
      `scene start\n  A ..\n  ...and then.\nend\n`,
    ]) {
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
      `scene start\n  A ..\n  B\nend\n`,
      `scene start\n  A ..\n  -> s\nend\n\nscene s\n  B\nend\n`,
      `scene start\n  A ..\n  if true then\n    B\n  end\nend\n`,
    ]) {
      expect(diagnosticsOf(source), source).toEqual([]);
      expect(runSource(source), source).toEqual({
        texts: ["A\n", "B\n"],
        warnings: [],
      });
    }
  });

  test("in a block body, where the line break stays", () => {
    expect(runSource(`scene start\n  ALICE:\n    A ..\n    B\nend\n`)).toEqual({
      texts: ["A\nB\n"],
      warnings: [],
    });
  });
});

describe("the offer to join", () => {
  const CLICK = `scene start\n  A .. >\n  .. B\nend\n\nscene elsewhere\n  .. C\nend\n\nfunction aside()\n  print("Aside.")\nend\n`;
  const continuesOf = (story: TestStory) =>
    story.currentDisplayInstructions.map(
      (table) =>
        (table.value?.get("continues") as { value?: unknown } | undefined)
          ?.value === true,
    );
  const started = () => {
    const ctx = makeRuntimeStoryFromSource(CLICK);
    expect(ctx.errorMessages).toEqual([]);
    const warnings: string[] = [];
    ctx.story.onError = (message) => {
      warnings.push(message.replace(/^RUNTIME WARNING: .*?: /, ""));
    };
    expect(ctx.story.Continue()).toBe("A\n");
    return { story: ctx.story, warnings };
  };

  test("survives a save and a load between the click's two steps", () => {
    const { story } = started();
    const saved = story.state.ToJson();
    const again = makeRuntimeStoryFromSource(CLICK);
    const warnings: string[] = [];
    again.story.onError = (message) => warnings.push(message);
    again.story.state.LoadJson(saved);
    expect(again.story.Continue()).toBe("B\n");
    expect(continuesOf(again.story)).toEqual([true]);
    expect(warnings).toEqual([]);
  });

  test("is dropped by a host jump", () => {
    const { story, warnings } = started();
    story.ChoosePathString("elsewhere");
    expect(story.Continue()).toBe("C\n");
    expect(continuesOf(story)).toEqual([false]);
    expect(warnings).toEqual([NOT_JOINED]);
  });

  test("outlives a host's function call that shows something", () => {
    const { story, warnings } = started();
    story.EvaluateFunction("aside");
    expect(story.Continue()).toBe("B\n");
    expect(continuesOf(story)).toEqual([true]);
    expect(warnings).toEqual([]);
  });
});

test("after a break in a `load` statement, the text beat joins", () => {
  for (const load of [
    `  load overworld > You see a ..`,
    `  :\n    load overworld\n    > You see a ..`,
  ]) {
    const source = `scene start\n${load}\n  .. rusty key.\nend\n`;
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
  test("marks `continues` on each line that begins with `..`, except inside a block body", () => {
    for (const [source, continues] of [
      [EXAMPLE, 2],
      [`scene start\n  A ..\n  .. B\nend\n`, 1],
      [`scene start\n  ALICE:\n    A ..\n    .. B\nend\n`, 0],
      [`scene start\n  A ..\n  ALICE:\n    .. B\nend\n`, 1],
      [`scene start\n  A -> s\nend\n\nscene s\n  .. B\nend\n`, 1],
      [
        `scene start\n  A -> s\nend\n\nscene s\n  ALICE:\n    .. B\nend\n`,
        1,
      ],
      [`scene start\n  .. A\nend\n`, 1],
      [`scene start\n  A ..\n  B\nend\n`, 0],
    ] as const) {
      expect(programShape(source).continues, source).toBe(continues);
    }
  });
});
