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
  while (story.canContinue && raised === undefined) {
    story.Continue();
  }
  return raised;
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
});
