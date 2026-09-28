// Display beats compiled to statement chunks and run by the program engine
// (#694, docs/engine/binary-program.md): what the writer emits for a display
// statement, that the engine shows every beat the current engine shows, and
// that a program holding a construct the writer does not emit falls back
// whole and names it.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { Op } from "../../program/ProgramInstructions";
import { ProgramStory } from "../../program/ProgramStory";
import {
  H_FINGERPRINT,
  H_LAYOUT_HASH,
} from "../../program/StatementChunk";
import { compileScript, MAIN_URI, storyBeats } from "./programHarness";

const listing = (text: string, flow = "") => {
  const { program } = compileScript(text, { programChunks: true });
  const root = program.chunks!;
  expect(program.fallback).toBeUndefined();
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
    ]);
  });

  // A trailing `..` leaves the line open, which the call's open flag says;
  // the line that begins with `..` continues its beat and names none.
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
      const { program } = compileScript(text, { programChunks: true });
      const chunks = program.chunks!.flowNamed("")!.arrays.chunks;
      const moved = chunks[chunks.length - 1]!;
      return [...moved.subarray(H_FINGERPRINT, H_LAYOUT_HASH + 2)];
    };
    expect(at("One.\nThe same line.\n")).toEqual(
      at("One.\n\n\nTwo.\n  The same line.\n"),
    );
  });

  it("gives each display call a line table row of its own range", () => {
    const { program } = compileScript("Intro.\nFirst > Second.\n", {
      programChunks: true,
    });
    const root = program.chunks!;
    const flow = root.flowNamed("")!;
    const reader = new BinaryProgramReader(root);
    const starts = [...reader.instructions(flow.arrays.chunks[1]!)]
      .filter((instruction) => instruction.op === Op.LineStart)
      .map((instruction) => reader.rangeAt(flow, 1, instruction.offset));
    expect(starts.map((range) => range?.startLine)).toEqual([1, 1]);
    expect(starts[0]!.startColumn).toBeLessThan(starts[1]!.startColumn);
  });
});

// Each script runs from its top on both engines. The current engine is the
// story the compile produced, which holds the debug metadata a warning names
// its line from.
const PARITY: Record<string, string> = {
  "action and dialogue": "Hello there.\nBOB: Hi.\nThe end.\n",
  "a trailing-glue chain": "Some ..\n.. content ..\n.. with glue.\ndone\n",
  "glued dialogue": "HERO: One ..\nHERO: .. two ..\nHERO: .. three.\ndone\n",
  "a glued line before a plain one": "You see a ..\nIt is locked.\nAfter.\n",
  "a leading glue that joins nothing":
    "scene MAIN\n  First.\n  .. Second.\n  Third.\nend\n",
  "a lone leading glue in a block body": "HERO:\n  First.\n  .. second.\ndone\n",
  "breaks": "First >\nLast.\ndone\n",
  "a trailing glue before a break": "First .. >\n.. second.\nLast.\ndone\n",
  "a continuation's beats after a break":
    "HERO: Wait ..\n.. right there. > And then more.\nAfter.\n",
  "tags": "# chapter one\nA line. # mood\nB line # a # b\n",
  "a load line": "load hero villain\nAfter the load.\n",
  "a scene with a block dialogue":
    "scene MAIN\n  In the scene.\n  BOB:\n    (quietly)\n    Hello.\nend\n",
  "fin": "One.\nfin\nTwo.\n",
  "a store beside the lines": "store x = 3\nA plain line.\n",
  "glue inside a block body": "HERO:\n  First ..\n  .. second.\ndone\n",
  "a line with a comment": "A line // with a comment\nB line\n",
  "content after a scene's end": "scene MAIN\n  Inside.\nend\nAfter end.\n",
};

