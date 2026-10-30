import { describe, expect, it } from "vitest";
import {
  MAIN_URI,
  configurePlayerCompiler,
} from "../../../../../scripts/bench/benchProject";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";

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
    const names = (type: string) => Object.keys(program[type] ?? {});
    expect({
      transition: names("transition"),
      shadow: names("shadow"),
      mixer: names("mixer"),
      channel: names("channel"),
    }).toEqual({
      transition: ["$default", "fade", "screenfade", "screenflash"],
      shadow: ["$default", "xs", "sm", "md", "lg", "xl"],
      mixer: ["$default", "main", "music", "sound", "voice", "typewriter", "movie"],
      channel: [
        "$default",
        "music",
        "ambient",
        "sound",
        "voice",
        "typewriter",
        "movie",
      ],
    });
  });
});
