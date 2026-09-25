// Glued display lines: every line of the chain lowers to its own
// `display(<table>)` call, every call but the last is `glue` so its newline
// waits, every call but the first begins with `..` and takes the wait up, and
// the runtime joins the tables into one step whose `currentText` reads as the
// flat text of the lowering the tables replaced. Those texts were captured
// from that lowering at commit ffd59219a.

import { describe, expect, test } from "vitest";
import { continueShowedSomething } from "../runtime/runtimeTestHarness";
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
};

function steps(source: string, simulator?: Simulator): Step[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
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
    if (!continueShowedSomething(story)) continue;
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

function texts(source: string): string[] {
  return steps(source).map((s) => s.text);
}

const TOUCHING = `Some..\n..content..\n..with glue.\ndone\n`;
const TRAILING = `Some ..\n.. content ..\n.. with glue.\ndone\n`;
const DIALOGUE = `HERO: Wait ..\n.. right there.\ndone\n`;

describe("glued display lines lower to display() calls", () => {
  test("a touching-glue chain is one step of three tables", () => {
    const [first] = steps(TOUCHING);
    expect(first!.tables).toEqual([
      { target: "action", character: undefined, text: "Some" },
      { target: undefined, character: undefined, text: "content" },
      { target: undefined, character: undefined, text: "with glue." },
    ]);
  });

  test("a trailing-glue chain is one step of three tables", () => {
    const [first] = steps(TRAILING);
    expect(first!.tables).toEqual([
      { target: "action", character: undefined, text: "Some " },
      { target: undefined, character: undefined, text: "content " },
      { target: undefined, character: undefined, text: "with glue." },
    ]);
  });

  test("glued dialogue keeps the cue on the first table only", () => {
    const [first] = steps(DIALOGUE);
    expect(first!.tables).toEqual([
      { target: "dialogue", character: "HERO", text: "Wait " },
      { target: undefined, character: undefined, text: "right there." },
    ]);
  });
});

describe("currentText of a joined chain", () => {
  test.each([
    ["touching glue", TOUCHING, ["Somecontentwith glue.\n"]],
    ["trailing glue", TRAILING, ["Some content with glue.\n"]],
    ["glued dialogue", DIALOGUE, ["Wait right there.\n"]],
    [
      "continuation inside an if branch",
      `You see a ..\nif true then\n  .. red door.\nend\ndone\n`,
      ["You see a red door.\n"],
    ],
    [
      "three trailing-glue dialogue lines",
      `HERO: One ..\nHERO: .. two ..\nHERO: .. three.\ndone\n`,
      ["One two three.\n"],
    ],
    [
      "mid-body glue in a block dialogue",
      `HERO:\n  First ..\n  .. second.\ndone\n`,
      ["First second.\n"],
    ],
    [
      "a trailing break on its own",
      `First >\nLast.\ndone\n`,
      ["First\n", "Last.\n"],
    ],
    [
      "a trailing break the next line carries on after",
      `First .. >\n.. second.\nLast.\ndone\n`,
      ["First\n", "second.\n", "Last.\n"],
    ],
    [
      "a bare interpolation line as the continuation",
      `store count = 3\nYou have ..\n.. {count}\ndone\n`,
      ["You have 3\n"],
    ],
  ])("%s reads as the flat text did", (_name, source, expected) => {
    expect(texts(source)).toEqual(expected);
  });
});

describe("step boundaries around glue", () => {
  test("the line after a glued pair starts its own step", () => {
    const result = steps(`You see a ..\n.. red door.\nIt is locked.\ndone\n`);
    expect(result.map((s) => s.text)).toEqual([
      "You see a red door.\n",
      "It is locked.\n",
    ]);
    expect(result[1]!.tables).toEqual([
      { target: "action", character: undefined, text: "It is locked." },
    ]);
  });

  // The preview replays a route with a simulator attached. A condition the
  // route does not cover keeps its evaluated value, so the branch holding the
  // continuation runs.
  test("a simulator with no verdict leaves an if to its own value", () => {
    const source = `You see a ..\nif true then\n  .. red door.\nend\nIt is locked.\n`;
    expect(steps(source, SILENT_SIMULATOR).map((s) => s.text)).toEqual([
      "You see a red door.\n",
      "It is locked.\n",
    ]);
  });

  // A continuation with no visible words that ends with `..` keeps the step
  // open, so the next visible line joins the same step and the line after it
  // starts its own.
  test("an empty continuation keeps the step open for the next line only", () => {
    const source = `You see ..\n.. {if true then "" else ""} ..\n.. The door.\nAfter.\n`;
    expect(texts(source)).toEqual(["You see The door.\n", "After.\n"]);
  });

  // The tag is metadata, so the boundaries match the untagged case.
  test("a tag on an empty continuation does not move the step boundary", () => {
    const source = `You see ..\nif true then\n  .. {if true then "" else ""} .. # marker\nend\n.. The door.\nAfter.\n`;
    const result = steps(source);
    expect(result.map((s) => s.text)).toEqual([
      "You see The door.\n",
      "After.\n",
    ]);
  });

  test("a whitespace-only continuation keeps the step open", () => {
    const source = `store x = ""\nFirst ..\n.. {x} ..\n.. Last ..\n.. word.\nAfter.\n`;
    expect(texts(source)).toEqual(["First Last word.\n", "After.\n"]);
  });

  test("a table with empty text still ends its own step", () => {
    const result = steps(
      `& display({ target = "action", text = "" })\n& display({ target = "action", text = "" })\nAfter.\n`,
    );
    expect(result.map((s) => s.tables.length)).toEqual([1, 1, 1]);
  });
});
