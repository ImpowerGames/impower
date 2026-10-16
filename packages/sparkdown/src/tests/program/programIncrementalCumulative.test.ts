// The compiler's `incrementalCumulativeEquivalence` oracle on the binary
// program back end (#701): many cumulative randomized edits on one compiler,
// half inside nested blocks, over the coupled and the choose screenplays,
// each compile compared with a cold one.
//
// The helpers are in ./incrementalOracleHarness; the oracle's shape is set
// out there. Each top-level describe of the former programIncrementalOracles
// test file runs from a file of its own (#1932).
import { describe, expect, it } from "vitest";
import { cumulativeScreenplay } from "../compiler/fixtures/coupledScreenplay";
import { CHOOSE_INSERTS, chooseScreenplay } from "./chooseScreenplay";
import {
  bodyLines,
  CHOOSE_LINES,
  coldSurface,
  COUPLED_LINES,
  cumulativeRun,
  quiet,
  SHAPED_EDITS,
} from "./incrementalOracleHarness";

describe("incrementalCumulativeEquivalence on the binary program", () => {
  // The cumulative oracle's fixture: the coupled screenplay without the
  // `cfg` define and the glued continuations, with the same blocks.
  it("incremental == cold across many cumulative edits on ONE compiler, half inside nested blocks", () => {
    quiet(() => {
      expect(coldSurface(cumulativeScreenplay()).chunks).not.toBeNull();
      const inserts = ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "", "{scene_2}", "hero:", "-> scene_5", "\n& f = function() return 9 end\n", "then", ":add(1)", " += 1", "{t.a}", "function() return 1 end", "\ndefine header with\n"];
      const EDIT_COUNT = 140;
      const { failures, chunked, nested, served } = cumulativeRun(
        cumulativeScreenplay(),
        0x51ed5,
        EDIT_COUNT,
        inserts,
        COUPLED_LINES,
        SHAPED_EDITS,
      );
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      expect(chunked, "compiles that built chunks").toBeGreaterThan(EDIT_COUNT / 3);
      expect(nested, "edits inside bodies").toBeGreaterThan(EDIT_COUNT / 4);
      // Edits inside the bodies leave some of their statements to their
      // memos (#656).
      expect(served, "statements served from their memos").toBeGreaterThan(0);
    });
  }, 600_000);

  // The choose screenplay (written to run from chunks) nests deeper than the
  // coupled one: a choice gated by an `if` inside a `choose`, a `choose`
  // inside a sticky choice's body, and an `if` inside a `then` clause.
  it("incremental == cold across many cumulative edits of the choose screenplay, half inside nested blocks", () => {
    quiet(() => {
      const text = chooseScreenplay(2);
      expect(coldSurface(text).chunks).not.toBeNull();
      expect(bodyLines(text).filter((b) => b.depth >= 3).length).toBeGreaterThan(0);
      const EDIT_COUNT = 70;
      // An edit of a `choose` block's structure (an `end`, a `then`, a
      // choice outside a `choose`) can leave a program that falls back as a
      // whole, which the edits after it would not repair, so an edit after
      // which the program fell back is undone by the next one.
      const { failures, chunked, nested, served } = cumulativeRun(text, 0x697a1, EDIT_COUNT, CHOOSE_INSERTS, CHOOSE_LINES, [], true);
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      expect(chunked, "compiles that built chunks").toBeGreaterThan(EDIT_COUNT / 3);
      expect(nested, "edits inside bodies").toBeGreaterThan(EDIT_COUNT / 4);
      expect(served, "statements served from their memos").toBeGreaterThan(0);
    });
  }, 600_000);
});
