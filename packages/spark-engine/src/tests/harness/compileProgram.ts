// Compiles a single in-memory script with the real Sparkdown compiler, for
// suites that need to drive a `Game` through an actual program.

import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import type { ProgramRoot } from "@impower/sparkdown/src/program/ProgramRoot";

/** The script compiled to statement chunks, which a game runs on the
 *  program engine; with `programChunks` false, for the current engine. */
export const compileProgram = (
  source: string,
  options: { programChunks?: boolean } = {},
) => {
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
    ...(options.programChunks === undefined
      ? {}
      : { programChunks: options.programChunks }),
  } as never);
  return compiler.compile({ textDocument: { uri } } as never).program;
};

/** A fixture's program, which a game runs on the program engine: one that
 *  built statement chunks without falling back. Any other throws, naming the
 *  construct a fallback names, so a fixture never runs on the current engine
 *  without saying so. */
export const requireChunks = <
  P extends {
    chunks?: unknown;
    fallback?: { construct: string; uri: string; line: number };
  },
>(
  program: P,
  what = "fixture",
): P => {
  if (program.fallback) {
    const { construct, uri, line } = program.fallback;
    throw new Error(
      `${what} falls back to the current engine for ${construct} at ${uri} line ${line + 1}`,
    );
  }
  if (!program.chunks) {
    throw new Error(`${what} failed to compile`);
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
