// A statement's recorded source range must not claim the line after it.
//
// `program.pathLocations` maps every bytecode path to a source range, and the
// editor resolves a preview point, a breakpoint and a stack frame by asking
// which range holds a LINE. The lowerer ends a display beat's range where the
// next statement begins — column 0 of the following content line — so a range
// left as recorded reaches onto a line it does not own, and a line-keyed lookup
// hands back the previous statement. The compiler pulls such a range back to the
// end of the previous line, which is what these assertions pin.
//
// `endColumn` is an inclusive 0-based column, so both 0 (the line's first
// character) and -1 (nothing on the line at all) mean the range only touched the
// start of `endLine`.
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

function compile(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    experimentalDisplayCalls: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return (c.compile({ textDocument: { uri: URI } } as never) as any).program;
}

/** The reproduction from issue #490: an action line below a dialogue block. */
const SOURCE = `RAFFLES:
  Wow.

With an indignant pivot, Raffles glides briskly ahead.

BUNNY:
  Okay, okay!
`;

const ACTION_LINE = 3;
const BUNNY_BODY_LINE = 6;

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

describe("path locations own only their own lines (#490)", () => {
  it("a multi-line range that stops at a line's start stops on a blank line", () => {
    // A range reaching only the start of a later line is pulled back to the end
    // of the line before, so the furthest such a range can now reach is a blank
    // line — never a line carrying a statement of its own.
    const lines = SOURCE.split("\n");
    const program = compile(SOURCE);
    expect(rangesOf(program).length).toBeGreaterThan(0);
    const overreaching = rangesOf(program)
      .filter(
        ([, [, startLine, , endLine, endColumn]]) =>
          endLine! > startLine! &&
          endColumn! <= 0 &&
          (lines[endLine!] ?? "").trim() !== "",
      )
      .map(([path, location]) => `${path} @ ${location.join(",")}`);
    expect(overreaching).toEqual([]);
  });

  it("every path claiming the action line starts on it", () => {
    const program = compile(SOURCE);
    const paths = claiming(program, ACTION_LINE);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const [, startLine] = program.pathLocations[path];
      expect(startLine, `${path} claims line ${ACTION_LINE}`).toBe(ACTION_LINE);
    }
  });

  it("the dialogue block above it stops before the action line", () => {
    const program = compile(SOURCE);
    const dialogue = rangesOf(program).filter(
      ([, [, startLine]]) => startLine! < ACTION_LINE,
    );
    expect(dialogue.length).toBeGreaterThan(0);
    for (const [path, [, , , endLine]] of dialogue) {
      expect(endLine, `${path} reaches the action line`).toBeLessThan(ACTION_LINE);
    }
  });

  it("a dialogue block still owns its own body line", () => {
    // The pull-back must not shrink a range off its own content: the BUNNY
    // beat still has to claim the line its spoken text sits on.
    const program = compile(SOURCE);
    expect(claiming(program, BUNNY_BODY_LINE).length).toBeGreaterThan(0);
  });
});
