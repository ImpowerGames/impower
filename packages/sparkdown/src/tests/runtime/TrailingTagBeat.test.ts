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
  const ctx = makeRuntimeStoryFromSource(
    ["scene start", ...lines.map((line) => `  ${line}`), "end", ""].join("\n"),
    URI,
  );
  expect(ctx.errorMessages).toEqual([]);
  return ctx;
};

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

  test("on a line of its own still tags the next beat", () => {
    const ctx = compile(["Before.", "# t", "After."]);
    expect(beats(ctx.story)).toEqual([
      ["Before.\n", []],
      ["After.\n", ["t"]],
    ]);
  });

  test("leaves the line one beat, whose last address is its first", () => {
    const { root } = compile(["You see a door# t", "After."]);
    const first = root.addressAt(URI, 1)!;
    const last = root.addressAt(URI, 1, { beat: "last" })!;
    expect(last).toBe(first);
    expect(opAt(root, last)).toBe(Op.LineStart);
    expect(root.addressAt(URI, 2)).not.toBe(last);
    const story = new ProgramStory(root);
    story.ChooseAddress(last);
    expect(beats(story)[0]).toEqual(["You see a door\n", ["t"]]);
  });

  test("is the beat's own after an edit that writes it, as on a cold compile", () => {
    const session = programSession(
      "scene start\n  You see a door\n  After.\nend\n",
    );
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
    const first = root.addressAt(URI, 2)!;
    expect(root.addressAt(URI, 2, { beat: "last" })).toBe(first);
    expect(root.addressAt(URI, 3)).not.toBe(first);
    expect(root.locationOf(first)).toMatchObject({ startLine: 2, endLine: 2 });
  });

  test("behaves as the spaced form on every kind of display line", () => {
    const pairs: [touching: string[], spaced: string[]][] = [
      [["^: A TITLE# t"], ["^: A TITLE # t"]],
      [["$: A HALL# t"], ["$: A HALL # t"]],
      [["%: CUT TO BLACK# t"], ["%: CUT TO BLACK # t"]],
      [["@ Hello# t"], ["@ Hello # t"]],
      [["A > B# t"], ["A > B # t"]],
      [["A ..", ".. B# t"], ["A ..", ".. B # t"]],
      [["store n = 8", "Room# pic{n}"], ["store n = 8", "Room # pic{n}"]],
    ];
    for (const [touching, spaced] of pairs) {
      const script = (lines: string[]) => {
        const declared = lines.filter((line) => line.startsWith("store "));
        const story = [...lines.filter((line) => !declared.includes(line)), "After."];
        return [
          ...declared,
          "scene start",
          ...story.map((line) => `  ${line}`),
          "end",
          "",
        ].join("\n");
      };
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
      const line = touching.length;
      const last = root.addressAt(URI, line, { beat: "last" })!;
      expect(root.locationOf(last), label).toMatchObject({
        startLine: line,
        endLine: line,
      });
    }
  });
});
