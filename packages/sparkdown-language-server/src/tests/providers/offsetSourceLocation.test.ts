// #651 — the editor's previous/next beat navigation counts through the
// program's path locations, which are now columns searched by binary search
// rather than an array of entries walked from the top.
//
// The keypress must land where it always did, so the walk is kept here as an
// oracle and the two are compared for every line of a two-script fixture, at
// every offset the editor uses (the previous beat, the next one) and past the
// ends of the table.

import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type {
  PathLocationTable,
  SparkProgram,
} from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { locationAtRow } from "@impower/sparkdown/src/compiler/utils/pathLocationTable";
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

const compile = (): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      script(MAIN, "main", MAIN_SRC),
      script(CHAPTER, "chapter", CHAPTER_SRC),
    ],
  } as never);
  return compiler.compile({ textDocument: { uri: MAIN } } as never).program;
};

type Entry = [string, [number, number, number, number, number]];

const entriesOf = (table: PathLocationTable): Entry[] =>
  table.paths.map((path, row) => [
    path,
    locationAtRow(table, row) as Entry[1],
  ]);

/** The walk over all entries the binary search replaces. */
const walkOffsetSourceLocation = (
  files: string[],
  entries: Entry[],
  currentFile: string | undefined,
  currentLine: number,
  offset: number,
) => {
  if (currentFile == null) {
    return null;
  }
  const fileIndex = files.indexOf(currentFile);
  if (fileIndex < 0) {
    return null;
  }
  let closestIndex: number | null = null;
  for (let i = 0; i < entries.length; i++) {
    const [currFileIndex, currStartLine] = entries[i]![1];
    if (currFileIndex === fileIndex && currStartLine === currentLine) {
      closestIndex = i;
      break;
    }
    if (currFileIndex === fileIndex && currStartLine > currentLine) {
      closestIndex = i - 1;
      break;
    }
    if (currFileIndex > fileIndex) {
      closestIndex = null;
      break;
    }
  }
  if (closestIndex == null) {
    return null;
  }
  const entry = entries[closestIndex + offset];
  if (entry == null) {
    return null;
  }
  const [fileIdx, lineIdx] = entry[1];
  const file = files[fileIdx];
  if (!file) {
    return null;
  }
  return { file, line: lineIdx };
};

describe("previous and next beat navigation", () => {
  const program = compile();
  const files = Object.keys(program.scripts);
  const entries = entriesOf(program.pathLocations!);
  const sources: Record<string, string> = {
    [MAIN]: MAIN_SRC,
    [CHAPTER]: CHAPTER_SRC,
  };

  test("the fixture has both scripts and beats in each", () => {
    expect(files).toEqual(expect.arrayContaining([MAIN, CHAPTER]));
    expect(entries.length).toBeGreaterThan(4);
  });

  test.each([-1, 1, -3, 3])(
    "an offset of %s lands where the walk lands, from every line",
    (offset) => {
      for (const file of [MAIN, CHAPTER]) {
        const lineCount = sources[file]!.split(NEWLINE).length;
        for (let line = 0; line <= lineCount + 2; line++) {
          expect({
            file,
            line,
            at: getOffsetSourceLocation(program, file, line, offset),
          }).toEqual({
            file,
            line,
            at: walkOffsetSourceLocation(files, entries, file, line, offset),
          });
        }
      }
    },
  );

  test("a file the program does not know, and no program at all, land nowhere", () => {
    expect(getOffsetSourceLocation(program, "file://proj/absent.sd", 0, 1)).toBeNull();
    expect(getOffsetSourceLocation(program, undefined, 0, 1)).toBeNull();
    expect(getOffsetSourceLocation(undefined, MAIN, 0, 1)).toBeNull();
  });

  test("an offset past either end of the table lands nowhere", () => {
    expect(getOffsetSourceLocation(program, MAIN, 0, -1000)).toBeNull();
    expect(getOffsetSourceLocation(program, MAIN, 0, 1000)).toBeNull();
  });
});
