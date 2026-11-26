import { describe, expect, it } from "vitest";
import { coupledScreenplay } from "../compiler/fixtures/coupledScreenplay";
import { MAIN_URI, programCompiler } from "./programHarness";
import {
  AFTER_WARM,
  bodyLines,
  coldSurface,
  CONFIG,
  COUPLED_LINES,
  divergence,
  EDITS,
  editDrawer,
  lcg,
  quiet,
  record,
  surface,
  update,
  warmed,
  warmText,
} from "./incrementalOracleHarness";

describe("incrementalEquivalence on the binary program", () => {
  it("compiles the fixture cold to its chunks", () => {
    const cold = coldSurface(coupledScreenplay());
    expect(cold.chunks).not.toBeNull();
    expect(bodyLines(coupledScreenplay()).filter((b) => b.depth >= 2).length).toBeGreaterThan(0);
  });

  for (const edit of EDITS) {
    it(`incremental == cold for edit: ${edit.name}`, () => {
      quiet(() => {
        const { c, text } = warmed(coupledScreenplay());
        const offset = text.indexOf(edit.find);
        expect(offset, `find "${edit.find}" present`).toBeGreaterThanOrEqual(0);
        const after = update(c.compiler, text, AFTER_WARM, offset, offset + edit.find.length, edit.replace);
        const incremental = surface(c.compile().program);
        expect(divergence(incremental, coldSurface(after)) ?? "none").toBe("none");
      });
    }, 120_000);
  }

  it("incremental == cold across the full diverse edit sequence on ONE compiler", () => {
    quiet(() => {
      let text = coupledScreenplay();
      const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
      c.compile();
      const failures: string[] = [];
      EDITS.forEach((edit, n) => {
        const offset = text.indexOf(edit.find);
        if (offset < 0) {
          failures.push(`#${n} ${edit.name}: find not present`);
          return;
        }
        text = update(c.compiler, text, n + 2, offset, offset + edit.find.length, edit.replace);
        const detail = divergence(surface(c.compile().program), coldSurface(text));
        if (detail) failures.push(`#${n} ${edit.name} -> ${detail}`);
      });
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
    });
  }, 300_000);

  it("incremental == cold under randomized edits, half inside nested blocks (fuzz, one edit per compiler)", () => {
    quiet(() => {
      const base = warmText(coupledScreenplay());
      const rand = lcg(0x2f6e2b1);
      const inserts = ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "", "# t", "then", ":add(1)", " += 1", "{t.a}", "function() return 1 end", "\ndefine thing with\n"];
      const draw = editDrawer(rand, inserts, COUPLED_LINES);
      const failures: string[] = [];
      let compiles = 0;
      let chunked = 0;
      let nested = 0;
      const EDIT_COUNT = 36;
      for (let n = 0; n < EDIT_COUNT; n++) {
        const edit = draw(base);
        if (edit.insert === "" && edit.end === edit.offset) continue;
        const { c } = warmed(coupledScreenplay());
        const after = update(c.compiler, base, AFTER_WARM, edit.offset, edit.end, edit.insert);
        const program = c.compile().program;
        compiles += 1;
        if (program.chunks) chunked += 1;
        if (edit.kind !== "uniform") nested += 1;
        const detail = divergence(surface(program), coldSurface(after));
        if (detail) failures.push(record(n, base, edit, detail));
      }
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      expect(chunked, `compiles that built chunks, of ${compiles}`).toBeGreaterThan(compiles / 2);
      expect(nested, `edits inside bodies, of ${compiles}`).toBeGreaterThan(compiles / 4);
    });
  }, 600_000);
});
