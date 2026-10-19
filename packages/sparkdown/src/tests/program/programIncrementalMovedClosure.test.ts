// A closure statement an edit moves between a scene and a block body, pinned
// both ways on the smallest script that shows it (found by the single-edit
// fuzz of programIncrementalEquivalence).
//
// The helpers are in ./incrementalOracleHarness; the oracle's shape is set
// out there. Each top-level describe of the former programIncrementalOracles
// test file runs from a file of its own (#1932).
import { describe, expect, it } from "vitest";
import { MAIN_URI, programCompiler } from "./programHarness";
import { coldSurface, CONFIG, divergence, quiet, surface, update } from "./incrementalOracleHarness";

// The single-edit fuzz above found an `end` typed into a choice body above a
// `then` clause whose last statement writes a closure: the `end` closes the
// `choose`, so the closure's statement moves out of the clause into the
// scene, with its text and column unchanged. A cold compile gives the
// statement's chunk a line table of two rows when the statement stands in a
// flow's own sequence (a second row at the closure's code, offset 16) and of
// one row inside a block's body; these pin the move both ways on the
// smallest script that shows it.
describe("a closure statement an edit moves between a scene and a block body", () => {
  const moved = (text: string, find: string, deleted: number, insert: string) =>
    quiet(() => {
      const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
      expect(c.compile().program.chunks).toBeDefined();
      const offset = text.indexOf(find);
      expect(offset, find).toBeGreaterThanOrEqual(0);
      const after = update(c.compiler, text, 2, offset, offset + deleted, insert);
      const program = c.compile().program;
      expect(program.chunks).toBeDefined();
      return divergence(surface(program), coldSurface(after)) ?? "none";
    });

  it("gives the statement the line table of a cold compile when it moves into an if body", () => {
    const text = "scene S\n  Before.\n  if true then\n    Inside.\n  end\n  & local f = function(n) return n + 1 end\nend\n";
    // Deletes the `end` line above the statement, which then ends the
    // `if` body.
    expect(moved(text, "  end\n  & local", "  end\n".length, "")).toBe("none");
  }, 60_000);

  it("gives the statement the line table of a cold compile when it moves out of an if body", () => {
    const text = "scene S\n  Before.\n  if true then\n    Inside.\n    & local f = function(n) return n + 1 end\n  end\nend\n";
    // Inserts an `end` line above the body, which closes the `if`.
    expect(moved(text, "    Inside.", 0, "    end\n")).toBe("none");
  }, 60_000);
});
