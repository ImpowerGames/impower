// `buildDefinesContext` over the binary program's engine (#698): the define
// tables the program's declaration chunks build, with the functions each
// define writes as its methods. For the builtins prelude, which the player
// seeds into every story it compiles.
import "@impower/sparkdown/src/inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import {
  MAIN_URI,
  configurePlayerCompiler,
} from "../../../../../scripts/bench/benchProject";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";

/** The define context the program engine builds for `files`, compiled as the
 *  player's worker configures its compiler. */
function context(files: any[]) {
  const compiler = new SparkdownCompiler();
  const startFrom = { file: MAIN_URI, line: 0 };
  configurePlayerCompiler(compiler, files, startFrom);
  const program = compiler.compile({
    textDocument: { uri: MAIN_URI },
    startFrom,
  } as never).program;
  expect(program.chunks).toBeDefined();
  return buildDefinesContext(new ProgramStory(program.chunks!) as never);
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
  it("holds the builtins prelude's defines", () => {
    const program = context([script(MAIN_URI, "A line.\n")]);
    expect(Object.keys(program).length).toBeGreaterThan(10);
    // Each type the prelude defines with props of its own has its defaults
    // under `$default`, and then each define of that type, in the prelude's
    // order.
    const names = (type: string) => Object.keys(program[type] ?? {});
    expect({
      transition: names("transition"),
      shadow: names("shadow"),
      mixer: names("mixer"),
      channel: names("channel"),
    }).toEqual({
      transition: ["$default", "fade", "screenfade", "screenflash"],
      shadow: ["$default", "xs", "sm", "md", "lg", "xl"],
      mixer: ["$default", "main", "music", "sound", "voice", "typewriter"],
      channel: ["$default", "music", "ambient", "sound", "voice", "typewriter"],
    });
  });
});
