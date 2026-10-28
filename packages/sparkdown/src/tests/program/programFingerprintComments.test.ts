// A statement's fingerprint, which a durable save aligns by
// (docs/engine/binary-program.md, sections 1 and 8), reads the statement as
// the grammar parses it (I-1112): a comment the grammar reads is left out
// wherever it stands, a displayed line's after its markup included; a
// displayed line that starts with `--` is text, not a comment; and the text
// of a string or of a displayed line is kept as written.
import { describe, expect, it } from "vitest";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { fingerprintOf } from "../../program/ProgramSave";
import { compileScript } from "./programHarness";

const silence = <T>(run: () => T): T => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const rootOf = (text: string): ProgramRoot => {
  const program = silence(() => compileScript(text).program);
  expect(program.chunks).toBeDefined();
  return program.chunks!;
};

/** The fingerprints of the statements of a scene that holds `lines`, its
 *  end (`flowEnd`) left out. */
const prints = (lines: string[]): string[] =>
  rootOf(
    ["-> start", "scene start", ...lines.map((l) => `  ${l}`), "end", ""].join(
      "\n",
    ),
  )
    .flowNamed("start")!
    .arrays.chunks.slice(0, -1)
    .map(fingerprintOf);

describe("a fingerprint read from the parse", () => {
  it("leaves out a displayed line's comment after its markup", () => {
    const lines = [
      "Hello *there*.",
      "Hello `raw` there.",
      "HERO: (softly) Hi.",
    ];
    const noted = prints(lines.map((line) => `${line} // a note`));
    expect(noted).toHaveLength(lines.length);
    expect(noted).toEqual(prints(lines));
  });

  it("leaves out each kind of Luau comment", () => {
    const plain = prints(["& x = 1", "& y = 2", "& z = 3"]);
    expect(
      prints([
        "& x = 1 -- a note",
        "& y = --[[ a block ]] 2",
        "& z = 3 --- a doc note",
      ]),
    ).toEqual(plain);
  });

  // Round 1 of the review of PR #2210 (report 6382490624): a block comment
  // whose second line is the first line of a function's body covers the
  // start of the body's cut.
  it("leaves out a block comment that runs into a function's body", () => {
    const all = (lines: string[]) =>
      [...rootOf(lines.join("\n")).sequences()].flatMap((sequence) =>
        sequence.arrays.chunks.map(fingerprintOf),
      );
    const plain = all(["function f()", "  return 1", "end", ""]);
    const noted = all(["function f() --[[ a", "b ]]", "  return 1", "end", ""]);
    expect(plain.length).toBeGreaterThan(0);
    expect(noted).toEqual(plain);
  });

  it("keeps a displayed line that starts with `--`", () => {
    const [busy] = prints(["HERO:", "  --I'm busy!"]);
    const [free] = prints(["HERO:", "  --I'm free!"]);
    expect(busy).toBeDefined();
    expect(free).not.toBe(busy);
  });

  it("keeps the text of a string, a displayed line and a tag as written", () => {
    const lines = [
      '& s = "a b"',
      "& t = [[a b]]",
      "Spaced words.",
      "HERO: Hi there.",
      "Line #tag one",
    ];
    const before = prints(lines);
    const after = prints(
      lines.map((line) => line.replace(/ (?=\S+["\].]?$)/, "  ")),
    );
    expect(after).toHaveLength(lines.length);
    after.forEach((print, i) => expect(print, lines[i]).not.toBe(before[i]));
  });
});
