// A `..` joins lines only from the end of a line. The join keeps the spaces
// written before the mark and drops the spaces after it, so `A ..` then `B`
// shows "A B" and `A..` then `B` shows "AB". A `>..` or `> ..` ending a line
// is a click inside the joined beat. Every join lowers to a display call whose
// table carries `open`, which writes no newline, so no `Glue` object is
// emitted. A line that begins with `..` is an error that names the fix.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
  displayRouting,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

type Routing = { target?: string; character?: string };

const LEADING_GLUE_ERROR =
  "A line cannot begin with `..`. End the previous line with `..` to join them.";

// Each step's text and the routing of each of its tables. The text is what
// its tables say joined, since `Continue()` collapses a run of spaces.
function steps(story: RuntimeStory): [string, Routing[]][] {
  const out: [string, Routing[]][] = [];
  while (story.canContinue) {
    story.Continue();
    const text = story.currentDisplayInstructions
      .map(
        (table) =>
          (table.value?.get("text") as { value?: unknown } | undefined)
            ?.value ?? "",
      )
      .join("");
    out.push([`${text}\n`, displayRouting(story)]);
  }
  return out;
}

function texts(story: RuntimeStory): string[] {
  return steps(story).map(([text]) => text);
}

function flags(story: RuntimeStory, flag: string): boolean[] {
  return story.currentDisplayInstructions.map(
    (table) =>
      (table.value?.get(flag) as { value?: unknown } | undefined)?.value ===
      true,
  );
}

const URI = "inmemory:///main.sd";

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script" as const,
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

function errorsOf(text: string) {
  const program = compile(text) as { diagnostics?: Record<string, any[]> };
  return Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d) => d.severity === 1)
    .map((d) => ({
      message: String(d.message?.value ?? d.message),
      start: d.range.start,
      end: d.range.end,
    }));
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

// What the compiled program holds: its `Glue` objects, its `line` markers,
// its `display` calls, and how many of those tables carry `open`.
function programShape(text: string) {
  const ctx = makeRuntimeStoryFromSource(text);
  expect(ctx.errorMessages).toEqual([]);
  const all = tokens(ctx.compiledJson);
  return {
    glue: all.filter((t) => t === "<>").length,
    line: all.filter((t) => t === "line").length,
    display: all.filter((t) => t === "stdlib:display:1").length,
    open: all.filter((t) => t === "^open").length,
  };
}

const TYPES: {
  label: string;
  inline: string;
  block: string;
  routing: Routing;
}[] = [
  { label: "action", inline: "", block: ":", routing: { target: "action" } },
  {
    label: "dialogue",
    inline: "ALICE: ",
    block: "ALICE:",
    routing: { target: "dialogue", character: "ALICE" },
  },
  {
    label: "heading",
    inline: "$: ",
    block: "$:",
    routing: { target: "heading" },
  },
  { label: "title", inline: "^: ", block: "^:", routing: { target: "title" } },
  {
    label: "transitional",
    inline: "%: ",
    block: "%:",
    routing: { target: "transitional" },
  },
  {
    label: "write",
    inline: "@hud: ",
    block: "@hud:",
    routing: { target: "hud" },
  },
];

// Each trailing form and the joined text it shows.
const SPACINGS: { first: string; joined: string }[] = [
  { first: "A ..", joined: "A B\n" },
  { first: "A   ..", joined: "A   B\n" },
  { first: "A..", joined: "AB\n" },
  { first: "A ..   ", joined: "A B\n" },
];

