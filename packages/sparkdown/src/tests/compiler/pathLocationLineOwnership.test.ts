// A statement's recorded source range must not claim the line after it.
//
// `program.pathLocations` maps every bytecode path to a source range, and the
// editor resolves a preview point, a breakpoint and a stack frame by asking
// which range holds a line. The lowerer ends a display beat's range where the
// next statement begins, which is column 0 of the following content line, so a
// range left as recorded reaches onto a line it does not own and a line-keyed
// lookup hands back the previous statement. The compiler pulls such a range
// back to the end of the previous line, which is what these assertions pin.
//
// A range that reaches only the start of `endLine` records an end column of
// either 0 or -1, depending on which of the two stamping conventions produced
// the metadata: the diagnostics pipeline's 1-based character numbers give 0,
// and the lowerer's own 0-based stamps give -1. Both mean the range stops at or
// before `endLine`'s first column, so both are pulled back.
//
// Compiled the way the player compiles: the builtins prelude plus
// `experimentalDisplayCalls`, which is the lowering that produces the
// next-line-touching ranges. The flat-text lowering keeps each beat's range on
// its own lines already, so a compile without it cannot see this defect.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";
const MAIN_SCRIPT = 0;

const fileOf = (text: string) => ({
  uri: URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

function newCompiler() {
  const c = new SparkdownCompiler();
  return c;
}

function compile(text: string) {
  const c = newCompiler();
  c.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    experimentalDisplayCalls: true,
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

/** Every range recorded against main.sd, as `[path, location]`. */
const rangesOf = (program: any): [string, number[]][] =>
  (Object.entries(program.pathLocations ?? {}) as [string, number[]][]).filter(
    ([, location]) => location[0] === MAIN_SCRIPT,
  );

/** The paths whose range holds `line`, by the line-only test the editor's
 *  lookup applies (`findClosestPathLocation`). */
const claiming = (program: any, line: number): string[] =>
  rangesOf(program)
    .filter(([, [, startLine, , endLine]]) => line >= startLine! && line <= endLine!)
    .map(([path]) => path);

/** 0-based index of the fixture line containing `needle`. */
const lineOf = (source: string, needle: string): number => {
  const line = source.split("\n").findIndex((l) => l.includes(needle));
  if (line < 0) {
    throw new Error(`fixture has no line containing ${JSON.stringify(needle)}`);
  }
  return line;
};

/** Ranges that stop at the start of a later line carrying a statement of its
 *  own — the defect, in general form. A range pulled back correctly can still
 *  end at a blank line's column 0, which owns nothing and is nobody's preview
 *  point. */
const overreaching = (program: any, source: string): string[] => {
  const lines = source.split("\n");
  return rangesOf(program)
    .filter(
      ([, [, startLine, , endLine, endColumn]]) =>
        endLine! > startLine! &&
        endColumn! <= 0 &&
        (lines[endLine!] ?? "").trim() !== "",
    )
    .map(([path, location]) => `${path} @ ${location.join(",")}`);
};

/** Assert every path claiming each named content line starts on it. */
function expectLinesOwned(program: any, source: string, needles: string[]) {
  for (const needle of needles) {
    const line = lineOf(source, needle);
    const paths = claiming(program, line);
    expect(paths.length, `no path claims ${JSON.stringify(needle)}`).toBeGreaterThan(0);
    for (const path of paths) {
      const [, startLine] = program.pathLocations[path];
      expect(
        startLine,
        `${path} claims ${JSON.stringify(needle)} (line ${line}) but starts on line ${startLine}`,
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

describe("path locations own only their own lines (#490)", () => {
  for (const { label, source, content } of FIXTURES) {
    describe(label, () => {
      it("no range stops at the start of a later line that carries a statement", () => {
        const program = compile(source);
        expect(rangesOf(program).length).toBeGreaterThan(0);
        expect(overreaching(program, source)).toEqual([]);
      });

      it("every path claiming a content line starts on that line", () => {
        expectLinesOwned(compile(source), source, content);
      });
    });
  }

  it("a dialogue block still owns the line its spoken text sits on", () => {
    // The pull-back must not shrink a range off its own content.
    const program = compile(FLAT);
    expect(claiming(program, lineOf(FLAT, "Okay, okay!")).length).toBeGreaterThan(0);
  });

  it("an incremental compile records the same ranges as a cold one", () => {
    // The pull-back runs before the tuple is stored and before it is captured
    // into the per-flow location cache, and `spliceCachedFlowLocations` shifts a
    // cached tuple's lines without touching its columns. So a reused flow has to
    // come back with the pulled-back range, not the raw one. The existing
    // incremental-equivalence net compiles without `experimentalDisplayCalls`,
    // which is the lowering this defect lives in, so it does not cover this.
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

    const incremental = newCompiler();
    incremental.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
      experimentalDisplayCalls: true,
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
    expect(JSON.stringify(incrementalProgram.pathLocations)).toBe(
      JSON.stringify(coldProgram.pathLocations),
    );
    expect(overreaching(incrementalProgram, after)).toEqual([]);
    expectLinesOwned(incrementalProgram, after, [
      "With an indignant pivot",
      "He does not look back.",
      "Okay, okay!",
    ]);
  });
});
