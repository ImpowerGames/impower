// The editor's previous and next beat navigation (PageUp/PageDown), which the
// language server answers through the program's accessor (#700): the next
// beat is the first one below the line that starts below it, and the previous
// one the first one above that starts above it, where a beat is what the
// accessor gives one address (`ProgramLocator.addressAt`) and starts where
// `locationOf` says. The same script answers on both engines, from the current
// engine's path locations and from the program engine's root, and no client
// holds either.

import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { describe, expect, test } from "vitest";
import { getOffsetSourceLocation } from "../../utils/providers/getOffsetSourceLocation";

const MAIN = "file://proj/main.sd";
const CHAPTER = "file://proj/chapter.sd";
const NEWLINE = String.fromCharCode(10);

const MAIN_SRC = [
  "include chapter.sd",
  "",
  "Raffles waits by the door.",
  "",
  "scene A",
  "  He looks around.",
  "",
  "  RAFFLES:",
  "    (quietly)",
  "    Nobody here.",
  "",
  "  He looks again.",
  "",
  "  -> B",
  "end",
  "",
].join(NEWLINE);

const CHAPTER_SRC = [
  "scene B",
  "  Bunny arrives.",
  "",
  "  Bunny leaves.",
  "",
  "  done",
  "end",
  "",
].join(NEWLINE);

const script = (uri: string, name: string, text: string) => ({
  uri,
  type: "script",
  name,
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

const compile = (programChunks: boolean): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    programChunks,
    files: [
      script(MAIN, "main", MAIN_SRC),
      script(CHAPTER, "chapter", CHAPTER_SRC),
    ],
  } as never);
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return compiler.compile({ textDocument: { uri: MAIN } } as never).program;
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

const lineOf = (text: string, needle: string) =>
  text.split(NEWLINE).findIndex((line) => line.includes(needle));

describe.each([
  { engine: "the current engine", programChunks: false },
  { engine: "the program engine", programChunks: true },
])("previous and next beat navigation on $engine", ({ programChunks }) => {
  const program = compile(programChunks);
  const at = (file: string, line: number, offset: number) =>
    getOffsetSourceLocation(program, programLocator(program), file, line, offset);
  const main = (needle: string) => lineOf(MAIN_SRC, needle);

  test("compiles the program the engine runs", () => {
    expect(program.chunks !== undefined).toBe(programChunks);
    expect(program.pathLocations !== undefined).toBe(!programChunks);
  });

  test("goes to the next beat from a beat's line, a blank line and a line inside a beat", async () => {
    expect(await at(MAIN, main("He looks around."), 1)).toEqual({
      file: MAIN,
      line: main("(quietly)"),
    });
    expect(await at(MAIN, main("He looks around.") + 1, 1)).toEqual({
      file: MAIN,
      line: main("(quietly)"),
    });
    expect(await at(MAIN, main("Nobody here."), 1)).toEqual({
      file: MAIN,
      line: main("He looks again."),
    });
  });

  test("goes to the previous beat's start, and from inside a beat to its own start", async () => {
    expect(await at(MAIN, main("He looks again."), -1)).toEqual({
      file: MAIN,
      line: main("(quietly)"),
    });
    expect(await at(MAIN, main("Nobody here."), -1)).toEqual({
      file: MAIN,
      line: main("(quietly)"),
    });
    expect(await at(MAIN, main("(quietly)"), -1)).toEqual({
      file: MAIN,
      line: main("He looks around."),
    });
  });

  test("counts several beats at once", async () => {
    expect(await at(MAIN, main("He looks around."), 2)).toEqual({
      file: MAIN,
      line: main("He looks again."),
    });
    expect(await at(MAIN, main("He looks again."), -2)).toEqual({
      file: MAIN,
      line: main("He looks around."),
    });
  });

  test("stays in its script, and lands nowhere past either end", async () => {
    const bunny = lineOf(CHAPTER_SRC, "Bunny arrives.");
    expect(await at(CHAPTER, bunny, 1)).toEqual({
      file: CHAPTER,
      line: lineOf(CHAPTER_SRC, "Bunny leaves."),
    });
    // A scene's header is a path location of its own on the current engine,
    // as it was before (#700), and holds no statement on the program engine.
    expect(await at(CHAPTER, bunny, -1)).toEqual(
      programChunks ? null : { file: CHAPTER, line: 0 },
    );
    expect(await at(MAIN, 0, -1)).toBeNull();
    expect(await at(MAIN, main("end"), 1)).toBeNull();
    expect(await at(MAIN, main("He looks around."), 1000)).toBeNull();
  });

  test("a file the program does not know, and no program at all, land nowhere", async () => {
    const locator = programLocator(program);
    expect(await getOffsetSourceLocation(program, locator, "file://proj/absent.sd", 0, 1)).toBeNull();
    expect(await getOffsetSourceLocation(program, locator, undefined, 0, 1)).toBeNull();
    expect(await getOffsetSourceLocation(undefined, locator, MAIN, 0, 1)).toBeNull();
    expect(await getOffsetSourceLocation(program, undefined, MAIN, 0, 1)).toBeNull();
  });
});
