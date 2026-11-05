import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { errorsOf, programCompiler, scriptFiles, storyRun } from "./programHarness";

const ROOT = "file://proj/";
const MAIN = `${ROOT}main.sd`;
const HELPER = `${ROOT}helper.luau`;

const quiet = <T>(run: () => T): T => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const lines = (...text: string[]) => [...text, ""].join("\n");

const compile = (main: string, helper = 'trail = trail .. "H"') =>
  quiet(() =>
    programCompiler(
      { [MAIN]: main },
      {
        files: [
          ...scriptFiles({ [MAIN]: main }),
          {
            uri: HELPER,
            type: "script",
            name: "helper",
            ext: "luau",
            text: helper,
            version: 1,
            languageId: "luau",
          },
        ] as never,
      },
    ).compile(MAIN),
  ).program;

const beatsOf = (main: string, picks: number[] = []) => {
  const program = compile(main);
  expect(errorsOf(program)).toEqual([]);
  const run = quiet(() => storyRun(new ProgramStory(program.chunks!), picks));
  expect(run.errors).toEqual([]);
  return run.beats.map((beat) => beat.text);
};

describe("a run line inside a block body of a scene", () => {
  it("runs the file where it stands in an if body and in a choice body", () => {
    expect(
      beatsOf(
        lines(
          'store trail = ""',
          "",
          "scene start",
          "  if true then",
          "    run helper",
          "  end",
          "  After if {trail}.",
          "  choose",
          "    + Pick",
          "      run helper",
          "      In choice {trail}.",
          "  end",
          "end",
        ),
        [0],
      ),
    ).toEqual(["After if H.\n", "Pick\n", "In choice HH.\n"]);
  });

  it("runs the file in each taken branch of an if, elseif and else, and not in a skipped one", () => {
    expect(
      beatsOf(
        lines(
          'store trail = ""',
          "",
          "scene start",
          "  if false then",
          "    run helper",
          "  elseif true then",
          "    run helper",
          "    run helper",
          "  else",
          "    run helper",
          "  end",
          "  Trail {trail}.",
          "end",
        ),
      ),
    ).toEqual(["Trail HH.\n"]);
  });

  it("runs the file as often as a loop body runs", () => {
    expect(
      beatsOf(
        lines(
          'store trail = ""',
          "",
          "scene start",
          "  for i = 1, 3 do",
          "    run helper",
          "  end",
          "  Trail {trail}.",
          "end",
        ),
      ),
    ).toEqual(["Trail HHH.\n"]);
  });

  it("runs the file in a choose block's then clause", () => {
    expect(
      beatsOf(
        lines(
          'store trail = ""',
          "",
          "scene start",
          "  choose",
          "    + Pick",
          "  then",
          "    run helper",
          "  end",
          "  Trail {trail}.",
          "end",
        ),
        [0],
      ),
    ).toEqual(["Pick\n", "Trail H.\n"]);
  });

  it("reports a run of a missing file at the line instead of showing it as text", () => {
    const program = compile(
      lines(
        'store trail = ""',
        "",
        "scene start",
        "  if true then",
        "    run missing",
        "  end",
        "  Trail {trail}.",
        "end",
      ),
    );
    const errors = errorsOf(program);
    expect(errors).toHaveLength(1);
    expect(errors[0]![0]).toBe(4);
    expect(errors[0]![1]).toMatch(/missing/);
  });
});
