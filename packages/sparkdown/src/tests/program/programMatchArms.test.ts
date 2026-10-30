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
        "scene start",
        "  match k",
        "    case 1",
        "      One.",
        "  end",
        "end",
        "",
      ].join("\n"),
    );
    expect(errorsOf(program)).toEqual([
      [3, NO_ARM],
      [4, NO_ARM],
    ]);
  });

  it("reports a match with no arm", () => {
    const { program } = compileScript("store k = 1\nscene start\n  match (k)\n  end\nend\n");
    expect(errorsOf(program)).toEqual([
      [2, "A `match` needs at least one arm, written `| value = ...`"],
    ]);
  });

  it("reports an inline match with no arm in a display line as the call it is", () => {
    const noArm: [number, string] = [2, "A `match` needs at least one arm, written `| value = ...`"];
    // In Luau code the word opens an alternator only at a `|` (I-1310), so
    // with none it is a call, and the `end` after it is a stray one, as it
    // is after any other call.
    const { program } = compileScript("store k = 1\nscene start\n  Before {match (k) end} After.\nend\n");
    expect(errorsOf(program)).toEqual(errorsOf(compileScript("store k = 1\nscene start\n  Before {foo (k) end} After.\nend\n").program));
    expect(errorsOf(program)).not.toEqual([]);
    // The glued form's own parse reports the missing arm's value as well.
    const glued = compileScript("store k = 1\nscene start\n  Before .. match (k) .. After.\nend\n").program;
    expect(errorsOf(glued)).toContainEqual(noArm);
  });

  it("still plays a match whose arms are `|` arms, a comment before them", () => {
    const { program } = compileScript(
      'store k = "b"\nscene start\n  match (k)\n  // the key\n  | a = Ay.\n  | b = Bee.\n  end\nend\n',
    );
    expect(errorsOf(program)).toEqual([]);
    expect(storyBeats(new ProgramStory(program.chunks!)).beats.map((b) => b.text)).toEqual([
      "Bee.\n",
    ]);
  });
});
