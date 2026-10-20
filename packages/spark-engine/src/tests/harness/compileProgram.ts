// Compiles a single in-memory script with the real Sparkdown compiler, for
// suites that need to drive a `Game` through an actual program.

import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import type { ProgramRoot } from "@impower/sparkdown/src/program/ProgramRoot";

/** The script compiled to statement chunks, which a game runs on the
 *  program engine. */
export const compileProgram = (source: string) => {
  const uri = "inmemory:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler.compile({ textDocument: { uri } } as never).program;
};

/** A fixture's program, which a game runs on the program engine: one that
 *  built statement chunks. Any other throws, naming the errors its compile
 *  reported (a construct the program cannot compile among them). */
export const requireChunks = <
  P extends {
    chunks?: unknown;
    diagnostics?: Record<
      string,
      {
        severity?: number;
        message: string | { value: string };
        range: { start: { line: number } };
      }[]
    >;
  },
>(
  program: P,
  what = "fixture",
): P => {
  if (!program.chunks) {
    const errors = Object.entries(program.diagnostics ?? {}).flatMap(
      ([uri, diagnostics]) =>
        diagnostics
          .filter((d) => d.severity === 1)
          .map(
            (d) =>
              `${uri} line ${d.range.start.line + 1}: ${
                typeof d.message === "string" ? d.message : d.message.value
              }`,
          ),
    );
    throw new Error(
      `${what} failed to compile${errors.length ? `:\n  ${errors.join("\n  ")}` : ""}`,
    );
  }
  return program;
};

/** The program engine's story of a fixture's program (`requireChunks`), as a
 *  game builds it: its declarations run, its globals set. */
export const programStoryOf = (
  program: Parameters<typeof requireChunks>[0],
  what = "fixture",
): ProgramStory =>
  new ProgramStory(requireChunks(program, what).chunks as ProgramRoot);
