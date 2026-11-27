import { describe, expect, it, vi } from "vitest";
import { compileScript, errorsOf, storyBeats } from "./programHarness";
import { BinaryProgramReader } from "../../src/program/BinaryProgramReader";
import { BinaryProgramWriter, describeInstruction } from "../../src/program/BinaryProgramWriter";
import { LINE_START_CONTINUES, Op } from "../../src/program/ProgramInstructions";
import type { ProgramRoot } from "../../src/program/ProgramRoot";
import { layoutOf } from "../../src/program/ProgramSave";
import { ProgramStory } from "../../src/program/ProgramStory";
import { codeOffset, writtenOffset } from "../../src/program/writtenOffsets";

const source = (body: string) => `scene start\n  ${body}\n  After.\nend\n`;

const rootOf = (body: string): ProgramRoot => {
  const { program } = compileScript(source(body));
  expect(errorsOf(program)).toEqual([]);
  return program.chunks!;
};

const rootWithoutClickBeats = (body: string): ProgramRoot => {
  const emitObject = BinaryProgramWriter.prototype.emitObject;
  const spy = vi
    .spyOn(BinaryProgramWriter.prototype, "emitObject")
    .mockImplementation(function (this: BinaryProgramWriter, obj, lineStart) {
      return emitObject.call(
        this,
        obj,
        lineStart === LINE_START_CONTINUES ? undefined : lineStart,
      );
    });
  try {
    return rootOf(body);
  } finally {
    spy.mockRestore();
  }
};

const beatLines = (root: ProgramRoot): number[] => {
  const reader = new BinaryProgramReader(root);
  const lines: number[] = [];
  for (const sequence of root.sequences()) {
    sequence.arrays.chunks.forEach((chunk, entry) => {
      for (const instruction of reader.instructions(chunk)) {
        if (instruction.op === Op.LineStart) {
          lines.push(reader.rangeAt(sequence, entry, instruction.offset)?.startLine ?? -1);
        }
      }
    });
  }
  return lines.sort((a, b) => a - b);
};

const storyOf = (root: ProgramRoot, errors: string[] = [], options = {}) => {
  const story = new ProgramStory(root, options);
  story.keepBeatImages = true;
  story.onError = (message) => {
    errors.push(message);
  };
  return story;
};

describe("a joined line's part after a click is a beat of its own (I-2801)", () => {
  it.each([
    ["a join without a click", "A ..\n  .. B", [1, 3]],
    ["a glued break", "A .. > .. B", [1, 1, 2]],
    ["several glued breaks", "A .. > .. B .. > .. C", [1, 1, 1, 2]],
    ["a break glued after it only", "A > .. B", [1, 1, 2]],
  ])("%s", (_, body, lines) => {
    expect(beatLines(rootOf(body))).toEqual(lines);
  });

  it("a join whose parts a branch separates gains no beat", () => {
    const body =
      "choose\n    HERO: A .. >\n    if true then\n      .. B ..\n    end\n    .. C\n    + [Yes]\n      Fine.\n  end";
    const root = rootOf(body);
    expect(beatLines(root)).toEqual([2, 8, 10]);
    expect(storyBeats(storyOf(root)).beats.map((beat) => beat.text.trim())).toEqual([
      "A",
      "B C",
    ]);
  });

  const SAVED = "A .. > .. B .. > .. C";

  it("a saved position inside the line names the same code whether or not its click beats exist", () => {
    const before = rootWithoutClickBeats(SAVED);
    const after = rootOf(SAVED);
    const chunkOf = (root: ProgramRoot) => root.flowNamed("start")!.arrays.chunks[0]!;
    const rest = (root: ProgramRoot, from: number) =>
      [...new BinaryProgramReader(root).instructions(chunkOf(root))]
        .filter(({ offset, op, flags }) => offset >= from && !(op === Op.LineStart && flags & LINE_START_CONTINUES))
        .map(({ offset }) => describeInstruction(chunkOf(root), offset, root.table));
    expect(layoutOf(chunkOf(after))).toBe(layoutOf(chunkOf(before)));
    for (const { offset } of new BinaryProgramReader(before).instructions(chunkOf(before))) {
      const saved = writtenOffset(chunkOf(before), before.table.strings, offset);
      const loaded = codeOffset(chunkOf(after), after.table.strings, saved);
      expect(rest(after, loaded), String(offset)).toEqual(rest(before, offset));
    }
  });

  it.each([
    [16, 1, ["B", "C", "After."]],
    [1, 1, ["B", "C", "After."]],
    [16, 2, ["C", "After."]],
    [1, 2, ["C", "After."]],
  ])(
    "a save taken before the parts after a click were beats loads where it was (history %s, %s parts shown)",
    (saveHistory, shown, rest) => {
      const before = rootWithoutClickBeats(SAVED);
      expect(beatLines(before)).toEqual([1, 2]);
      const saving = storyOf(before, [], { saveHistory });
      for (let k = 0; k < shown; k += 1) {
        saving.Continue();
      }
      const save = saving.toSave();
      const errors: string[] = [];
      const loaded = storyOf(rootOf(SAVED), errors);
      loaded.loadSave(save);
      expect(loaded.loadedSaveReport?.exact).toBe(true);
      expect(storyBeats(loaded).beats.map((beat) => beat.text.trim())).toEqual(rest);
      expect(errors).toEqual([]);
    },
  );
});
