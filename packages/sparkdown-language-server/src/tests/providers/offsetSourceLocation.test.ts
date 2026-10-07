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
import {
  getOffsetSourceLocation,
  ownBeats,
} from "../../utils/providers/getOffsetSourceLocation";

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

const compile = (
  programChunks: boolean,
  main = MAIN_SRC,
  chapter = CHAPTER_SRC,
): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    programChunks,
    files: [script(MAIN, "main", main), script(CHAPTER, "chapter", chapter)],
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
    getOffsetSourceLocation(program, ownBeats(programLocator(program)), file, line, offset);
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
    // A scene's header is a stop of its own on both engines: a path location
    // on the current engine, and a header the program lists on the program
    // engine, whose root gives it no statement (#704).
    expect(await at(CHAPTER, bunny, -1)).toEqual({ file: CHAPTER, line: 0 });
    expect(await at(MAIN, 0, -1)).toBeNull();
    expect(await at(MAIN, main("end"), 1)).toBeNull();
    expect(await at(MAIN, main("He looks around."), 1000)).toBeNull();
  });

  test("a file the program does not know, and no program at all, land nowhere", async () => {
    const locator = ownBeats(programLocator(program));
    expect(await getOffsetSourceLocation(program, locator, "file://proj/absent.sd", 0, 1)).toBeNull();
    expect(await getOffsetSourceLocation(program, locator, undefined, 0, 1)).toBeNull();
    expect(await getOffsetSourceLocation(undefined, locator, MAIN, 0, 1)).toBeNull();
    expect(await getOffsetSourceLocation(program, undefined, MAIN, 0, 1)).toBeNull();
  });
});

describe("previous and next beat navigation", () => {
  // The language server answers it from the program engine's root since
  // #704, where it answered from the current engine's path locations.
  // Without the divert and the `done` (see below), every line lands where it
  // landed on the current engine, scene headers included.
  const withoutEnds = (text: string) =>
    text
      .split(NEWLINE)
      .filter((line) => line.trim() !== "-> B" && line.trim() !== "done")
      .join(NEWLINE);
  const main = withoutEnds(MAIN_SRC);
  const chapter = withoutEnds(CHAPTER_SRC);

  test("lands where it lands on the current engine, from every line of every script, on the program engine", async () => {
    const current = compile(false, main, chapter);
    const chunked = compile(true, main, chapter);
    const differing: string[] = [];
    for (const [uri, text] of [
      [MAIN, main],
      [CHAPTER, chapter],
    ] as const) {
      const lines = text.split(NEWLINE).length;
      for (let line = 0; line < lines; line++) {
        for (const offset of [-2, -1, 1, 2]) {
          const want = await getOffsetSourceLocation(current, ownBeats(programLocator(current)), uri, line, offset);
          const got = await getOffsetSourceLocation(chunked, ownBeats(programLocator(chunked)), uri, line, offset);
          if (JSON.stringify(want) !== JSON.stringify(got)) {
            differing.push(`${uri} line ${line} offset ${offset}: ${JSON.stringify(want)} against ${JSON.stringify(got)}`);
          }
        }
      }
    }
    expect(differing).toEqual([]);
  });

  // A divert or a `done` that ends a scene is a statement with an address
  // of its own on the program engine, which the Game Preview routes to
  // since #703, and has none on the current engine; the navigation stops on
  // it on the program engine.
  test("stops on a scene's last divert and `done` on the program engine only", async () => {
    const at = async (programChunks: boolean, uri: string, line: number, offset: number) => {
      const program = compile(programChunks);
      return getOffsetSourceLocation(program, ownBeats(programLocator(program)), uri, line, offset);
    };
    const divert = lineOf(MAIN_SRC, "-> B");
    const done = lineOf(CHAPTER_SRC, "done");
    expect(await at(true, MAIN, lineOf(MAIN_SRC, "He looks again."), 1)).toEqual({ file: MAIN, line: divert });
    expect(await at(false, MAIN, lineOf(MAIN_SRC, "He looks again."), 1)).toBeNull();
    expect(await at(true, CHAPTER, lineOf(CHAPTER_SRC, "Bunny leaves."), 1)).toEqual({ file: CHAPTER, line: done });
    expect(await at(false, CHAPTER, lineOf(CHAPTER_SRC, "Bunny leaves."), 1)).toBeNull();
  });
});
