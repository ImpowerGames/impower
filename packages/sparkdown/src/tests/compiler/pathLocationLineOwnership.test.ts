// A statement's recorded source range must not claim the line after it.
//
// A program's root maps every address to a source range
// (`ProgramRoot.locationOf`), and the editor resolves a preview point, a
// breakpoint and a stack frame by asking which address stands on a line
// (`ProgramRoot.addressAt`) and where it stands. A display beat's range that
// reached column 0 of the following content line would claim a line it does
// not own, and a line-keyed lookup would hand back the previous statement.
//
// A range that reaches only the start of `endLine` records an end column of
// 0 or below. Such a range stops at or before `endLine`'s first column, and
// these assertions refuse it when that line carries a statement.
//
// Compiled the way the player compiles, with the builtins prelude. Each line
// lowers to a `display()` call.
import { describe, expect, it } from "vitest";
import type { SourceLocation } from "../../compiler/types/ProgramAddress";
import { testCompiler } from "../engineUnderTest";

const URI = "inmemory:///main.sd";

const fileOf = (text: string) => ({
  uri: URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

function compile(text: string) {
  const c = testCompiler();
  c.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [fileOf(text)],
  } as never);
  return (c.compile({ textDocument: { uri: URI } } as never) as any).program;
}

/** The reproduction from issue #490: an action line below a dialogue block. */
const FLAT = `RAFFLES:
  Wow.

With an indignant pivot, Raffles glides briskly ahead.

BUNNY:
  Okay, okay!
`;

/** The topology the ticket's real case has: the action line sits in the body of
 *  a `choose … then`, one blank line under a dialogue block. */
const NESTED = `RAFFLES:
  Wow.

choose
  + [One]
    Bunny picks the first.
  + [Two]
    Bunny picks the second.
then

  BUNNY:
    Okay, okay!

  With a shrug, Bunny follows him inside.

  RAFFLES:
    Fine.
`;

/** Statements packed with no blank line between them, and line types other than
 *  dialogue and action: a heading and a transition. Nothing separates one
 *  statement's end from the next statement's start here, so every range is one
 *  that would reach onto the next line unpulled. */
const TIGHT = `RAFFLES:
  Wow.
Raffles turns on his heel.
$:
  A DARK ALLEY
> CUT TO:
BUNNY:
  Wait!
`;

/** The range of each address a line of main.sd resolves to, once each, as
 *  `[address, location]`. */
const rangesOf = (program: any, source: string): [number, SourceLocation][] => {
  const root = program.chunks;
  expect(root, "the compile built statement chunks").toBeDefined();
  const out = new Map<number, SourceLocation>();
  source.split("\n").forEach((_text, line) => {
    const address = root!.addressAt(URI, line);
    const location = address === undefined ? undefined : root!.locationOf(address);
    if (location?.uri === URI) {
      out.set(address!, location);
    }
  });
  return [...out];
};

/** The addresses whose range holds `line`, by the line-only test an editor's
 *  lookup applies. */
const claiming = (program: any, source: string, line: number): [number, SourceLocation][] =>
  rangesOf(program, source).filter(
    ([, { startLine, endLine }]) => line >= startLine && line <= endLine,
  );

/** 0-based index of the fixture line containing `needle`. */
const lineOf = (source: string, needle: string): number => {
  const line = source.split("\n").findIndex((l) => l.includes(needle));
  if (line < 0) {
    throw new Error(`fixture has no line containing ${JSON.stringify(needle)}`);
  }
  return line;
};

/** Ranges that stop at the start of a later line carrying a statement of its
 *  own — the defect, in general form. A range can still end at a blank
 *  line's column 0, which owns nothing and is nobody's preview point. */
const overreaching = (program: any, source: string): string[] => {
  const lines = source.split("\n");
  return rangesOf(program, source)
    .filter(
      ([, { startLine, endLine, endColumn }]) =>
        endLine > startLine &&
        endColumn <= 0 &&
        (lines[endLine] ?? "").trim() !== "",
    )
    .map(([address, location]) => `${address} @ ${JSON.stringify(location)}`);
};

