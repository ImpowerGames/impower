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
    getOffsetSourceLocation(program, ownBeats(program), file, line, offset);
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
    const locator = ownBeats(program);
    expect(await getOffsetSourceLocation(program, locator, "file://proj/absent.sd", 0, 1)).toBeNull();
    expect(await getOffsetSourceLocation(program, locator, undefined, 0, 1)).toBeNull();
    expect(await getOffsetSourceLocation(undefined, locator, MAIN, 0, 1)).toBeNull();
    expect(await getOffsetSourceLocation(program, undefined, MAIN, 0, 1)).toBeNull();
  });
});

describe("previous and next beat navigation", () => {
  // The language server answers it from the program engine's root since
  // #704, where it answered from the current engine's path locations. A
  // scene's and a branch's header is a stop on both, and a divert, a `done`
  // or a `fin` at a flow's own level on neither, while one inside a block's
  // body is a stop on both.
  const FLOWS = [
    "store n = 0",
    "",
    "scene A",
    "  Hello.",
    "  -> A.side",
    "  Unreached.",
    "  if n > 0 then",
    "    -> B",
    "  end",
    "  & n = n + 1",
    "  fin",
    "  branch side",
    "    Side.",
    "    -> B",
    "  end",
    "end",
    "",
    "scene B",
    "  Bye.",
    "  done",
    "end",
    "",
    "function f(x)",
    "  return x",
    "end",
    "",
  ].join(NEWLINE);

  const differences = async (main: string, chapter: string) => {
    const current = compile(false, main, chapter);
    const chunked = compile(true, main, chapter);
    expect(chunked.fallback).toBeUndefined();
    const differing: string[] = [];
    for (const [uri, text] of [
      [MAIN, main],
      [CHAPTER, chapter],
    ] as const) {
      const lines = text.split(NEWLINE).length;
      for (let line = 0; line < lines; line++) {
        for (const offset of [-2, -1, 1, 2]) {
          const want = await getOffsetSourceLocation(current, ownBeats(current), uri, line, offset);
          const got = await getOffsetSourceLocation(chunked, ownBeats(chunked), uri, line, offset);
          if (JSON.stringify(want) !== JSON.stringify(got)) {
            differing.push(`${uri} line ${line} offset ${offset}: ${JSON.stringify(want)} against ${JSON.stringify(got)}`);
          }
        }
      }
    }
    return differing;
  };

  test("lands where it lands on the current engine, from every line of every script, on the program engine", async () => {
    expect(await differences(MAIN_SRC, CHAPTER_SRC)).toEqual([]);
  });

  test("lands where it lands on the current engine around diverts, `done`, `fin`, branches and functions", async () => {
    expect(await differences(["include chapter.sd", ""].join(NEWLINE), FLOWS)).toEqual([]);
    const program = compile(true, ["include chapter.sd", ""].join(NEWLINE), FLOWS);
    const at = (line: number, offset: number) =>
      getOffsetSourceLocation(program, ownBeats(program), CHAPTER, line, offset);
    // Past a divert at the scene's own level, onto the line below it.
    expect(await at(lineOf(FLOWS, "Hello."), 1)).toEqual({ file: CHAPTER, line: lineOf(FLOWS, "Unreached.") });
    // A divert inside an `if` is a stop of its own.
    expect(await at(lineOf(FLOWS, "if n > 0"), 1)).toEqual({ file: CHAPTER, line: lineOf(FLOWS, "    -> B") });
    // Past `fin`, onto the branch header.
    expect(await at(lineOf(FLOWS, "& n = n + 1"), 1)).toEqual({ file: CHAPTER, line: lineOf(FLOWS, "branch side") });
    // Nothing past the last beat before `done`.
    expect(await at(lineOf(FLOWS, "Bye."), 1)).toBeNull();
  });

  // A divert's arguments are expressions, which compute what they compute
  // (an operator, a call, several values) before the divert leaves.
  const ARGS = [
    "store n = 0",
    "store s = \"abc\"",
    "",
    "scene A",
    "  Before.",
    "  -> B(n + 1)",
    "  After.",
    "  -> B(f(n) * 2)",
    "  Later.",
    "  -> B(#tostring(n))",
    "  Last.",
    "  -> B(\"value {n}\")",
    "  Captured.",
    "  -> B(s:upper())",
    "  Method.",
    "  -> B(function()",
    "    return 1",
    "  end)",
    "  Function.",
    "  -> B({ 1, n })",
    "  Table.",
    "  -> B(if n > 0 then 1 else 2)",
    "  Choice of value.",
    "  -> B(n > 0 and s or \"none\")",
    "  Logic.",
    "end",
    "",
    "scene B(x)",
    "  Value {x}.",
    "  done",
    "end",
    "",
    "function f(v)",
    "  return v",
    "end",
    "",
  ].join(NEWLINE);

  // A `choose` is a block statement, which a divert in its preamble does not
  // make a divert: its caption is a beat of its own, whether the divert is
  // written before it or in a branch of an `if` the preamble skips.
  test("keeps a choose block's caption a beat when its preamble diverts first", async () => {
    const CHOOSE = [
      "store n = 0",
      "",
      "scene A",
      "  Before.",
      "  choose",
      "    -> B",
      "    Caption.",
      "    * Continue",
      "      Taken.",
      "  end",
      "  Middle.",
      "  choose",
      "    if n > 0 then",
      "      -> B",
      "      + [Gated]",
      "        Gone.",
      "    end",
      "    Second caption.",
      "    * Onward",
      "      Went.",
      "  end",
      "  After.",
      "end",
      "",
      "scene B",
      "  Bye.",
      "  done",
      "end",
      "",
    ].join(NEWLINE);
    const program = compile(true, ["include chapter.sd", ""].join(NEWLINE), CHOOSE);
    expect(program.fallback).toBeUndefined();
    const beats = ownBeats(program);
    for (const caption of ["Caption.", "Second caption."]) {
      const beat = await beats.beatAt(CHAPTER, lineOf(CHOOSE, caption));
      expect(beat?.location?.startLine, caption).toBe(lineOf(CHOOSE, caption));
    }
    const at = (line: number, offset: number) =>
      getOffsetSourceLocation(program, beats, CHAPTER, line, offset);
    expect(await at(lineOf(CHOOSE, "* Continue"), -1)).toEqual({ file: CHAPTER, line: lineOf(CHOOSE, "Caption.") });
    expect(await at(lineOf(CHOOSE, "* Onward"), -1)).toEqual({ file: CHAPTER, line: lineOf(CHOOSE, "Second caption.") });
  });

  // The stops are beats, choice bodies, headers and the logic an author
  // writes as a statement of its own; a tunnel call or return, a label, a
  // choice's own line, an `elseif` or `else` and a loop's header are none
  // (#1677).
  test("stops where the current engine stops around tunnels, labels, choices, elseif, else and while", async () => {
    const STOPS = [
      "-> main",
      "scene main",
      "  Start.",
      "  -> T ->",
      "  After tunnel.",
      "  label here",
      "  Labelled.",
      "  choose",
      "    + First",
      "      First body.",
      "    + Second",
      "      Second body.",
      "  end",
      "  store n = 0",
      "  if n > 5 then",
      "    Big.",
      "  elseif n > 2 then",
      "    Medium.",
      "  else",
      "    Small.",
      "  end",
      "  while n < 2 do",
      "    n += 1",
      "    Loop.",
      "  end",
      "  done",
      "end",
      "scene T",
      "  In tunnel.",
      "  ->->",
      "end",
      "",
    ].join(NEWLINE);
    expect(await differences(STOPS, "")).toEqual([]);
    // Next and previous from every line, as the current engine gives them:
    // [line, next, previous], null for nowhere.
    const expected: [number, number | null, number | null][] = [
      [2, 4, 1],
      [3, 4, 2],
      [4, 6, 2],
      [5, 6, 4],
      [6, 9, 4],
      [7, 9, 6],
      [8, 9, 6],
      [9, 11, 6],
      [10, 11, 9],
      [11, 14, 9],
      [14, 15, 11],
      [15, 17, 14],
      [16, 17, 15],
      [17, 19, 15],
      [18, 19, 17],
      [19, 22, 17],
      [20, 22, 19],
      [21, 22, 19],
      [22, 23, 19],
      [28, null, 27],
      [29, null, 28],
      [30, null, 28],
    ];
    for (const engine of [false, true]) {
      const program = compile(engine, STOPS, "");
      for (const [line, next, previous] of expected) {
        const at = (offset: number) =>
          getOffsetSourceLocation(program, ownBeats(program), MAIN, line, offset);
        expect((await at(1))?.line ?? null, `chunks ${engine}, line ${line} next`).toBe(next);
        expect((await at(-1))?.line ?? null, `chunks ${engine}, line ${line} previous`).toBe(previous);
      }
    }
  });

  // A `choose` preamble's logic is written into the `choose` statement's own
  // code, so it stands at addresses past the statement's start; an
  // assignment and an `if` there are stops as they are elsewhere, and a
  // `store` there is none on either engine (round 1 of PR #1680).
  test("stops on an assignment and an if inside a choose preamble", async () => {
    const PREAMBLE = [
      "store gate = true",
      "scene start",
      "  Start.",
      "  choose",
      "    & gate = true",
      "    if gate then",
      "      + Continue",
      "        Body.",
      "    end",
      "    + Other",
      "      Other body.",
      "  end",
      "  After.",
      "end",
      "",
    ].join(NEWLINE);
    const STORED = [
      "scene start",
      "  Start.",
      "  choose",
      "    store gate = true",
      "    if gate then",
      "      + Continue",
      "        Body.",
      "    end",
      "  end",
      "  After.",
      "end",
      "",
    ].join(NEWLINE);
    for (const engine of [false, true]) {
      const preamble = compile(engine, PREAMBLE, "");
      const stored = compile(engine, STORED, "");
      const next = async (program: SparkProgram, line: number) =>
        (await getOffsetSourceLocation(program, ownBeats(program), MAIN, line, 1))?.line;
      const previous = async (program: SparkProgram, line: number) =>
        (await getOffsetSourceLocation(program, ownBeats(program), MAIN, line, -1))?.line;
      const label = `chunks ${engine}`;
      expect(await next(preamble, lineOf(PREAMBLE, "Start.")), label).toBe(lineOf(PREAMBLE, "& gate"));
      expect(await next(preamble, lineOf(PREAMBLE, "& gate")), label).toBe(lineOf(PREAMBLE, "if gate"));
      expect(await previous(preamble, lineOf(PREAMBLE, "if gate")), label).toBe(lineOf(PREAMBLE, "& gate"));
      expect(await next(preamble, lineOf(PREAMBLE, "Body.")), label).toBe(lineOf(PREAMBLE, "Other body."));
      expect(await next(stored, lineOf(STORED, "Start.")), label).toBe(lineOf(STORED, "if gate"));
      expect(await next(stored, lineOf(STORED, "choose")), label).toBe(lineOf(STORED, "if gate"));
    }
  });

  test("lands where it lands on the current engine around diverts that pass arguments", async () => {
    expect(await differences(["include chapter.sd", ""].join(NEWLINE), ARGS)).toEqual([]);
    const program = compile(true, ["include chapter.sd", ""].join(NEWLINE), ARGS);
    const at = (line: number, offset: number) =>
      getOffsetSourceLocation(program, ownBeats(program), CHAPTER, line, offset);
    expect(await at(lineOf(ARGS, "Before."), 1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "After.") });
    expect(await at(lineOf(ARGS, "After."), -1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Before.") });
    expect(await at(lineOf(ARGS, "After."), 1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Later.") });
    expect(await at(lineOf(ARGS, "Later."), 1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Last.") });
    // A captured string's text and a method call's stashed receiver are the
    // argument's computation, not a beat or an assignment of the author's.
    expect(await at(lineOf(ARGS, "Last."), 1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Captured.") });
    expect(await at(lineOf(ARGS, "Captured."), 1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Method.") });
    expect(await at(lineOf(ARGS, "Method."), -1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Captured.") });
    // A function an argument writes is entry code after the divert leaves.
    expect(await at(lineOf(ARGS, "Method."), 1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Function.") });
    expect(await at(lineOf(ARGS, "Function."), -1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Method.") });
  });
});
