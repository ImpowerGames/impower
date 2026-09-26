// A `>` in display text is a break unless it is escaped, closes a text command
// or is the `>` of a `->` divert, so it needs no space on either side, as a
// `..` glue mark does. Each `>` of `>>` is a break, and so is the `>` of `>=`.
// `-->` is a `-` followed by a divert. `\>` is a literal `>`. A touching break
// shows the same beats as the spaced one.

import { describe, expect, test } from "vitest";
import {
  collectDiagnostics,
  continueShowedSomething,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

interface Step {
  text: string;
  target?: string;
  character?: string;
  pause?: boolean;
  extend?: boolean;
  continues?: boolean;
}

// Every step that shows something: its text, the routing of its first routed
// table, and the flags its tables carry.
function steps(story: RuntimeStory): Step[] {
  const out: Step[] = [];
  let guard = 0;
  while (story.canContinue && guard++ < 50) {
    const text = story.Continue() ?? "";
    if (!continueShowedSomething(story)) continue;
    const step: Step = { text };
    for (const table of story.currentDisplayInstructions) {
      const read = (key: string) =>
        (table.value?.get(key) as { value?: unknown } | undefined)?.value;
      for (const key of ["target", "character"] as const) {
        const value = read(key);
        if (typeof value === "string" && step[key] === undefined) {
          step[key] = value;
        }
      }
      for (const key of ["pause", "extend", "continues"] as const) {
        if (read(key) === true) step[key] = true;
      }
    }
    out.push(step);
  }
  return out;
}

// The cues in these sources name characters no script declares, which the
// compiler warns about; nothing else may be reported.
const UNDECLARED = /^Cannot find character named/;

function run(source: string): { steps: Step[]; warnings: string[] } {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  expect(
    ctx.warningMessages.filter((message) => !UNDECLARED.test(message)),
  ).toEqual([]);
  const warnings: string[] = [];
  ctx.story.onError = (message) => {
    warnings.push(message);
  };
  return { steps: steps(ctx.story), warnings };
}

describe("a `>` break that touches the words around it", () => {
  test("`HERO: Hi.>Bye.` is two steps that both carry HERO", () => {
    expect(run(`HERO: Hi.>Bye.\n`).steps).toEqual([
      { text: "Hi.\n", target: "dialogue", character: "HERO", pause: true },
      { text: "Bye.\n", target: "dialogue", character: "HERO" },
    ]);
  });

  test.each([
    ["touching both words", `A>B\n`],
    ["touching the word after", `A >B\n`],
    ["touching the word before", `A> B\n`],
    ["in a block", `:\n  A>B\n`],
    ["in a dialogue block", `HERO:\n  A>B\n`],
  ])("%s shows the beats `A > B` shows", (_label, source) => {
    const spaced = source.replace(/ ?> ?/, " > ");
    expect(run(source).steps).toEqual(run(spaced).steps);
    expect(run(source).steps.map((step) => step.text)).toEqual(["A\n", "B\n"]);
  });

  test("`A>` at the end of a line is a break", () => {
    expect(run(`A>\nB\n`).steps).toEqual(run(`A >\nB\n`).steps);
    expect(run(`A>\nB\n`).steps[0]).toMatchObject({ text: "A\n", pause: true });
    expect(run(`:\n  A>\n  B\n`).steps).toEqual(run(`:\n  A >\n  B\n`).steps);
  });

  test("`>Hello` is a lone `>` followed by a `Hello` line", () => {
    expect(run(`>Hello\n`).steps).toEqual(run(`> Hello\n`).steps);
    expect(run(`>Hello\n`).steps.map((step) => step.text)).toEqual([
      "\n",
      "Hello\n",
    ]);
  });

  test("`Abso>..` then `lutely.` reads the break the next line joins", () => {
    for (const [touching, spaced] of [
      [`Abso>..\nlutely.\nAfter.\n`, `Abso >..\nlutely.\nAfter.\n`],
      [`Abso>..\n..lutely.\nAfter.\n`, `Abso >..\n..lutely.\nAfter.\n`],
      [`:\n  Abso>..\n  ..lutely.\nAfter.\n`, `:\n  Abso >..\n  ..lutely.\nAfter.\n`],
    ]) {
      const result = run(touching!);
      expect(result.steps).toEqual(run(spaced!).steps);
      expect(result.warnings).toEqual(run(spaced!).warnings);
      expect(result.steps[0]).toMatchObject({ text: "Abso\n", pause: true });
    }
    expect(
      run(`Abso>..\n..lutely.\nAfter.\n`).steps.map((step) => step.text),
    ).toEqual(["Abso\n", "lutely.\n", "After.\n"]);
  });

  test("`Abso>..lutely.` is the mid-line break `Abso >..lutely.` is", () => {
    for (const [touching, spaced] of [
      [`Abso>..lutely.\nAfter.\n`, `Abso >..lutely.\nAfter.\n`],
      [`A>.. B\nAfter.\n`, `A >.. B\nAfter.\n`],
    ]) {
      expect(run(touching!)).toEqual(run(spaced!));
    }
    expect(run(`Abso>..lutely.\nAfter.\n`).steps).toEqual([
      { text: "Abso\n", target: "action", pause: true },
      { text: "lutely.\n", target: "action" },
      { text: "After.\n", target: "action" },
    ]);
  });

  test("`Abso..>..lutely.` carries on in the same box after the click", () => {
    const result = run(`Abso..>..lutely.\nAfter.\n`);
    expect(result).toEqual(run(`Abso.. >..lutely.\nAfter.\n`));
    expect(result.warnings).toEqual([]);
    const [before, after] = result.steps;
    expect(before).toMatchObject({ text: "Abso\n", pause: true, extend: true });
    expect(after).toMatchObject({ text: "lutely.\n", continues: true });
  });

  test("`Abso..>` then `..lutely.` carries on as `Abso.. >` does", () => {
    for (const [touching, spaced] of [
      [`Abso..>\n..lutely.\nAfter.\n`, `Abso.. >\n..lutely.\nAfter.\n`],
      [
        `HERO:\n  Abso..>\n  ..lutely.\nAfter.\n`,
        `HERO:\n  Abso.. >\n  ..lutely.\nAfter.\n`,
      ],
    ]) {
      const result = run(touching!);
      expect(result).toEqual(run(spaced!));
      expect(result.warnings).toEqual([]);
      expect(result.steps[0]).toMatchObject({ pause: true, extend: true });
      expect(result.steps[1]).toMatchObject({ continues: true });
    }
  });

  test("an escaped `>` before a line-ending `..` is text the next line joins", () => {
    const result = run(`A\\>..\n..B\nAfter.\n`);
    expect(result.warnings).toEqual([]);
    expect(result.steps.map((step) => step.text)).toEqual([
      "A>B\n",
      "After.\n",
    ]);
    expect(result.steps.some((step) => step.pause)).toBe(false);
  });

  test("a touching break splits a CRLF line as it splits an LF one", () => {
    // Each is also compared with its spaced LF form, which a `>` that
    // stopped breaking would no longer match.
    const inline = run(`A>B\r\nC>\r\nD\r\n`).steps;
    expect(inline).toEqual(run(`A>B\nC>\nD\n`).steps);
    expect(inline).toEqual(run(`A > B\nC >\nD\n`).steps);
    expect(inline.map((step) => step.text)).toEqual([
      "A\n",
      "B\n",
      "C\n",
      "D\n",
    ]);
    // In a block, the lines between two breaks are one beat.
    const block = run(`HERO:\r\n  A>B\r\n  C>\r\n  D\r\n`).steps;
    expect(block).toEqual(run(`HERO:\n  A>B\n  C>\n  D\n`).steps);
    expect(block).toEqual(run(`HERO:\n  A > B\n  C >\n  D\n`).steps);
    expect(block.map((step) => step.text)).toEqual(["A\n", "B\nC\n", "D\n"]);
  });

  test("a parenthetical before a touching break stays a parenthetical", () => {
    for (const [touching, spaced] of [
      [`HERO:\n  (softly)>Quiet.\n`, `HERO:\n  (softly) > Quiet.\n`],
      [`HERO:\n  (softly)>=z\n`, `HERO:\n  (softly) > =z\n`],
    ]) {
      const result = run(touching!);
      expect(result).toEqual(run(spaced!));
      expect(result.steps.length).toBe(2);
      expect(result.steps[0]).toMatchObject({ pause: true });
    }
  });

  test("a line's tags stay with the beat a touching line-end break ends", () => {
    const ctx = makeRuntimeStoryFromSource(
      `HERO:\n  Hi.># first\n  Bye. # second\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Hi.\n");
    expect(ctx.story.currentTags).toEqual(["first"]);
    expect(ctx.story.Continue()).toBe("Bye.\n");
    expect(ctx.story.currentTags).toEqual(["second"]);
  });

  test("each `>` of `>>` is a break, and so is the `>` of `>=`", () => {
    for (const [touching, spaced] of [
      [`A>>B\n`, `A > > B\n`],
      [`A >> B\n`, `A > > B\n`],
      [`x>=y\n`, `x > =y\n`],
      [`x >= y\n`, `x > = y\n`],
    ]) {
      expect(run(touching!)).toEqual(run(spaced!));
    }
    expect(run(`A>>B\n`).steps.map((step) => step.text)).toEqual([
      "A\n",
      "\n",
      "B\n",
    ]);
    expect(run(`x >= y\n`).steps.map((step) => step.text)).toEqual([
      "x\n",
      "= y\n",
    ]);
  });

  test("an escaped `>` and a text command's `>` are text", () => {
    for (const [source, shown] of [
      [`A \\> B\n`, "A > B\n"],
      [`A\\>B\n`, "A>B\n"],
      [`Go <wait 1> now.\n`, "Go <wait 1> now.\n"],
      [`Go <wait 1 > now.\n`, "Go <wait 1 > now.\n"],
    ] as const) {
      expect(run(source).steps).toEqual([{ text: shown, target: "action" }]);
    }
  });

  test("a divert or tunnel keeps its arrow", () => {
    const divert = run(`A ->b\n\nscene b\n  B\nend\n`);
    expect(divert.steps.map((step) => step.text)).toEqual(["A B\n"]);
    expect(divert.steps.some((step) => step.pause)).toBe(false);
    const tunnel = run(`->->\n`);
    expect(tunnel.steps).toEqual([]);
  });

  test("`-->` is a `-` followed by a divert", () => {
    for (const [dashed, shown] of [
      [`A-->later\n`, "A-Later.\n"],
      [`A --> later\n`, "A -Later.\n"],
      [`A--->later\n`, "A--Later.\n"],
    ]) {
      const scene = `\nscene later\n  Later.\nend\n`;
      expect(run(`${dashed}${scene}`).steps).toEqual([
        { text: shown, target: "action" },
      ]);
    }
    // The word after `-->` is a divert target, so one that names no scene
    // is a compile error, as it is after `->`.
    const dashed = collectDiagnostics(`A-->nowhere\n`).errorMessages;
    expect(dashed).not.toEqual([]);
    expect(dashed).toEqual(collectDiagnostics(`A->nowhere\n`).errorMessages);
  });

  // A divert that begins the text after a break, a cue's colon or a block's
  // indent is where a `DisplayLine` starts reading, ahead of any text chunk.
  test.each([
    ["after a spaced break", `Before > -> later\n`],
    ["after a touching break", `Before>->later\n`],
    ["after a cue", `HERO: -> later\n`],
    ["on a block line", `:\n  Before\n  -> later\n`],
    ["on a dialogue block line", `HERO:\n  -> later\n`],
  ])("a divert %s still diverts", (_label, source) => {
    const shown = run(`${source}\nscene later\n  Later.\nend\n`).steps.map(
      (step) => step.text,
    );
    expect(shown.some((text) => text.includes("->"))).toBe(false);
    expect(shown.at(-1)).toMatch(/Later\.\n$/);
  });

  test("a divert after a break keeps the break's beat first", () => {
    for (const source of [`Before > -> later\n`, `Before>->later\n`]) {
      const { steps: out } = run(`${source}\nscene later\n  Later.\nend\n`);
      expect(out.map((step) => step.text)).toEqual(["Before\n", "Later.\n"]);
      expect(out[0]).toMatchObject({ pause: true });
    }
  });

  test("a `..` right before a `>` is glue, whatever follows the `>`", () => {
    for (const [touching, spaced] of [
      [`Epsilon..>zeta\nAfter.\n`, `Epsilon.. >zeta\nAfter.\n`],
      [`Alpha..>=beta\nAfter.\n`, `Alpha.. >=beta\nAfter.\n`],
      [`Gamma..>>delta\nAfter.\n`, `Gamma.. > >delta\nAfter.\n`],
    ]) {
      const result = run(touching!);
      expect(result).toEqual(run(spaced!));
      expect(result.steps[0]).toMatchObject({ pause: true, extend: true });
    }
  });

  test("a cue's `[>]` is a character position, not a break", () => {
    const { steps: shown } = run(`HERO [>]:\n  Hi.\n`);
    expect(shown).toEqual([
      { text: "Hi.\n", target: "dialogue", character: "HERO" },
    ]);
  });
});
