import { describe, expect, it, vi } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, storyRun } from "./programHarness";

// The lowerer reports an alternator with no arm and emits no sequence
// (#1617), so a compile cannot reach the engine with a sequence of no
// elements. This lowerer builds one the way the lowerer did before, a
// shuffle over no elements, so the engine's own guard is what runs.
vi.mock(
  "../../compiler/lower/lowerers/lowerSparkdownSequentialAlternatorBlock",
  async () => {
    const { Sequence } = await import(
      "../../inkjs/compiler/Parser/ParsedHierarchy/Sequence/Sequence"
    );
    const { SequenceType } = await import(
      "../../inkjs/compiler/Parser/ParsedHierarchy/Sequence/SequenceType"
    );
    const { wrapInWeave } = await import(
      "../../compiler/lower/utils/wrapInWeave"
    );
    return {
      lowerSparkdownSequentialAlternatorBlock: () =>
        wrapInWeave([
          new Sequence([], SequenceType.Cycle | SequenceType.Shuffle),
        ]),
    };
  },
);

describe("a shuffle over a sequence of no elements (#1617)", () => {
  it("is a story error at run, not a throw out of Continue", () => {
    const { program } = compileScript("scene start\n  shuffle done\n  end\nend\n");
    expect(errorsOf(program)).toEqual([]);
    let result: ReturnType<typeof storyRun> | undefined;
    expect(() => {
      result = storyRun(new ProgramStory(program.chunks!), []);
    }).not.toThrow();
    expect(
      result!.errors.some((e) =>
        e.includes("a sequence with no elements has no arm to shuffle to"),
      ),
    ).toBe(true);
  });
});
