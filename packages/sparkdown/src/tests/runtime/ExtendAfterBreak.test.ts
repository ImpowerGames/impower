// A `..` after a `>` break waits for a click and then carries on in the same
// box. The break's table carries `pause` and `extend` and writes its newline,
// so the part before the click is a step of its own; the next step that shows
// something is the continuation, which the interpreter shows in the same box
// (packages/spark-engine). Everything between the two runs in the
// continuation's step, after the click. A `..` before the break (`A .. >`)
// joins the next line into the beat, and the click comes after both.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { pathLocation } from "../../compiler/utils/pathLocationTable";
import {
  continueShowedSomething,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const URI = "inmemory:///main.sd";

interface Table {
  target?: string;
  character?: string;
  text?: string;
  pause?: boolean;
  extend?: boolean;
  open?: boolean;
  fresh?: boolean;
}

// Every step that shows something, as its tables.
function steps(story: RuntimeStory): Table[][] {
  const out: Table[][] = [];
  let guard = 0;
  while (story.canContinue && guard++ < 50) {
    story.Continue();
    if (!continueShowedSomething(story)) continue;
    out.push(
      story.currentDisplayInstructions.map((table) => {
        const read = (key: string) =>
          (table.value?.get(key) as { value?: unknown } | undefined)?.value;
        const out: Table = {};
        for (const key of ["target", "character", "text"] as const) {
          const value = read(key);
          if (typeof value === "string") out[key] = value;
        }
        for (const key of ["pause", "extend", "open", "fresh"] as const) {
          if (read(key) === true) out[key] = true;
        }
        return out;
      }),
    );
  }
  return out;
}

function run(source: string): Table[][] {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  return steps(ctx.story);
}

// A step's text, as its tables say it.
const text = (step: Table[]) => step.map((table) => table.text ?? "").join("");

describe("a `..` after a break carries on in the box after the click", () => {
  // Each spelling: the step the break ends, which asks the next to carry on,
  // then the continuation's own step.
  test.each([
    ["`A > .. B` in one line", `A > .. B\nAfter.\n`, "A ", "B"],
    ["`A > ..` then `B`", `A > ..\nB\nAfter.\n`, "A ", "B"],
    ["`A >..` then `B`", `A >..\nB\nAfter.\n`, "A", "B"],
    ["`A > .. B` in a block", `:\n  A > .. B\nAfter.\n`, "A ", "B"],
    ["`A > ..` then `B` in a block", `:\n  A > ..\n  B\nAfter.\n`, "A ", "B"],
    ["`A >..` then `B` in a block", `:\n  A >..\n  B\nAfter.\n`, "A", "B"],
    [
      "a continuation inside an `if` branch",
      `A > ..\nif true then\n  B\nend\nAfter.\n`,
      "A ",
      "B",
    ],
    [
      "a continuation after a `->`",
      `A > .. -> s\n\nscene s\n  B\n  After.\nend\n`,
      "A ",
      "B",
    ],
    [
      "a continuation at the top of another scene",
      `A > ..\n-> s\n\nscene s\n  B\n  After.\nend\n`,
      "A ",
      "B",
    ],
    [
      "an interpolation line",
      `store n = 3\n{n} > ..\nB\nAfter.\n`,
      "3 ",
      "B",
    ],
  ])("%s", (_label, source, first, second) => {
    const out = run(source);
    expect(out).toHaveLength(3);
    const [before, after, last] = out as [Table[], Table[], Table[]];
    expect(text(before)).toBe(first);
    expect(before.at(-1)).toMatchObject({ pause: true, extend: true });
    expect(before.some((table) => table.open)).toBe(false);
    expect(text(after)).toBe(second);
    expect(after.some((table) => table.extend)).toBe(false);
    expect(text(last)).toBe("After.");
  });

  test("a chain of three takes three steps, each asking the next to carry on", () => {
    const out = run(`One > .. two > .. three.\nAfter.\n`);
    expect(out.map(text)).toEqual(["One ", "two ", "three.", "After."]);
    expect(out.map((step) => Boolean(step.at(-1)?.extend))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  test("a continuation keeps its own cue, and a line `.. >` joins is routed by the first", () => {
    const extended = run(`???: Hello... > ..\nALICE: It's me.\n`);
    expect(extended[1]).toEqual([
      { target: "dialogue", character: "ALICE", text: "It's me." },
    ]);
    // `.. >` joins ALICE's line into the beat, which the first table routes.
    const glued = run(`???: Hello... .. >\nALICE: It's me.\nAfter.\n`);
    expect(text(glued[0]!)).toBe("Hello... It's me.");
    expect(glued[0]![0]).toEqual({
      target: "dialogue",
      character: "???",
      text: "Hello... ",
      pause: true,
      open: true,
    });
  });

  test("`A .. >` then `B` is one step reading A B, and the next line starts a new box", () => {
    const out = run(`A .. >\nB\nC\n`);
    expect(out.map(text)).toEqual(["A B", "C"]);
    expect(out[0]!.some((table) => table.extend)).toBe(false);
    expect(out[0]![0]).toMatchObject({ pause: true, open: true });
  });

  test("a plain `>` still ends its beat without carrying on", () => {
    const out = run(`A >\nB\n`);
    expect(out.map(text)).toEqual(["A", "B"]);
    expect(out.flat().some((table) => table.extend)).toBe(false);
  });

  test("logic, blank lines and comments between the two parts run at the click", () => {
    const ctx = makeRuntimeStoryFromSource(
      `store mood = "calm"\nA > ..\n\n// note\n& mood = "happy"\nB\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("A\n");
    expect(ctx.story.variablesState.$("mood")).toBe("calm");
    expect(ctx.story.Continue()).toBe("B\n");
    expect(ctx.story.variablesState.$("mood")).toBe("happy");
  });

  test("an asset line between the two parts runs in the continuation's steps", () => {
    const out = run(`A > ..\n[[b]]\nB\n`);
    expect(out.map(text)).toEqual(["A ", "[[b]]", "B"]);
    expect(out[0]!.at(-1)).toMatchObject({ extend: true });
  });

  test("a `..` touching the words after a mid-line break carries on too", () => {
    for (const [source, first, second] of [
      [`Hold on > ..tight.\n`, "Hold on ", "tight."],
      [`Abso >..lutely.\n`, "Abso", "lutely."],
    ] as const) {
      const out = run(source);
      expect(out.map(text)).toEqual([first, second]);
      expect(out[0]!.at(-1)).toMatchObject({ pause: true, extend: true });
    }
  });

  test("the line after a block whose branch could continue the box is `fresh`", () => {
    const fresh = (step: Table[] | undefined) =>
      step?.[0]?.fresh === true;
    // The branch taken shows nothing, so C must start a new box.
    const untaken = run(`A > ..\nif false then\n  B\nend\nC\n`);
    expect(untaken.map(text)).toEqual(["A ", "C"]);
    expect(fresh(untaken[1])).toBe(true);
    // Logic between the block and the line keeps the flag on the line.
    const logic = run(`store x = 0\nA > ..\nif false then\n  B\nend\n& x = 1\nC\n`);
    expect(fresh(logic[1])).toBe(true);
    // A block that ends a branch with `> ..` leaves its box for the line.
    const inside = run(`if true then\n  A > ..\nend\nC\n`);
    expect(inside.map(text)).toEqual(["A ", "C"]);
    expect(fresh(inside[1])).toBe(false);
    // A line after a line, or at the top of a scene, is not.
    expect(run(`A > ..\nB\n`).some(fresh)).toBe(false);
  });

  test("a cue's parenthetical rides the table's cue", () => {
    const out = run(`HERO: A > ..\nHERO (loudly): B\n`);
    expect(out[1]![0]).toMatchObject({ character: "HERO (loudly)" });
    const block = run(`HERO (softly):\n  A\n`);
    expect(block[0]![0]).toMatchObject({ character: "HERO (softly)" });
  });

  test("a display line between the break and a `..` makes it an ordinary join", () => {
    const out = run(`A >\nOther ..\nB\n`);
    expect(out.map(text)).toEqual(["A", "Other B"]);
    expect(out.flat().some((table) => table.extend)).toBe(false);
  });
});

describe("the preview's lines", () => {
  // The lines of the first part resolve to its step, and the lines between
  // the break and the continuation, with the continuation's own, to the
  // continuation's.
  test("each part's lines belong to its own step", () => {
    const source = `CHARACTER:\n  [[a]]\n  First > ..\n  [[b]]\n  second.\n`;
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
    // The first part's step runs its lines and none of the continuation's;
    // the continuation's lines run in the step after the click.
    expect(lines).toHaveLength(2);
    const [first, second] = lines as [number[], number[]];
    expect(first).toEqual([1, 2]);
    expect(second).toEqual(expect.arrayContaining([3, 4]));
  });
});
