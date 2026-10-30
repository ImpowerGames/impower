import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import type { ProgramRoot } from "@impower/sparkdown/src/program/ProgramRoot";

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

export const programStoryOf = (
  program: Parameters<typeof requireChunks>[0],
  what = "fixture",
): ProgramStory =>
  new ProgramStory(requireChunks(program, what).chunks as ProgramRoot);
