// A `match` whose lines are not written as `|` arms (`case 1`) is an error at
// each such line, and a `match` with no arm an error at its keyword, never a
// compile with no program and no diagnostic (#1502).
import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, storyBeats } from "./programHarness";

const NO_ARM = "This line is in no arm of the `match`: an arm starts with `|`, as in `| 1 = One.`";

describe("a match", () => {
  it("reports each line before its first arm", () => {
    const { program } = compileScript(
      [
        "store k = 1",
        "-> main",
        "scene main",
        "  match k",
        "    case 1",
        "      One.",
        "  end",
        "end",
        "",
      ].join("\n"),
    );
    expect(errorsOf(program)).toEqual([
      [4, NO_ARM],
      [5, NO_ARM],
    ]);
  });

  it("reports a match with no arm", () => {
    const { program } = compileScript("store k = 1\nmatch (k)\nend\n");
    expect(errorsOf(program)).toEqual([
      [1, "A `match` needs at least one arm, written `| value = ...`"],
    ]);
  });

  it("reports an inline match with no arm in a display line", () => {
    const noArm: [number, string] = [1, "A `match` needs at least one arm, written `| value = ...`"];
    const { program } = compileScript("store k = 1\nBefore {match (k) end} After.\n");
    expect(errorsOf(program)).toEqual([noArm]);
    // The glued form's own parse reports the missing arm's value as well.
    const glued = compileScript("store k = 1\nBefore .. match (k) .. After.\n").program;
    expect(errorsOf(glued)).toContainEqual(noArm);
  });

  it("still plays a match whose arms are `|` arms, a comment before them", () => {
    const { program } = compileScript(
      'store k = "b"\nmatch (k)\n// the key\n| a = Ay.\n| b = Bee.\nend\n',
    );
    expect(errorsOf(program)).toEqual([]);
    expect(storyBeats(new ProgramStory(program.chunks!)).beats.map((b) => b.text)).toEqual([
      "Bee.\n",
    ]);
  });
});
