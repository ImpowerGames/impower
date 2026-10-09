// A tag written after a line's text belongs to that line's beat, whether a
// space separates it from the text (`door # t`) or not (`door# t`), and on a
// `..` continuation too (#1710). A continue returns at its line's newline and
// never looks past it (docs/engine/binary-program.md, section 6), so a line's
// tags must ride its own display call: a tag touching the text used to be
// parsed as a `# tag` line of its own after the line, whose tags go to the
// next beat, as a standalone tag line's do (Tags.test.ts).

import { describe, expect, test } from "vitest";
import { Op } from "../../program/ProgramInstructions";
import { ProgramStory } from "../../program/ProgramStory";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { chunkOfAddress, offsetOfAddress } from "../../program/ProgramChunk";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import {
  compileScript,
  programSession,
  storyBeats,
} from "../program/programHarness";

const URI = "inmemory:///main.sd";

const compile = (lines: string[]) => {
  const ctx = makeRuntimeStoryFromSource([...lines, ""].join("\n"), URI);
  expect(ctx.errorMessages).toEqual([]);
  return ctx;
};

// Each beat's text and the tags it carries.
function beats(story: {
  canContinue: boolean;
  Continue(): string | null | undefined;
  currentTags: string[] | null | undefined;
}): [string, string[]][] {
  const out: [string, string[]][] = [];
  while (story.canContinue) {
    const text = story.Continue() ?? "";
    const tags = (story.currentTags ?? []).map((tag) => tag.trim());
    if (text || tags.length > 0) out.push([text, tags]);
  }
  return out;
}

const opAt = (root: ProgramRoot, address: number) => {
  const position = root.position(chunkOfAddress(address))!;
  const chunk = position.sequence.arrays.chunks[position.entry]!;
  return BinaryProgramReader.instructionAt(chunk, offsetOfAddress(address)).op;
};

describe("a tag written after a line's text", () => {
  test("is the beat's own, not the next beat's, when it touches the text", () => {
    const ctx = compile(["You see a door# t", "After."]);
    expect(beats(ctx.story)).toEqual([
      ["You see a door\n", ["t"]],
      ["After.\n", []],
    ]);
  });

  test("is the joined beat's on a `..` continuation", () => {
    const ctx = compile(["You see a ..", ".. door# t", "After."]);
    expect(beats(ctx.story)).toEqual([
      ["You see a door\n", ["t"]],
      ["After.\n", []],
    ]);
  });

  test("is the beat's own, each of them, when there are several", () => {
    const ctx = compile(["Hello# t # u", "After."]);
    expect(beats(ctx.story)).toEqual([
      ["Hello\n", ["t", "u"]],
      ["After.\n", []],
    ]);
  });

  // The form with a space was already the beat's own; it stays so.
  test("is the beat's own when a space separates it from the text", () => {
    for (const lines of [
      ["You see a door # t", "After."],
      ["You see a ..", ".. door # t", "After."],
    ]) {
      expect(beats(compile(lines).story), lines.join(" / ")).toEqual([
        ["You see a door\n", ["t"]],
        ["After.\n", []],
      ]);
    }
  });

  // A tag line of its own still goes to the beat after it.
  test("on a line of its own still tags the next beat", () => {
    const ctx = compile(["Before.", "# t", "After."]);
    expect(beats(ctx.story)).toEqual([
      ["Before.\n", []],
      ["After.\n", ["t"]],
    ]);
  });

  test("leaves the line one beat, whose last address is its first", () => {
    const { root } = compile(["You see a door# t", "After."]);
    const first = root.addressAt(URI, 0)!;
    const last = root.addressAt(URI, 0, { beat: "last" })!;
    expect(last).toBe(first);
    expect(opAt(root, last)).toBe(Op.LineStart);
    expect(root.addressAt(URI, 1)).not.toBe(last);
    // What a story stopped at that address shows is the line with its tag.
    const story = new ProgramStory(root);
    story.ChooseAddress(last);
    expect(beats(story)[0]).toEqual(["You see a door\n", ["t"]]);
  });

  // An edit that writes the tag against the text, or moves it off, is
  // compiled again from the edited window, and gives the same beats as a cold
  // compile of the edited script.
  test("is the beat's own after an edit that writes it, as on a cold compile", () => {
    const session = programSession("You see a door\nAfter.\n");
    for (const [before, after, tags] of [
      ["door", "door# t", ["t"]],
      ["door# t", "door # t", ["t"]],
      [" # t", "# t", ["t"]],
      ["# t", "", []],
    ] as const) {
      const root = session.edit(before, after);
      const expected = [
        ["You see a door\n", [...tags]],
        ["After.\n", []],
      ];
      expect(beats(new ProgramStory(root)), session.text).toEqual(expected);
      const { program } = compileScript(session.text);
      expect(beats(new ProgramStory(program.chunks!)), session.text).toEqual(
        expected,
      );
    }
  });

  test("leaves a continuation one statement, whose last address is its first", () => {
    const { root } = compile(["You see a ..", ".. door# t", "After."]);
    const first = root.addressAt(URI, 1)!;
    expect(root.addressAt(URI, 1, { beat: "last" })).toBe(first);
    expect(root.addressAt(URI, 2)).not.toBe(first);
    // The address's location is the continuation's own line.
    expect(root.locationOf(first)).toMatchObject({ startLine: 1, endLine: 1 });
  });

  // Every kind of line that ended at a `#` shows the same beats, tags and
  // display tables for the touching form as for the spaced one, and a line's
  // last address is on that line.
  test("behaves as the spaced form on every kind of display line", () => {
    for (const [touching, spaced] of [
      [["^: A TITLE# t"], ["^: A TITLE # t"]],
      [["$: A HALL# t"], ["$: A HALL # t"]],
      [["%: CUT TO BLACK# t"], ["%: CUT TO BLACK # t"]],
      [["@ Hello# t"], ["@ Hello # t"]],
      [["A > B# t"], ["A > B # t"]],
      [["A ..", ".. B# t"], ["A ..", ".. B # t"]],
      [["store n = 8", "Room# pic{n}"], ["store n = 8", "Room # pic{n}"]],
    ]) {
      const script = (lines: string[]) => [...lines, "After.", ""].join("\n");
      const shown = (lines: string[]) =>
        storyBeats(
          new ProgramStory(compileScript(script(lines)).program.chunks!),
        );
      const label = touching.join(" / ");
      const expected = shown(spaced);
      expect(expected.errors, label).toEqual([]);
      expect(expected.beats.at(-2)?.tags.length, label).toBeGreaterThan(0);
      expect(shown(touching), label).toEqual(expected);
      const root = compileScript(script(touching)).program.chunks!;
      const line = touching.length - 1;
      const last = root.addressAt(URI, line, { beat: "last" })!;
      expect(root.locationOf(last), label).toMatchObject({
        startLine: line,
        endLine: line,
      });
    }
  });
});