describe("the engine", () => {
  for (const [name, text] of Object.entries(PARITY)) {
    it(`shows ${name} as the current engine does`, () => {
      const from = text.startsWith("scene MAIN") ? "MAIN" : undefined;
      const current = compileScript(text);
      current.story.ResetState();
      const expected = storyBeats(current.story, from);
      const { program } = compileScript(text, { programChunks: true });
      expect(program.fallback).toBeUndefined();
      const actual = storyBeats(new ProgramStory(program.chunks!), from);
      expect(actual).toEqual(expected);
      expect(expected.beats.length).toBeGreaterThan(0);
    });
  }

  it("reports a warning with the line of the call that raised it", () => {
    const { program } = compileScript("First.\n.. Second.\n", {
      programChunks: true,
    });
    const { errors } = storyBeats(new ProgramStory(program.chunks!));
    expect(errors).toEqual([
      "2: RUNTIME WARNING: 'main' line 2: This line begins with `..`, but the line shown before it does not end with `..`, so it does not join it.",
    ]);
  });

  it("runs a display beat once, one instruction a step", () => {
    const { program } = compileScript("One.\nTwo.\nThree.\n", {
      programChunks: true,
    });
    const story = new ProgramStory(program.chunks!);
    const steps: number[] = [];
    while (story.canContinue) {
      const before = story.stepCount;
      story.Continue();
      steps.push(story.stepCount - before);
    }
    // Seven instructions a beat, and the step that finds the flow ended.
    expect(steps).toEqual([7, 7, 7, 1]);
  });

  // After its last beat a flow rests past its last statement, until the step
  // that ends it: a position in no chunk.
  it("restores a state saved after any beat, the last included", () => {
    const { program } = compileScript("One.\nTwo. > Three.\nFour.\n", {
      programChunks: true,
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
    // A save after each beat, and one after the step that ends the flow.
    expect(saves).toHaveLength(whole.length + 1);
    saves.forEach((saved, i) => {
      const resumed = new ProgramStory(root);
      resumed.state.LoadJson(saved);
      expect(resumed.state.toJson()).toBe(saved);
      expect(storyBeats(resumed).beats).toEqual(whole.slice(i + 1));
    });
  });

  // Engines built from one root share its chunks and nothing they write: a
  // function one engine evaluates reads that engine's globals.
  it("keeps the globals of engines that share a root apart", () => {
    const { program } = compileScript(
      "store x = 3\nfunction read_x() return x end\nA line.\n",
      { programChunks: true },
    );
    expect(program.fallback).toBeUndefined();
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

describe("the fallback", () => {
  it("names a construct at the top level, and emits the current program", () => {
    const { program } = compileScript("store x = 3\nOne.\nYou have {x}.\n", {
      programChunks: true,
    });
    expect(program.chunks).toBeUndefined();
    expect(program.compiled).toBeTruthy();
    expect(program.fallback).toEqual({
      construct: "ref",
      uri: MAIN_URI,
      line: 2,
    });
  });

  it("names a block statement at the top level", () => {
    const { program } = compileScript(
      "store x = 3\nOne.\nif x > 1 then\n  Two.\nend\n",
      { programChunks: true },
    );
    expect(program.chunks).toBeUndefined();
    expect(program.fallback).toEqual({
      construct: "Conditional",
      uri: MAIN_URI,
      line: 2,
    });
  });

  // The interpolation stands in the text of the table the display call is
  // given, in a statement of a scene's body.
  it("names a construct nested in a block, with the line of its statement", () => {
    const { program } = compileScript(
      "store x = 3\nscene MAIN\n  One.\n  BOB: You have {x}.\nend\n",
      { programChunks: true },
    );
    expect(program.chunks).toBeUndefined();
    expect(program.fallback).toEqual({
      construct: "ref",
      uri: MAIN_URI,
      line: 3,
    });
  });

  it("names a construct in a scene with the line of its statement", () => {
    const { program } = compileScript(
      "scene MAIN\n  One.\n  choose\n    + [A]\n      Took A.\n  end\nend\n",
      { programChunks: true },
    );
    expect(program.fallback).toEqual({
      construct: "choose",
      uri: MAIN_URI,
      line: 2,
    });
  });

  it("runs a program that fell back on the current engine", () => {
    const text = "store x = 3\nOne.\nYou have {x}.\n";
    const { program } = compileScript(text, { programChunks: true });
    const current = compileScript(text);
    expect(program.compiled).toEqual(current.program.compiled);
  });
});

describe("the switch", () => {
  it("is off by default and then leaves the program as it was", () => {
    const { program } = compileScript("One.\nTwo.\n");
    expect(program.chunks).toBeUndefined();
    expect(program.fallback).toBeUndefined();
    expect(program.compiled).toBeTruthy();
  });

  it("emits no compiled story for a program that has its chunks", () => {
    const { program } = compileScript("One.\nTwo.\n", { programChunks: true });
    expect(program.chunks).toBeDefined();
    expect(program.compiled).toBeUndefined();
  });
});
