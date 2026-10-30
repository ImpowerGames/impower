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
  it("incremental == cold across many cumulative edits on ONE compiler, half inside nested blocks", () => {
    quiet(() => {
      expect(coldSurface(cumulativeScreenplay()).chunks).not.toBeNull();
      const EDIT_COUNT = 140;
      const inserts = ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "", "{scene_2}", "hero:", "-> scene_5", "\n& f = function() return 9 end\n", "then", ":add(1)", " += 1", "{t.a}", "function() return 1 end", "\ndefine header with\n"];
      const { failures, chunked, nested, served } = cumulativeRun(cumulativeScreenplay(), 0x51ed5, EDIT_COUNT, inserts, COUPLED_LINES, SHAPED_EDITS);
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      expect(chunked, "compiles that built chunks").toBeGreaterThan(EDIT_COUNT / 3);
      expect(nested, "edits inside bodies").toBeGreaterThan(EDIT_COUNT / 4);
      expect(served, "statements served from their memos").toBeGreaterThan(0);
    });
  }, 600_000);

  it("incremental == cold across many cumulative edits of the choose screenplay, half inside nested blocks", () => {
    quiet(() => {
      const text = chooseScreenplay(2);
      expect(coldSurface(text).chunks).not.toBeNull();
      expect(bodyLines(text).filter((b) => b.depth >= 3).length).toBeGreaterThan(0);
      const EDIT_COUNT = 70;
      const { failures, chunked, nested, served } = cumulativeRun(text, 0x697a1, EDIT_COUNT, CHOOSE_INSERTS, CHOOSE_LINES, [], true);
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      expect(chunked, "compiles that built chunks").toBeGreaterThan(EDIT_COUNT / 3);
      expect(nested, "edits inside bodies").toBeGreaterThan(EDIT_COUNT / 4);
      expect(served, "statements served from their memos").toBeGreaterThan(0);
    });
  }, 600_000);
});
