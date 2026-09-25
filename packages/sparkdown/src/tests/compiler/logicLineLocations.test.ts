// A logic line (`& …`) owns the path locations of the instructions it compiles
// to.
//
// `program.pathLocations` is how a host turns a bytecode path back into a
// source line: a runtime error is reported at the line of the path that raised
// it, and preview clicks and breakpoints resolve a line to the paths that
// start on it. A logic line whose instructions have no rows cannot be found
// either way, so its error lands on whatever line the host last recorded.
//
// Compiled the way the player compiles, with the builtins prelude.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
  locationAtRow,
  pathLocation,
} from "../../compiler/utils/pathLocationTable";
import { Story } from "../../inkjs/engine/Story";

const URI = "inmemory:///main.sd";
const MAIN_SCRIPT = 0;

function compile(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const program = (c.compile({ textDocument: { uri: URI } } as never) as any)
    .program;
  if (!program.compiled) {
    throw new Error(
      "fixture failed to compile: " + JSON.stringify(program.diagnostics),
    );
  }
  return program;
}

/** The paths of main.sd whose recorded range starts on `line`. */
const pathsStartingOn = (program: any, line: number): string[] =>
  ((program.pathLocations?.paths ?? []) as string[]).filter((_path, row) => {
    const location = locationAtRow(program.pathLocations, row)!;
    return location[0] === MAIN_SCRIPT && location[1] === line;
  });

/** The main.sd diagnostics whose message matches `pattern`. */
const matching = (program: any, pattern: RegExp): any[] =>
  ((program.diagnostics?.[URI] ?? []) as any[]).filter((d) =>
    pattern.test(d.message?.value ?? d.message ?? ""),
  );

/** The 0-based lines of main.sd diagnostics whose message matches `pattern`. */
const warningsMatching = (program: any, pattern: RegExp): number[] =>
  matching(program, pattern).map((d) => d.range.start.line);

/** Where and how severe each main.sd diagnostic matching `pattern` is. */
const diagnosticsMatching = (program: any, pattern: RegExp) =>
  matching(program, pattern).map((d) => ({
    line: d.range.start.line,
    character: d.range.start.character,
    severity: d.severity,
  }));

/** Everything the story writes when run to its end with no choices. */
function runText(program: any): string {
  const story = new Story(program.compiled as Record<string, any>);
  let text = "";
  for (let step = 0; step < 100 && story.canContinue; step++) {
    text += story.Continue();
  }
  return text;
}

/** Run the story until it raises, and return the path the error was raised at. */
function raisedPath(program: any): string | undefined {
  const story = new Story(program.compiled as Record<string, any>);
  let raised: string | undefined;
  const addError = story.AddError.bind(story);
  story.AddError = ((...args: Parameters<typeof story.AddError>) => {
    raised ??= story.state.currentPointer.path?.toString();
    return addError(...args);
  }) as typeof story.AddError;
  story.onError = () => {};
  for (let step = 0; step < 100 && raised === undefined; step++) {
    if (story.canContinue) {
      story.Continue();
    } else if (story.currentChoices.length > 0) {
      story.ChooseChoiceIndex(0);
    } else {
      break;
    }
  }
  return raised;
}

/** The 0-based line the error raised by running `source` is located on. */
function raisedLine(source: string): number | undefined {
  const program = compile(source);
  const path = raisedPath(program);
  expect(path, "the story did not raise").toBeDefined();
  const location = pathLocation(program.pathLocations, path!);
  expect(location, `no location for raised path ${path}`).toBeDefined();
  expect(location![0]).toBe(MAIN_SCRIPT);
  return location![1];
}

