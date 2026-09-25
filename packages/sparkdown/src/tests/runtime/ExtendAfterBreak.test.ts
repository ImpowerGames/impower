// A `..` on each side of a `>` break (`A .. > .. B`, or `A .. >` ending a line
// and `.. B` beginning the next) waits for a click and then carries on in the
// same box. The part before the click is a step of its own whose table carries
// `pause` and `extend`; the part after it begins a step whose first table
// carries `continues`, which `display` keeps only when the line shown before
// it offered the box. The interpreter carries that step on in the box
// (packages/spark-engine). A mark on one side only joins nothing: the part
// after the click is a new box, and a lone leading mark is warned about as the
// story runs.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { pathLocation } from "../../compiler/utils/pathLocationTable";
import {
  continueShowedSomething,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const URI = "inmemory:///main.sd";

const NOT_JOINED =
  "This line begins with `..`, but the line shown before it does not end with `..`, so it does not join it.";

interface Table {
  target?: string;
  character?: string;
  text?: string;
  pause?: boolean;
  extend?: boolean;
  continues?: boolean;
  glue?: boolean;
}

// Every step that shows something, as its tables, and the warnings the run
// raised.
function run(source: string): { steps: Table[][]; warnings: string[] } {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  const warnings: string[] = [];
  ctx.story.onError = (message) => {
    warnings.push(message.replace(/^RUNTIME WARNING: .*?: /, ""));
  };
  const steps: Table[][] = [];
  let guard = 0;
  while (ctx.story.canContinue && guard++ < 50) {
    ctx.story.Continue();
    if (!continueShowedSomething(ctx.story)) continue;
    steps.push(
      ctx.story.currentDisplayInstructions.map((table) => {
        const read = (key: string) =>
          (table.value?.get(key) as { value?: unknown } | undefined)?.value;
        const out: Table = {};
        for (const key of ["target", "character", "text"] as const) {
          const value = read(key);
          if (typeof value === "string") out[key] = value;
        }
        for (const key of [
          "pause",
          "extend",
          "continues",
          "glue",
        ] as const) {
          if (read(key) === true) out[key] = true;
        }
        return out;
      }),
    );
  }
  return { steps, warnings };
}

// A step's text, as its tables say it.
const text = (step: Table[]) => step.map((table) => table.text ?? "").join("");

describe("a `..` on each side of a break carries on in the box after the click", () => {
  // Each spelling: the step the break ends, which offers the box, then the
  // continuation's own step, which takes it.
  test.each([
    ["in one line", `A .. > .. B\nAfter.\n`, "A ", "B"],
    ["touching the words", `A.. >..B\nAfter.\n`, "A", "B"],
    ["across two lines", `A .. >\n.. B\nAfter.\n`, "A ", "B"],
    ["in one line of a block", `:\n  A .. > .. B\nAfter.\n`, "A ", "B"],
    ["across two lines of a block", `:\n  A .. >\n  .. B\nAfter.\n`, "A ", "B"],
    [
      "in a dialogue line",
      `THEO: I think .. > .. I love you.\nAfter.\n`,
      "I think ",
      "I love you.",
    ],
    [
      "in a dialogue block",
      `THEO:\n  I think .. >\n  .. I love you.\nAfter.\n`,
      "I think ",
      "I love you.",
    ],
    [
      "a continuation inside an `if` branch",
      `A .. >\nif true then\n  .. B\nend\nAfter.\n`,
      "A ",
      "B",
    ],
    [
      "a continuation at the top of another scene",
      `A .. >\n-> s\n\nscene s\n  .. B\n  After.\nend\n`,
      "A ",
      "B",
    ],
    [
      "an interpolation line",
      `store n = 3\n{n} .. >\n.. B\nAfter.\n`,
      "3 ",
      "B",
    ],
  ])("%s", (_label, source, first, second) => {
    const { steps, warnings } = run(source);
    expect(warnings).toEqual([]);
    expect(steps).toHaveLength(3);
    const [before, after, last] = steps as [Table[], Table[], Table[]];
    expect(text(before)).toBe(first);
    expect(before.at(-1)).toMatchObject({ pause: true, extend: true });
    expect(text(after)).toBe(second);
    expect(after[0]).toMatchObject({ continues: true });
    expect(after.some((table) => table.extend)).toBe(false);
    expect(text(last)).toBe("After.");
    expect(last[0]?.continues).toBeUndefined();
  });

  test("a chain of three takes three steps, each offering the next the box", () => {
    const { steps } = run(`One .. > .. two .. > .. three.\nAfter.\n`);
    expect(steps.map(text)).toEqual(["One ", "two ", "three.", "After."]);
    expect(steps.map((step) => Boolean(step.at(-1)?.extend))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(steps.map((step) => Boolean(step[0]?.continues))).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  test("a continuation keeps its own cue", () => {
    const { steps } = run(`???: Hello... .. >\nALICE: .. It's me.\n`);
    expect(steps[1]).toEqual([
      {
        target: "dialogue",
        character: "ALICE",
        text: "It's me.",
        continues: true,
      },
    ]);
  });

  test("a cue's parenthetical rides the table's cue", () => {
    const { steps } = run(`HERO: A .. >\nHERO (loudly): .. B\n`);
    expect(steps[1]![0]).toMatchObject({ character: "HERO (loudly)" });
    const block = run(`HERO (softly):\n  A\n`);
    expect(block.steps[0]![0]).toMatchObject({ character: "HERO (softly)" });
  });

  test("logic, blank lines and comments between the two parts run at the click", () => {
    const ctx = makeRuntimeStoryFromSource(
      `store mood = "calm"\nA .. >\n\n// note\n& mood = "happy"\n.. B\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("A\n");
    expect(ctx.story.variablesState.$("mood")).toBe("calm");
    expect(ctx.story.Continue()).toBe("B\n");
    expect(ctx.story.variablesState.$("mood")).toBe("happy");
  });

  test("a picture shown with the continuation goes on its line", () => {
    const { steps, warnings } = run(`A .. >\n.. [[b]] B\n`);
    expect(warnings).toEqual([]);
    expect(steps.map(text)).toEqual(["A ", "[[b]] B"]);
    expect(steps[1]![0]).toMatchObject({ continues: true });
  });
});

describe("a mark on one side of a break joins nothing", () => {
  test("a `..` before the break alone: the next part is a new box, unwarned", () => {
    for (const source of [`A .. > B\n`, `A .. >\nB\n`]) {
      const { steps, warnings } = run(source);
      expect(warnings).toEqual([]);
      expect(steps.map(text)).toEqual(["A ", "B"]);
      expect(steps[0]!.at(-1)).toMatchObject({ pause: true, extend: true });
      expect(steps[1]![0]?.continues).toBeUndefined();
    }
  });

  test("a `..` after the break alone: the next part is a new box, warned", () => {
    for (const source of [`A > .. B\n`, `A >..B\n`, `A >\n.. B\n`]) {
      const { steps, warnings } = run(source);
      expect(warnings, source).toEqual([NOT_JOINED]);
      expect(steps.map(text)).toEqual(["A", "B"]);
      expect(steps[0]!.some((table) => table.extend)).toBe(false);
      // `display` takes the mark off, so the interpreter starts a new box.
      expect(steps[1]![0]?.continues).toBeUndefined();
    }
  });

  test("a `..` that ends the line after a break marks nothing", () => {
    const { steps, warnings } = run(`A > ..\n.. B\n`);
    expect(warnings).toEqual([NOT_JOINED]);
    expect(steps.map(text)).toEqual(["A", "B"]);
    expect(steps.flat().some((table) => table.extend || table.glue)).toBe(false);
  });

  test("a line shown between the two parts takes the offer away", () => {
    for (const between of [`Other.`, `[[b]]`]) {
      const { steps, warnings } = run(`A .. >\n${between}\n.. B\n`);
      expect(warnings, between).toEqual([NOT_JOINED]);
      expect(steps.map(text)).toEqual(["A ", between, "B"]);
      expect(steps[2]![0]?.continues).toBeUndefined();
    }
  });

  test("a branch taken that shows nothing leaves the next line's mark to decide", () => {
    // The branch shows nothing, so the offer stands for the line after it.
    const untaken = run(`A .. >\nif false then\n  B\nend\n.. C\n`);
    expect(untaken.warnings).toEqual([]);
    expect(untaken.steps.map(text)).toEqual(["A ", "C"]);
    expect(untaken.steps[1]![0]).toMatchObject({ continues: true });
    // Without a mark the line after the block is a new box.
    const plain = run(`A .. >\nif false then\n  .. B\nend\nC\n`);
    expect(plain.warnings).toEqual([]);
    expect(plain.steps.map(text)).toEqual(["A ", "C"]);
    expect(plain.steps[1]![0]?.continues).toBeUndefined();
  });

  test("a plain `>` still ends its beat without offering the box", () => {
    const { steps } = run(`A >\nB\n`);
    expect(steps.map(text)).toEqual(["A", "B"]);
    expect(steps.flat().some((table) => table.extend)).toBe(false);
  });
});

describe("an edit inside the block before a line", () => {
  // The flags a line's calls carry read only the line itself, so a line kept
  // from an earlier compile carries what a cold compile gives it. The edit
  // keeps the block's length, since a continuation's `group` names the offset
  // its line starts at.
  test("compiles as a cold compile of the same text does", () => {
    const pad = Array.from({ length: 20 }, (_, i) => `Filler ${i}.`).join("\n");
    const base = `${pad}\nA .. >\nif false then\n  Bbbbbbbbb\nend\n.. C\n${pad}\n`;
    const find = "  Bbbbbbbbb\n";
    const replace = "  .. B .. >\n";
    const offset = base.indexOf(find);
    const after = base.slice(0, offset) + replace + base.slice(offset + find.length);
    const position = (text: string, at: number) => {
      const lines = text.slice(0, at).split("\n");
      return { line: lines.length - 1, character: lines.at(-1)!.length };
    };
    const configure = (compiler: SparkdownCompiler, text: string) =>
      compiler.configure({
        files: [
          {
            uri: URI,
            type: "script",
            name: "main",
            ext: "sd",
            text,
            version: 1,
            languageId: "sparkdown",
          },
        ],
      });
    const incremental = new SparkdownCompiler();
    configure(incremental, base);
    incremental.compile({ textDocument: { uri: URI } });
    incremental.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        {
          range: {
            start: position(base, offset),
            end: position(base, offset + find.length),
          },
          text: replace,
        },
      ],
    });
    const cold = new SparkdownCompiler();
    configure(cold, after);
    const compiled = (compiler: SparkdownCompiler) =>
      JSON.stringify(
        compiler.compile({ textDocument: { uri: URI } }).program.compiled,
      );
    expect(compiled(incremental)).toBe(compiled(cold));
  });
});

describe("the preview's lines", () => {
  // The lines of the first part resolve to its step, and the continuation's
  // lines to the continuation's.
  test("each part's lines belong to its own step", () => {
    const source = `CHARACTER:\n  [[a]]\n  First .. >\n  .. [[b]]\n  second.\n`;
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        {
          uri: URI,
          type: "script",
          name: "main",
          ext: "sd",
          text: source,
          version: 1,
          languageId: "sparkdown",
        },
      ],
    });
    const program = compiler.compile({ textDocument: { uri: URI } }).program;
    const story = new RuntimeStory(program.compiled as Record<string, any>);
    const pathLocations = program.pathLocations;
    const lines: number[][] = [];
    let ran = new Set<number>();
    story.onExecute = (path) => {
      if (!path) return;
      const location = pathLocation(pathLocations, path);
      if (location) {
        for (let line = location[1]!; line <= location[3]!; line++) {
          ran.add(line);
        }
      }
    };
    while (story.canContinue) {
      story.Continue();
      if (!continueShowedSomething(story)) continue;
      lines.push([...ran].sort((a, b) => a - b));
      ran = new Set();
    }
    expect(lines).toHaveLength(2);
    const [first, second] = lines as [number[], number[]];
    expect(first).toEqual([1, 2]);
    expect(second).toEqual(expect.arrayContaining([3, 4]));
  });
});
