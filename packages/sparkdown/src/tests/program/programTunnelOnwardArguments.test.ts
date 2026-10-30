// An onward return with arguments to a variable target (#1641) compiles and
// plays: the program engine (#1620), the one compile path since #705, goes on
// to the flow the variable holds with the arguments. This pins that.
import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, storyBeats } from "./programHarness";

describe("an onward return with arguments to a variable target", () => {
  it("compiles and goes on to the flow the variable holds", () => {
    const { program } = compileScript(
      [
        "store goal = -> after",
        "scene start",
        "  -> tunnel ->",
        "end",
        "scene tunnel",
        "  In the tunnel.",
        '  ->-> goal("onward")',
        "end",
        "scene after(how)",
        "  After by {how}.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(errorsOf(program)).toEqual([]);
    expect(storyBeats(new ProgramStory(program.chunks!)).beats.map((b) => b.text)).toEqual([
      "In the tunnel.\n",
      "After by onward.\n",
    ]);
  });
});