describe("a trailing `..` joins the next line", () => {
  for (const { label, inline, block, routing } of TYPES) {
    for (const { first, joined } of SPACINGS) {
      test(`${label}: ${JSON.stringify(first)} then B`, () => {
        const ctx = makeRuntimeStoryFromSource(
          `${inline}${first}\n${inline}B\n`,
        );
        expect(ctx.errorMessages).toEqual([]);
        expect(steps(ctx.story)).toEqual([[joined, [routing, {}]]]);
      });

      test(`${label} block: ${JSON.stringify(first)} then B`, () => {
        const ctx = makeRuntimeStoryFromSource(
          `${block}\n  ${first}\n  B\n`,
        );
        expect(ctx.errorMessages).toEqual([]);
        expect(steps(ctx.story)).toEqual([[joined, [routing]]]);
      });
    }

    test(`${label}: a chain of three`, () => {
      const ctx = makeRuntimeStoryFromSource(
        `${inline}a ..\n${inline}b..\n${inline}c.\n`,
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(steps(ctx.story)).toEqual([["a bc.\n", [routing, {}, {}]]]);
    });

    test(`${label}: a join into each branch of an if`, () => {
      for (const [value, word] of [
        ["true", "door."],
        ["false", "wall."],
      ]) {
        const ctx = makeRuntimeStoryFromSource(
          `store c = ${value}\n${inline}You see a ..\nif c then\n  door.\nelse\n  wall.\nend\n`,
        );
        expect(ctx.errorMessages).toEqual([]);
        expect(texts(ctx.story)).toEqual([`You see a ${word}\n`]);
      }
    });

    test(`${label}: a join after a divert`, () => {
      const ctx = makeRuntimeStoryFromSource(
        `${inline}You go -> outdoors\n\nscene outdoors\n  outside.\nend\n`,
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(texts(ctx.story)).toEqual(["You go outside.\n"]);
    });
  }

  test("an interpolation line that ends with `..`", () => {
    const ctx = makeRuntimeStoryFromSource(
      `store n = 3\nYou have ..\n{n} ..\ncoins.\nAfter.\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(texts(ctx.story)).toEqual(["You have 3 coins.\n", "After.\n"]);
  });

  test("an ellipsis and a mid-line `..` stay text", () => {
    const ctx = makeRuntimeStoryFromSource(`Wait...\na..b\nHi ...\nB\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(texts(ctx.story)).toEqual(["Wait...\n", "a..b\n", "Hi ...\n", "B\n"]);
  });
});

describe("a `>..` ending a line clicks inside the joined beat", () => {
  for (const [first, joined] of [
    ["A >..", "AB\n"],
    ["A > ..", "A B\n"],
    ["Abso >..", "Absolutely.\n"],
  ] as const) {
    test(JSON.stringify(first), () => {
      const second = first.startsWith("Abso") ? "lutely." : "B";
      const ctx = makeRuntimeStoryFromSource(`${first}\n${second}\n`);
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.Continue()).toBe(joined);
      expect(flags(ctx.story, "pause")).toEqual([true, false]);
      expect(ctx.story.canContinue).toBe(false);
    });
  }
});

describe("a line that begins with `..` is an error", () => {
  test("a line that begins with `..`", () => {
    const source = `A\n.. B\n`;
    expect(errorsOf(source)).toEqual([
      {
        message: LEADING_GLUE_ERROR,
        start: { line: 1, character: 0 },
        end: { line: 1, character: 2 },
      },
    ]);
    const ctx = makeRuntimeStoryFromSource(source);
    expect(texts(ctx.story)).toEqual(["A\n", "B\n"]);
  });

  test("a bare `..` line", () => {
    const source = `A\n  ..\nB\n`;
    expect(errorsOf(source)).toEqual([
      {
        message: LEADING_GLUE_ERROR,
        start: { line: 1, character: 2 },
        end: { line: 1, character: 4 },
      },
    ]);
    const ctx = makeRuntimeStoryFromSource(source);
    expect(texts(ctx.story)).toEqual(["A\n", "B\n"]);
  });

  test("a block body line that begins with `..`", () => {
    const source = `ALICE:\n  A\n  .. B\n`;
    expect(errorsOf(source)).toEqual([
      {
        message: LEADING_GLUE_ERROR,
        start: { line: 2, character: 2 },
        end: { line: 2, character: 4 },
      },
    ]);
    const ctx = makeRuntimeStoryFromSource(source);
    expect(texts(ctx.story)).toEqual(["A\nB\n"]);
  });
});

describe("a `load` line that ends with `..`", () => {
  test("is an error and joins nothing", () => {
    const source = `load overworld ..\nUnderworld.\n`;
    expect(errorsOf(source)).toEqual([
      {
        message:
          "A `load` line cannot end with `..`. Name every asset it loads on the line.",
        start: { line: 0, character: 15 },
        end: { line: 0, character: 17 },
      },
    ]);
    const ctx = makeRuntimeStoryFromSource(source);
    ctx.story.Continue();
    expect(
      ctx.story.currentDisplayInstructions.map((table) =>
        (table.value?.get("load") as { value?: unknown } | undefined)?.value,
      ),
    ).toEqual(["overworld"]);
    expect(steps(ctx.story)).toEqual([
      ["Underworld.\n", [{ target: "action" }]],
    ]);
  });
});

describe("a choose block's caption", () => {
  test("shows with its choices from one continue", () => {
    const ctx = makeRuntimeStoryFromSource(
      `store x = 0
choose
  ALICE: Pick one.
  & x = x + 1
  * One
  * Two
end
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick one.");
    expect(displayRouting(ctx.story)).toEqual([
      { target: "dialogue", character: "ALICE" },
    ]);
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One", "Two"]);
    expect(ctx.story.canContinue).toBe(false);
    expect(ctx.story.variablesState.$("x")).toBe(1);
  });

  test("only the last display statement before the first choice runs on", () => {
    const ctx = makeRuntimeStoryFromSource(
      `choose
  First.
  Pick one.
  * One
end
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("First.\n");
    expect(ctx.story.currentChoices).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick one.");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
  });
});

describe("the compiled program", () => {
  const cases: [string, string, number][] = [
    ["a trailing join", `A ..\nB\n`, 1],
    ["a touching join", `A..\nB\n`, 1],
    ["a chain", `A ..\nB ..\nC\n`, 2],
    ["a join inside a block body", `ALICE:\n  A ..\n  B\n`, 0],
    ["a touching click", `A >..\nB\n`, 1],
    ["a spaced click", `A > ..\nB\n`, 1],
    ["a join into an if", `You see a ..\nif true then\n  door.\nend\n`, 1],
    ["a join after a divert", `A -> s\n\nscene s\n  B\nend\n`, 1],
    [
      "a chosen line whose flow ends after it",
      `choose\n  * One\n    fin\nend\n`,
      1,
    ],
    [
      "a chosen line an arrow follows",
      `choose\n  * One -> s\nend\n\nscene s\n  B\nend\n`,
      1,
    ],
    [
      "an alternator arm whose tail is a divert",
      `A ..\nqueue\n  | B -> s\nend\n\nscene s\n  C\nend\n`,
      2,
    ],
    [
      "a choose caption",
      `choose\n  Pick one.\n  * One\nend\n`,
      1,
    ],
  ];
  for (const [label, source, open] of cases) {
    test(`${label} emits no Glue and marks every join \`open\``, () => {
      const shape = programShape(source);
      expect(shape.glue).toBe(0);
      expect(shape.open).toBe(open);
      expect(shape.line).toBe(shape.display);
    });
  }
});
