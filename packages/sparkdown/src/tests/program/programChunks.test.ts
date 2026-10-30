import { describe, expect, it } from "vitest";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { Op } from "../../program/ProgramInstructions";
import { ProgramStory } from "../../program/ProgramStory";
import {
  H_FINGERPRINT,
  H_LAYOUT_HASH,
} from "../../program/ProgramChunk";
import { TOP_LEVEL_STATEMENT_MESSAGE } from "../../compiler/utils/declarationOnly";
import { unsupportedConstructMessage } from "../../compiler/utils/unsupportedConstructMessage";
import { compileScript, errorsOf, storyBeats } from "./programHarness";

const PREAMBLE_THEN =
  "  if true then\n    * [B]\n    label mid\n    * [C]\n  end\n";
const PREAMBLE_THEN_CONSTRUCT = "a label between choices an if gates";
const indent = (text: string) =>
  text
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");

const inStart = (text: string) => `scene start\n${indent(text)}end\n`;

const listing = (text: string, flow = "start") => {
  const { program } = compileScript(inStart(text));
  const root = program.chunks!;
  expect(program.chunks).toBeDefined();
  return new BinaryProgramReader(root)
    .listing(root.flowNamed(flow)!)
    .filter((line) => line.startsWith(" "))
    .map((line) => line.trim().replace(/^\d+: /, ""));
};

describe("the writer", () => {
  it("emits an action line as its table and one display call", () => {
    expect(listing("Hello there.\n")).toEqual([
      "LineStart",
      'Str "target"',
      'Str "action"',
      'Str "text"',
      'Str "Hello there."',
      "MakeTable 2",
      "CallStd display/1 flags 1",
      "Done",
    ]);
  });

  it("emits a dialogue line with its cue", () => {
    expect(listing("BOB: Hi.\n")).toEqual([
      "LineStart",
      'Str "target"',
      'Str "dialogue"',
      'Str "character"',
      'Str "BOB"',
      'Str "text"',
      'Str "Hi."',
      "MakeTable 3",
      "CallStd display/1 flags 1",
      "Done",
    ]);
  });

  it("marks a trailing glue open and gives its continuation no line start", () => {
    const lines = listing("You see a ..\n.. red door.\n");
    expect(lines.filter((line) => line.startsWith("CallStd"))).toEqual([
      "CallStd display/1 flags 3",
      "CallStd display/1 flags 1",
    ]);
    expect(lines.filter((line) => line === "LineStart")).toHaveLength(1);
  });

  it("keeps a statement's fingerprint and layout when the statement moves", () => {
    const at = (text: string) => {
      const { program } = compileScript(inStart(text));
      const chunks = program.chunks!.flowNamed("start")!.arrays.chunks;
      const moved = chunks[chunks.length - 1]!;
      return [...moved.subarray(H_FINGERPRINT, H_LAYOUT_HASH + 2)];
    };
    expect(at("One.\nThe same line.\n")).toEqual(
      at("One.\n\n\nTwo.\n  The same line.\n"),
    );
  });

  it("gives each display call a line table row of its own range", () => {
    const { program } = compileScript(inStart("Intro.\nFirst > Second.\n"), {
    });
    const root = program.chunks!;
    const flow = root.flowNamed("start")!;
    const reader = new BinaryProgramReader(root);
    const starts = [...reader.instructions(flow.arrays.chunks[1]!)]
      .filter((instruction) => instruction.op === Op.LineStart)
      .map((instruction) => reader.rangeAt(flow, 1, instruction.offset));
    expect(starts.map((range) => range?.startLine)).toEqual([2, 2]);
    expect(starts[0]!.startColumn).toBeLessThan(starts[1]!.startColumn);
  });
});

type Shown = string | { text: string; tags?: string[]; tables?: [string, unknown][][] };

const unjoined = (line: number) =>
  `RUNTIME WARNING: 'main' line ${line}: This line begins with \`..\`, but the line shown before it does not end with \`..\`, so it does not join it.`;