describe("logic lines own their instructions' path locations (#824)", () => {
  it("an error raised by a logic line resolves to that line", () => {
    const program = compile(`A\n& error("boom")\nC\n`);
    const path = raisedPath(program);
    expect(path, "the story did not raise").toBeDefined();
    const location = pathLocation(program.pathLocations, path!);
    expect(location, `no location for raised path ${path}`).toBeDefined();
    expect(location![0]).toBe(MAIN_SCRIPT);
    expect(location![1]).toBe(1);
  });

  it("a reassignment logic line has paths starting on it", () => {
    const program = compile(`store x = 0\nA\n& x = 1\n.. B\n`);
    expect(pathsStartingOn(program, 2)).not.toEqual([]);
  });

  it("a function-call logic line has paths starting on it", () => {
    const program = compile(`A\n& print("hi")\nC\n`);
    expect(pathsStartingOn(program, 1)).not.toEqual([]);
  });

  it("an error raised by a logic line in a scene body resolves to that line", () => {
    // A scene body's lines are re-parented under the scene's root weave, whose
    // range is the scene header's.
    const program = compile(
      `-> start\n\nscene start\n  A\n  & error("boom")\n  C\nend\n`,
    );
    const path = raisedPath(program);
    expect(path, "the story did not raise").toBeDefined();
    const location = pathLocation(program.pathLocations, path!);
    expect(location, `no location for raised path ${path}`).toBeDefined();
    expect(location![0]).toBe(MAIN_SCRIPT);
    expect(location![1]).toBe(4);
  });

  it("an error raised by a property assignment logic line resolves to that line", () => {
    expect(raisedLine(`store t = {}\nA\n& t.x = error("boom")\nC\n`)).toBe(2);
  });

  it("a property assignment logic line has paths starting on it", () => {
    const program = compile(`store t = {}\nA\n& t.x = 1\nC\n`);
    expect(pathsStartingOn(program, 2)).not.toEqual([]);
  });

  it("an error raised by a logic line in a choice body resolves to that line", () => {
    expect(
      raisedLine(`A\nchoose\n  + [Go]\n    & error("boom")\nthen\nC\n`),
    ).toBe(3);
  });

  it("an error raised by a logic line in a queue arm resolves to that line", () => {
    expect(raisedLine(`A\nqueue\n  |\n    & error("boom")\nend\nC\n`)).toBe(3);
  });

  it("a function value assigned on a logic line gets no divert-target hint", () => {
    // The line now has a location, so any warning its statements raise reaches
    // the editor. An anonymous function is a function value, not a misused
    // `-> target`.
    const program = compile(`A\n& f = function() return 1 end\nC\n`);
    expect(warningsMatching(program, /divert target like that/)).toEqual([]);
  });

  it("an authored divert target misused on a logic line still gets the hint, as a warning on that line", () => {
    const program = compile(
      `store x = 0\nA\n& x = (-> later) + 1\nC\n-> DONE\n\nscene later\n  B\nend\n`,
    );
    expect(diagnosticsMatching(program, /divert target like that/)).toEqual([
      { line: 2, character: 0, severity: 2 },
    ]);
  });

  it("a `& local` declaration's warning reaches the editor on its line", () => {
    const program = compile(
      `A\n& local x = (-> later) + 1\nC\n-> DONE\n\nscene later\n  B\nend\n`,
    );
    expect(diagnosticsMatching(program, /divert target like that/)).toEqual([
      { line: 1, character: 0, severity: 2 },
    ]);
  });

  it("an error raised by a `& local` declaration resolves to that line", () => {
    expect(raisedLine(`A\n& local x = error("boom")\nC\n`)).toBe(1);
  });

  it("a `& local` shadowed in a block reports no duplicate identifier and reads the right binding", () => {
    // Luau lets a `local` be declared again in a nested block; the inner one
    // shadows the outer until the block ends.
    const program = compile(
      `& local x = 1\nif true then\n  & local x = 2\n  Inner {x}.\nend\nOuter {x}.\n`,
    );
    expect(diagnosticsMatching(program, /Duplicate identifier/)).toEqual([]);
    expect(runText(program)).toBe("Inner 2.\nOuter 1.\n");
  });

  it("a `& local` declared again in the same block reports no duplicate identifier", () => {
    const program = compile(`& local x = 1\n& local x = x + 1\nValue {x}.\n`);
    expect(diagnosticsMatching(program, /Duplicate identifier/)).toEqual([]);
    expect(runText(program)).toBe("Value 2.\n");
  });

  it("a definition's assignments get no paths", () => {
    // A `define` body is not a logic line and not a place PLAY can start.
    const program = compile(`define config.thing:\n  value = 1\n`);
    expect(pathsStartingOn(program, 1)).toEqual([]);
  });
});
