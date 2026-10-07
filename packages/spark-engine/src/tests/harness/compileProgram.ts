// Compiles a single in-memory script with the real Sparkdown compiler, for
// suites that need to drive a `Game` through an actual program.

import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";

/** `programChunks` compiles the script to statement chunks, which a game
 *  given the same option runs on the program engine. */
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
    ...(options.programChunks ? { programChunks: true } : {}),
  } as never);
  return compiler.compile({ textDocument: { uri } } as never).program;
};