const SHOWS: Record<string, [string, Shown[], string[]?]> = {
  "action and dialogue": [
    inStart("Hello there.\nBOB: Hi.\nThe end.\n"),
    [
      { text: "Hello there.", tables: [[["target", "action"], ["text", "Hello there."]]] },
      { text: "Hi.", tables: [[["target", "dialogue"], ["character", "BOB"], ["text", "Hi."]]] },
      { text: "The end.", tables: [[["target", "action"], ["text", "The end."]]] },
    ],
  ],
  "a trailing-glue chain": [inStart("Some ..\n.. content ..\n.. with glue.\ndone\n"), ["Some content with glue."]],
  "glued dialogue": [inStart("HERO: One ..\nHERO: .. two ..\nHERO: .. three.\ndone\n"), ["One two three."]],
  "a glued line before a plain one": [
    inStart("You see a ..\nIt is locked.\nAfter.\n"),
    ["You see a", "It is locked.", "After."],
  ],
  "a leading glue that joins nothing": [
    inStart("First.\n.. Second.\nThird.\n"),
    ["First.", "Second.", "Third."],
    [`2: ${unjoined(3)}`],
  ],
  "a lone leading glue in a block body": [
    inStart("HERO:\n  First.\n  .. second.\ndone\n"),
    ["First.\nsecond."],
    [`2: ${unjoined(4)}`],
  ],
  "breaks": [inStart("First >\nLast.\ndone\n"), ["First", "Last."]],
  "a trailing glue before a break": [inStart("First .. >\n.. second.\nLast.\ndone\n"), ["First", "second.", "Last."]],
  "a continuation's beats after a break": [
    inStart("HERO: Wait ..\n.. right there. > And then more.\nAfter.\n"),
    ["Wait right there.", "And then more.", "After."],
  ],
  "tags": [
    inStart("# chapter one\nA line. # mood\nB line # a # b\n"),
    [
      { text: "A line.", tags: ["chapter one", "mood"] },
      { text: "B line", tags: ["a", "b"] },
    ],
  ],
  "a load line": [
    inStart("load hero villain\nAfter the load.\n"),
    [{ text: "", tables: [[["load", "hero villain"]]] }, "After the load."],
  ],
  "a scene with a block dialogue": [
    inStart("In the scene.\nBOB:\n  (quietly)\n  Hello.\n"),
    ["In the scene.", "(quietly)\nHello."],
  ],
  "fin": [inStart("One.\nfin\nTwo.\n"), ["One."]],
  "a store beside the lines": ["store x = 3\n" + inStart("A plain line.\n"), ["A plain line."]],
  "glue inside a block body": [inStart("HERO:\n  First ..\n  .. second.\ndone\n"), ["First second."]],
  "a line with a comment": [inStart("A line // with a comment\nB line\n"), ["A line", "B line"]],
};

