// Glued display lines with `experimentalDisplayCalls` on: every line of the
// chain lowers to its own `display(<table>)` call, glue markers between the
// calls hold the step open, and the runtime joins the tables into one step
// whose `currentText` reads the same as the option-off string.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import type { Simulator } from "../../inkjs/engine/Simulator";
import { ObjectValue } from "../../inkjs/engine/Value";

interface Step {
  text: string;
  tables: { target: unknown; character: unknown; text: unknown }[];
}

function field(obj: ObjectValue, key: string): unknown {
  return (obj.value?.get(key) as { value?: unknown } | undefined)?.value;
}

// A route simulator with nothing to say, as a replay's is for every site past
// the end of its route.
const SILENT_SIMULATOR: Simulator = {
  forceCondition: () => null,
  forceChoice: () => null,
  willForceCondition: () => false,
  willForceChoice: () => false,
  saveSnapshot: () => ({ conditionPointer: {}, choicePointer: {} }),
  restoreSnapshot: () => {},
};

function steps(
  source: string,
  experimentalDisplayCalls: boolean,
  simulator?: Simulator,
): Step[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    experimentalDisplayCalls,
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  if (!result.program.compiled) {
    throw new Error("glue-join fixture failed to compile");
  }
  const story = new RuntimeStory(
    result.program.compiled as Record<string, any>,
  );
  const errors: string[] = [];
  story.onError = (m) => errors.push(m);
  story.simulator = simulator ?? null;
  const out: Step[] = [];
  while (story.canContinue) {
    const text = story.Continue() ?? "";
    out.push({
      text,
      tables: story.currentDisplayInstructions.map((t) => ({
        target: field(t, "target"),
        character: field(t, "character"),
        text: field(t, "text"),
      })),
    });
  }
  expect(errors).toEqual([]);
  return out;
}

function texts(source: string, experimentalDisplayCalls: boolean): string[] {
  return steps(source, experimentalDisplayCalls).map((s) => s.text);
}

const LEADING = `Some\n.. content\n.. with glue.\ndone\n`;
const TRAILING = `Some ..\ncontent ..\nwith glue.\ndone\n`;
const DIALOGUE = `HERO: Wait ..\n.. right there.\ndone\n`;

describe("glued display lines lower to display() calls", () => {
  test("a leading-glue chain is one step of three tables", () => {
    const [first] = steps(LEADING, true);
    expect(first!.tables).toEqual([
      { target: "action", character: undefined, text: "Some" },
      { target: undefined, character: undefined, text: " content" },
      { target: undefined, character: undefined, text: " with glue." },
    ]);
  });

  test("a trailing-glue chain is one step of three tables", () => {
    const [first] = steps(TRAILING, true);
    expect(first!.tables).toEqual([
      { target: "action", character: undefined, text: "Some " },
      { target: undefined, character: undefined, text: "content " },
      { target: undefined, character: undefined, text: "with glue." },
    ]);
  });

  test("glued dialogue keeps the cue on the first table only", () => {
    const [first] = steps(DIALOGUE, true);
    expect(first!.tables).toEqual([
      { target: "dialogue", character: "HERO", text: "Wait " },
      { target: undefined, character: undefined, text: " right there." },
    ]);
  });

  test("with the option off no line of a chain is a table", () => {
    for (const source of [LEADING, TRAILING, DIALOGUE]) {
      for (const step of steps(source, false)) {
        expect(step.tables).toEqual([]);
      }
    }
  });
});

describe("currentText of a joined chain", () => {
  test.each([
    ["leading glue", LEADING],
    ["trailing glue", TRAILING],
    ["glued dialogue", DIALOGUE],
    [
      "continuation inside an if branch",
      `You see a\nif true then\n  .. red door.\nend\ndone\n`,
    ],
    [
      "three trailing-glue dialogue lines",
      `HERO: One ..\nHERO: two ..\nHERO: three.\ndone\n`,
    ],
    [
      "mid-body glue in a block dialogue",
      `HERO:\n  First ..\n  second.\ndone\n`,
    ],
    ["a trailing break on its own", `First >\nLast.\ndone\n`],
    [
      "a trailing break followed by a glued line",
      `First >\n.. second.\nLast.\ndone\n`,
    ],
    [
      "a bare interpolation line as the continuation",
      `store count = 3\nYou have ..\n{count}\ndone\n`,
    ],
  ])("%s reads the same with the option off and on", (_name, source) => {
    const on = texts(source, true);
    expect(on.length).toBeGreaterThan(0);
    expect(on.join("").trim().length).toBeGreaterThan(0);
    expect(on).toEqual(texts(source, false));
  });
});

describe("step boundaries around glue", () => {
  test("the line after a glued pair starts its own step", () => {
    const result = steps(`You see a ..\nred door.\nIt is locked.\ndone\n`, true);
    expect(result.map((s) => s.text)).toEqual([
      "You see a red door.\n",
      "It is locked.\n",
    ]);
    expect(result[1]!.tables).toEqual([
      { target: "action", character: undefined, text: "It is locked." },
    ]);
  });

  test("the line after a leading-glue pair starts its own step", () => {
    expect(
      texts(`You see a\n.. red door.\nIt is locked.\ndone\n`, true),
    ).toEqual(["You see a red door.\n", "It is locked.\n"]);
  });

  // The preview replays a route with a simulator attached. A condition the
  // route does not cover, reached by the look-ahead past the target line,
  // keeps its evaluated value, so the branch holding the continuation runs.
  test.each([false, true])(
    "a simulator with no verdict leaves an if to its own value (option %s)",
    (option) => {
      const source = `You see a\nif true then\n  .. red door.\nend\nIt is locked.\n`;
      expect(
        steps(source, option, SILENT_SIMULATOR).map((s) => s.text),
      ).toEqual(["You see a red door.\n", "It is locked.\n"]);
    },
  );

  // A continuation with no visible words leaves the glue pending, as
  // whitespace text does, so the next visible line joins the same step; that
  // line's table then consumes the glue and the line after starts its own.
  // (With the option off the routing tag pair shields the older glue from
  // removal, so it lingers and also swallows the newline before `After.`.)
  test("an empty continuation keeps the step open for the next line only", () => {
    const source = `You see\n.. {if true then "" else ""}\nThe door.\nAfter.\n`;
    expect(texts(source, true)).toEqual(["You see The door.\n", "After.\n"]);
    expect(texts(source, false).join("")).toContain("You see The door.");
  });

  // A tagged continuation lowers to flat text, which leaves its tag's control
  // commands between the pending glue and the next table. The tag is
  // metadata, so the boundaries match the untagged case.
  test("a tag on an empty continuation does not move the step boundary", () => {
    const source = `You see\nif true then\n  .. {if true then "" else ""} # marker\nend\nThe door.\nAfter.\n`;
    const result = steps(source, true);
    expect(result.map((s) => s.text)).toEqual([
      "You see The door.\n",
      "After.\n",
    ]);
  });

  test("a whitespace-only continuation keeps the step open", () => {
    const source = `store x = ""\nFirst\n.. {x}\nLast ..\nword.\nAfter.\n`;
    expect(texts(source, true)).toEqual(["First Last word.\n", "After.\n"]);
  });

  test("a table with empty text still ends its own step", () => {
    const result = steps(
      `& display({ target = "action", text = "" })\n& display({ target = "action", text = "" })\nAfter.\n`,
      true,
    );
    expect(result.map((s) => s.tables.length)).toEqual([1, 1, 1]);
  });
});
