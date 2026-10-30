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
  "scene start",
  "  Raffles waits by the door.",
  "end",
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

const compile = (main = MAIN_SRC, chapter = CHAPTER_SRC): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
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

describe("previous and next beat navigation on the program engine", () => {
  const program = compile();
  const at = (file: string, line: number, offset: number) =>
    getOffsetSourceLocation(program, ownBeats(program), file, line, offset);
  const main = (needle: string) => lineOf(MAIN_SRC, needle);

  test("compiles the program the engine runs", () => {
    expect(program.chunks).toBeDefined();
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
    expect(await at(CHAPTER, bunny, -1)).toEqual({ file: CHAPTER, line: 0 });
    expect(await at(MAIN, 0, -1)).toBeNull();
    expect(await at(MAIN, MAIN_SRC.split(NEWLINE).lastIndexOf("end"), 1)).toBeNull();
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

  test("lands on each script's next and previous beat from every line", async () => {
    const program = compile();
    const rows = async (uri: string, text: string) => {
      const out: [number, number | null, number | null][] = [];
      for (let line = 0; line < text.split(NEWLINE).length; line++) {
        const at = (offset: number) =>
          getOffsetSourceLocation(program, ownBeats(program), uri, line, offset);
        out.push([line, (await at(1))?.line ?? null, (await at(-1))?.line ?? null]);
      }
      return out;
    };
    expect(await rows(MAIN, MAIN_SRC)).toEqual([
      [0, 1, null],
      [1, 4, 0],
      [2, 4, 1],
      [3, 4, 1],
      [4, 5, 1],
      [5, 8, 4],
      [6, 8, 5],
      [7, 8, 5],
      [8, 11, 5],
      [9, 11, 8],
      [10, 11, 8],
      [11, null, 8],
      [12, null, 11],
      [13, null, 11],
      [14, null, 11],
      [15, null, 11],
    ]);
    expect(await rows(CHAPTER, CHAPTER_SRC)).toEqual([
      [0, 1, null],
      [1, 3, 0],
      [2, 3, 1],
      [3, null, 1],
      [4, null, 3],
      [5, null, 3],
      [6, null, 3],
      [7, null, 3],
    ]);
  });

  test("lands around diverts, `done`, `fin`, branches and functions", async () => {
    const program = compile("", FLOWS);
    const at = (line: number, offset: number) =>
      getOffsetSourceLocation(program, ownBeats(program), CHAPTER, line, offset);
    expect(await at(lineOf(FLOWS, "Hello."), 1)).toEqual({ file: CHAPTER, line: lineOf(FLOWS, "Unreached.") });
    expect(await at(lineOf(FLOWS, "if n > 0"), 1)).toEqual({ file: CHAPTER, line: lineOf(FLOWS, "    -> B") });
    expect(await at(lineOf(FLOWS, "& n = n + 1"), 1)).toEqual({ file: CHAPTER, line: lineOf(FLOWS, "branch side") });
    expect(await at(lineOf(FLOWS, "Bye."), 1)).toBeNull();
  });

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
    const program = compile("", CHOOSE);
    expect(program.chunks).toBeDefined();
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

  test("stops around tunnels, labels, choices, elseif, else and while", async () => {
    const STOPS = [
      "scene start",
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
    const expected: [number, number | null, number | null][] = [
      [1, 3, 0],
      [2, 3, 1],
      [3, 5, 1],
      [4, 5, 3],
      [5, 8, 3],
      [6, 8, 5],
      [7, 8, 5],
      [8, 10, 5],
      [9, 10, 8],
      [10, 13, 8],
      [13, 14, 10],
      [14, 16, 13],
      [15, 16, 14],
      [16, 18, 14],
      [17, 18, 16],
      [18, 21, 16],
      [19, 21, 18],
      [20, 21, 18],
      [21, 22, 18],
      [27, null, 26],
      [28, null, 27],
      [29, null, 27],
    ];
    const program = compile(STOPS, "");
    for (const [line, next, previous] of expected) {
      const at = (offset: number) =>
        getOffsetSourceLocation(program, ownBeats(program), MAIN, line, offset);
      expect((await at(1))?.line ?? null, `line ${line} next`).toBe(next);
      expect((await at(-1))?.line ?? null, `line ${line} previous`).toBe(previous);
    }
  });

  test("stops on an assignment and an if inside a choose preamble", { timeout: 60000 }, async () => {
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
    const AFTER_IF = [
      "store gate = true",
      "scene start",
      "  Start.",
      "  choose",
      "    if gate then",
      "      + Continue",
      "        Continue body.",
      "    end",
      "    & gate = false",
      "    if gate then",
      "      + Again",
      "        Again body.",
      "    elseif not gate then",
      "      + Instead",
      "        Instead body.",
      "    end",
      "    + Other",
      "      Other body.",
      "  end",
      "end",
      "",
    ].join(NEWLINE);
    const AFTER_LOOP = [
      "store n = 0",
      "scene start",
      "  Start.",
      "  choose",
      "    while n < 1 do",
      "      & n += 1",
      "      + First",
      "        First body.",
      "    end",
      "    & n = 2",
      "    + Second",
      "      Second body.",
      "  end",
      "end",
      "",
    ].join(NEWLINE);
    {
      const afterLoop = compile(AFTER_LOOP, "");
      const at = async (line: number, offset: number) =>
        (await getOffsetSourceLocation(afterLoop, ownBeats(afterLoop), MAIN, line, offset))?.line;
      expect(await at(lineOf(AFTER_LOOP, "First body."), 1)).toBe(lineOf(AFTER_LOOP, "& n = 2"));
      expect(await at(lineOf(AFTER_LOOP, "Second body."), -1)).toBe(lineOf(AFTER_LOOP, "& n = 2"));
    }
    {
      const afterIf = compile(AFTER_IF, "");
      const at = async (line: number, offset: number) =>
        (await getOffsetSourceLocation(afterIf, ownBeats(afterIf), MAIN, line, offset))?.line;
      expect(await at(lineOf(AFTER_IF, "Continue body."), 1)).toBe(lineOf(AFTER_IF, "& gate = false"));
      expect(await at(lineOf(AFTER_IF, "& gate = false"), 1)).toBe(lineOf(AFTER_IF, "& gate = false") + 1);
      expect(await at(lineOf(AFTER_IF, "Again body."), 1)).toBe(lineOf(AFTER_IF, "Instead body."));
    }
    {
      const preamble = compile(PREAMBLE, "");
      const stored = compile(STORED, "");
      const next = async (program: SparkProgram, line: number) =>
        (await getOffsetSourceLocation(program, ownBeats(program), MAIN, line, 1))?.line;
      const previous = async (program: SparkProgram, line: number) =>
        (await getOffsetSourceLocation(program, ownBeats(program), MAIN, line, -1))?.line;
      expect(await next(preamble, lineOf(PREAMBLE, "Start."))).toBe(lineOf(PREAMBLE, "& gate"));
      expect(await next(preamble, lineOf(PREAMBLE, "& gate"))).toBe(lineOf(PREAMBLE, "if gate"));
      expect(await previous(preamble, lineOf(PREAMBLE, "if gate"))).toBe(lineOf(PREAMBLE, "& gate"));
      expect(await next(preamble, lineOf(PREAMBLE, "Body."))).toBe(lineOf(PREAMBLE, "Other body."));
      expect(await next(stored, lineOf(STORED, "Start."))).toBe(lineOf(STORED, "if gate"));
      expect(await next(stored, lineOf(STORED, "choose"))).toBe(lineOf(STORED, "if gate"));
    }
  });

  test("lands around diverts that pass arguments", async () => {
    const program = compile("", ARGS);
    const at = (line: number, offset: number) =>
      getOffsetSourceLocation(program, ownBeats(program), CHAPTER, line, offset);
    expect(await at(lineOf(ARGS, "Before."), 1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "After.") });
    expect(await at(lineOf(ARGS, "After."), -1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Before.") });
    expect(await at(lineOf(ARGS, "After."), 1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Later.") });
    expect(await at(lineOf(ARGS, "Later."), 1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Last.") });
    expect(await at(lineOf(ARGS, "Last."), 1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Captured.") });
    expect(await at(lineOf(ARGS, "Captured."), 1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Method.") });
    expect(await at(lineOf(ARGS, "Method."), -1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Captured.") });
    expect(await at(lineOf(ARGS, "Method."), 1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Function.") });
    expect(await at(lineOf(ARGS, "Function."), -1)).toEqual({ file: CHAPTER, line: lineOf(ARGS, "Method.") });
  });
});