describe("the engine", () => {
  for (const [name, [text, beats, errors = []]] of Object.entries(SHOWS)) {
    it(`shows ${name}`, () => {
      const { program } = compileScript(text);
      expect(program.chunks).toBeDefined();
      const actual = storyBeats(new ProgramStory(program.chunks!));
      const shown = actual.beats.map((beat, i): Shown => {
        const want = beats[i];
        const text = beat.text.trim();
        if (typeof want !== "object") return text;
        return {
          text,
          ...(want.tags ? { tags: beat.tags } : {}),
          ...(want.tables ? { tables: beat.tables as [string, unknown][][] } : {}),
        };
      });
      expect(shown).toEqual(beats);
      expect(actual.errors).toEqual(errors);
    });
  }

  it("reports a statement written after a scene's end at the top level", () => {
    const { program } = compileScript("scene start\n  Inside.\nend\nAfter end.\n");
    expect(errorsOf(program)).toContainEqual([3, TOP_LEVEL_STATEMENT_MESSAGE]);
  });
  it("reports a warning with the line of the call that raised it", () => {
    const { program } = compileScript(inStart("First.\n.. Second.\n"), {
    });
    const { errors } = storyBeats(new ProgramStory(program.chunks!));
    expect(errors).toEqual([
      "2: RUNTIME WARNING: 'main' line 3: This line begins with `..`, but the line shown before it does not end with `..`, so it does not join it.",
    ]);
  });

  it("runs a display beat once, one instruction a step", () => {
    const { program } = compileScript(inStart("One.\nTwo.\nThree.\n"), {
    });
    const story = new ProgramStory(program.chunks!);
    const steps: number[] = [];
    while (story.canContinue) {
      const before = story.stepCount;
      story.Continue();
      steps.push(story.stepCount - before);
    }
    expect(steps).toEqual([7, 7, 7, 1]);
  });

  it("restores a state saved after any beat, the last included", () => {
    const { program } = compileScript(inStart("One.\nTwo. > Three.\nFour.\n"), {
    });
    const root = program.chunks!;
    const whole = storyBeats(new ProgramStory(root)).beats;
    expect(whole).toHaveLength(4);
    const story = new ProgramStory(root);
    const saves: string[] = [];
    while (story.canContinue) {
      story.Continue();
      saves.push(story.state.toJson());
    }
    expect(saves).toHaveLength(whole.length + 1);
    saves.forEach((saved, i) => {
      const resumed = new ProgramStory(root);
      resumed.state.LoadJson(saved);
      expect(resumed.state.toJson()).toBe(saved);
      expect(storyBeats(resumed).beats).toEqual(whole.slice(i + 1));
    });
  });

  it("keeps the globals of engines that share a root apart", () => {
    const { program } = compileScript(
      "store x = 3\nfunction read_x() return x end\n" + inStart("A line.\n"),
      {},
    );
    expect(program.chunks).toBeDefined();
    const root = program.chunks!;
    const first = new ProgramStory(root);
    first.variablesState.$("x", 9);
    expect(first.EvaluateFunction("read_x")).toBe(9);
    const second = new ProgramStory(root);
    expect(second.variablesState.$("x")).toBe(3);
    second.variablesState.$("x", 17);
    expect(first.variablesState.$("x")).toBe(9);
    expect(first.EvaluateFunction("read_x")).toBe(9);
    expect(second.EvaluateFunction("read_x")).toBe(17);
  });
});

describe("a construct the program cannot build", () => {
  it("is reported at the top level, and makes no program", () => {
    const { program } = compileScript(
      "external message(x)\n\n" + inStart("One.\nTwo.\nThree.\n"),
      {},
    );
    expect(program.chunks).toBeUndefined();
    expect(errorsOf(program)).toContainEqual([0, unsupportedConstructMessage("external")]);
  });

  it("is reported nested in a block, at the line of its statement", () => {
    const { program } = compileScript(
      "scene MAIN\n  One.\n  BOB: You were here {LIST_RANDOM(MAIN)} times.\nend\n",
      {},
    );
    expect(program.chunks).toBeUndefined();
    expect(errorsOf(program)).toContainEqual([2, unsupportedConstructMessage("list")]);
  });

  it.each([
    "LIST_ALL(t)",
    "LIST_COUNT(t)",
    "LIST_INVERT(t)",
    "LIST_MAX(t)",
    "LIST_MIN(t)",
    "LIST_RANDOM(t)",
    "LIST_RANGE(t, 1, 2)",
    "LIST_VALUE(t)",
  ])("is reported for the list builtin %s", (call) => {
    const { program } = compileScript(
      `store t = {1, 2}\nscene MAIN\n  One {${call}}.\nend\n`,
      {},
    );
    expect(program.chunks).toBeUndefined();
    expect(errorsOf(program)).toContainEqual([2, unsupportedConstructMessage("list")]);
  });

  it("is reported in a scene at the line of its statement", () => {
    const { program } = compileScript(
      `scene MAIN\n  One.\n  choose\n${indent(PREAMBLE_THEN)}    + [A]\n      Took A.\n  end\nend\n`,
      {},
    );
    expect(program.chunks).toBeUndefined();
    expect(errorsOf(program)).toContainEqual([2, unsupportedConstructMessage(PREAMBLE_THEN_CONSTRUCT)]);
  });

});