/** Assert every address claiming each named content line starts on it. */
function expectLinesOwned(program: any, source: string, needles: string[]) {
  for (const needle of needles) {
    const line = lineOf(source, needle);
    const ranges = claiming(program, source, line);
    expect(ranges.length, `no address claims ${JSON.stringify(needle)}`).toBeGreaterThan(0);
    for (const [address, { startLine }] of ranges) {
      expect(
        startLine,
        `${address} claims ${JSON.stringify(needle)} (line ${line}) but starts on line ${startLine}`,
      ).toBe(line);
    }
  }
}

const FIXTURES: { label: string; source: string; content: string[] }[] = [
  {
    label: "an action line one blank line under a dialogue block",
    source: FLAT,
    content: ["Wow.", "With an indignant pivot", "Okay, okay!"],
  },
  {
    label: "the same inside a `choose … then` body",
    source: NESTED,
    content: [
      "Wow.",
      "Bunny picks the first.",
      "Bunny picks the second.",
      "Okay, okay!",
      "With a shrug",
      "Fine.",
    ],
  },
  {
    label: "statements packed with no blank line, including a heading and a transition",
    source: TIGHT,
    content: ["Wow.", "Raffles turns on his heel.", "A DARK ALLEY", "CUT TO:", "Wait!"],
  },
];

describe("addresses own only their own lines (#490)", () => {
  for (const { label, source, content } of FIXTURES) {
    describe(label, () => {
      it("no range stops at the start of a later line that carries a statement", () => {
        const program = compile(source);
        expect(rangesOf(program, source).length).toBeGreaterThan(0);
        expect(overreaching(program, source)).toEqual([]);
      });

      it("every address claiming a content line starts on that line", () => {
        expectLinesOwned(compile(source), source, content);
      });
    });
  }

  it("a dialogue block still owns the line its spoken text sits on", () => {
    // The range must not shrink off its own content.
    const program = compile(FLAT);
    expect(claiming(program, FLAT, lineOf(FLAT, "Okay, okay!")).length).toBeGreaterThan(0);
  });

  it("an incremental compile records the same ranges as a cold one", () => {
    const before = FLAT;
    const find = "With an indignant pivot, Raffles glides briskly ahead.";
    const replace = "With an indignant pivot, Raffles glides briskly away.\n\nHe does not look back.";
    const offset = before.indexOf(find);
    expect(offset).toBeGreaterThanOrEqual(0);
    const posAt = (text: string, at: number) => {
      let line = 0;
      let lineStart = 0;
      for (let i = 0; i < at; i++) {
        if (text[i] === "\n") {
          line++;
          lineStart = i + 1;
        }
      }
      return { line, character: at - lineStart };
    };
    const start = posAt(before, offset);
    const end = posAt(before, offset + find.length);
    const after = before.slice(0, offset) + replace + before.slice(offset + find.length);

    const incremental = testCompiler();
    incremental.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
      files: [fileOf(before)],
    } as never);
    incremental.compile({ textDocument: { uri: URI } } as never);
    (incremental as any).updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start, end }, text: replace }],
    });
    const incrementalProgram = (
      incremental.compile({ textDocument: { uri: URI } } as never) as any
    ).program;

    const coldProgram = compile(after);
    // An address counts the chunks a compiler has made, so the ranges are
    // compared without them.
    const ranges = (program: any) => rangesOf(program, after).map(([, location]) => location);
    expect(ranges(incrementalProgram)).toEqual(ranges(coldProgram));
    expect(overreaching(incrementalProgram, after)).toEqual([]);
    expectLinesOwned(incrementalProgram, after, [
      "With an indignant pivot",
      "He does not look back.",
      "Okay, okay!",
    ]);
  });
});
