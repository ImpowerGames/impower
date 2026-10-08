// `buildDefinesContext` over the binary program's engine (#698): the define
// tables the program's declaration chunks build, with the functions each
// define writes as its methods, read as the current engine's tables are read.
// For the builtins prelude, which the player seeds into every story it
// compiles, and for the project `SPARKDOWN_PROJECT` names (a directory
// holding `main.sd`, read as the player's workspace reads it). A project's
// defines are declared in the scripts its `main.sd` includes, and its flows
// may hold what the program engine does not run yet, which makes a program
// fall back as a whole, so `main.sd` is cut before its first flow.
import "@impower/sparkdown/src/inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import {
  MAIN_URI,
  configurePlayerCompiler,
  loadProjectFiles,
} from "../../../../../scripts/bench/benchProject";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";

/** A compile of `files` configured as the player's worker configures its
 *  compiler, and the story it produced. */
function compile(files: any[], programChunks: boolean) {
  const compiler = new SparkdownCompiler();
  let story: Story | undefined;
  compiler.addEventListener("compiler/didCompile", (params) => {
    story = params.story as Story | undefined;
  });
  const startFrom = { file: MAIN_URI, line: 0 };
  configurePlayerCompiler(compiler, files, startFrom, { programChunks });
  const program = compiler.compile({
    textDocument: { uri: MAIN_URI },
    startFrom,
  } as never).program;
  return { program, story: story! };
}

/** The define context each engine builds for `files`. */
function contexts(files: any[]) {
  const current = compile(files, false);
  current.story.ResetState();
  const chunked = compile(files, true);
  expect(chunked.program.chunks).toBeDefined();
  return {
    current: buildDefinesContext(current.story),
    program: buildDefinesContext(
      new ProgramStory(chunked.program.chunks!) as never,
    ),
  };
}

const script = (uri: string, text: string) => ({
  uri,
  type: "script",
  name: uri.split("/").at(-1)!.split(".")[0]!,
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

describe("the define context over the program engine", () => {
  it("is the current engine's for the builtins prelude", () => {
    const { current, program } = contexts([script(MAIN_URI, "A line.\n")]);
    expect(Object.keys(current).length).toBeGreaterThan(10);
    expect(program).toEqual(current);
  });
});

const PROJECT = process.env["SPARKDOWN_PROJECT"];

describe.skipIf(!PROJECT)("the define context of a project over the program engine", () => {
  it("is the current engine's for the scripts the project includes", () => {
    const files = loadProjectFiles(PROJECT!).map((file: any) => {
      if (file.uri !== MAIN_URI) {
        return file;
      }
      // The declarations and includes above the first divert or flow.
      const text = file.text as string;
      const first = text.search(/^(->|scene\s|branch\s)/m);
      return { ...file, text: first < 0 ? text : text.slice(0, first) };
    });
    const { current, program } = contexts(files);
    expect(Object.keys(current).length).toBeGreaterThan(10);
    expect(program).toEqual(current);
  });
});
