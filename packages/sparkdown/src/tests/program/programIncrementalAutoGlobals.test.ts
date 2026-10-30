import { describe, expect, it } from "vitest";
import { AUTO_GLOBAL_INSERTS, autoGlobalScreenplay } from "./autoGlobalScreenplay";
import { MAIN_URI, programCompiler } from "./programHarness";
import {
  coldSurface,
  CONFIG,
  cumulativeRun,
  divergence,
  type Edit,
  editDrawer,
  lcg,
  quiet,
  record,
  surface,
  update,
} from "./incrementalOracleHarness";

const AUTO_LINES = [
  "tally = 4",
  "score = 2",
  "Read {tally} {score} {looped}.",
  "local tally = 1",
  "& score()",
  "& seen = bump(seen)",
  "late_1 = 3",
  "end",
];

describe("the oracles over auto-globals and functions of their names", () => {
  it("compiles the fixture cold to its chunks, with auto-globals read before their assignments", () => {
    const cold = coldSurface(autoGlobalScreenplay(4));
    expect(cold.chunks).not.toBeNull();
    expect(cold.diagnostics.some((d) => d.includes("Cannot find variable named `tally`"))).toBe(true);
  });

  it("incremental == cold under randomized edits (fuzz, one edit per compiler)", () => {
    quiet(() => {
      const base = autoGlobalScreenplay(4);
      const rand = lcg(0x1607a);
      const draw = editDrawer(rand, AUTO_GLOBAL_INSERTS, AUTO_LINES);
      const failures: string[] = [];
      let chunked = 0;
      const EDIT_COUNT = 30;
      for (let n = 0; n < EDIT_COUNT; n++) {
        const edit = draw(base);
        if (edit.insert === "" && edit.end === edit.offset) continue;
        const c = programCompiler({ [MAIN_URI]: base }, CONFIG);
        c.compile();
        const after = update(c.compiler, base, 2, edit.offset, edit.end, edit.insert);
        const program = c.compile().program;
        if (program.chunks) chunked += 1;
        const detail = divergence(surface(program), coldSurface(after));
        if (detail) failures.push(record(n, base, edit, detail));
      }
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      expect(chunked, "compiles that built chunks").toBeGreaterThan(EDIT_COUNT / 2);
    });
  }, 600_000);

  it("incremental == cold across many cumulative edits on ONE compiler", () => {
    quiet(() => {
      const EDIT_COUNT = 90;
      const shaped: [string, string][] = [
        ["  tally = 0\n", "  tally = 0\n  tally = 7\n"],
        ["function score()\n  return 10\nend\n", "function tally()\n  return 10\nend\n"],
        ["store seen = 0\n", "store seen = 0\nstore tally = 1\n"],
        ["  late_0 = 1\n", ""],
        ["  score = 5\n", "  local score = 5\n"],
      ];
      const { failures, chunked } = cumulativeRun(
        autoGlobalScreenplay(4),
        0x1607b,
        EDIT_COUNT,
        AUTO_GLOBAL_INSERTS,
        AUTO_LINES,
        shaped,
        true,
      );
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      expect(chunked, "compiles that built chunks").toBeGreaterThan(EDIT_COUNT / 3);
    });
  }, 600_000);

  it("stays == cold as an assignment, a function and a declaration of a read name come and go", () => {
    let text = autoGlobalScreenplay(4);
    quiet(() => {
      expect(coldSurface(text).chunks).not.toBeNull();
      const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
      c.compile();
      const steps: Edit[] = [
        { name: "warm", find: "Tally {tally} in 2.", replace: "Tally {tally} in 2!" },
        { name: "an assignment above the first read", find: "Before any scene {tally}", replace: "Before any scene {tally}.\ntally = 1\nAgain {tally}" },
        { name: "a function of an auto-global's name", find: "function bump(n)", replace: "function looped()\n  return 2\nend\n\nfunction bump(n)" },
        { name: "a declaration of an auto-global's name", find: "store seen = 0", replace: "store seen = 0\nstore inner_1 = 5" },
        { name: "the assignment goes", find: "tally = 1\nAgain {tally}", replace: "Again {tally}" },
        { name: "the function goes", find: "function looped()\n  return 2\nend\n\n", replace: "" },
        { name: "an assignment moves below its reads", find: "  late_2 = 1\n", replace: "" },
        { name: "and back above them", find: "scene AUTO_2\n", replace: "scene AUTO_2\n  late_2 = 1\n" },
        { name: "the declaration goes", find: "\nstore inner_1 = 5", replace: "" },
      ];
      const log: string[] = [];
      steps.forEach((step, i) => {
        const offset = text.indexOf(step.find);
        expect(offset, `find ${step.find}`).toBeGreaterThanOrEqual(0);
        text = update(c.compiler, text, i + 2, offset, offset + step.find.length, step.replace);
        const program = c.compile().program;
        const detail = divergence(surface(program), coldSurface(text));
        log.push(`step ${i + 1} ${step.name}: ${program.chunks ? "chunks" : "no chunks"} ${detail ?? "ok"}`);
      });
      expect(log.filter((l) => !l.endsWith(" ok"))).toEqual([]);
    });
  }, 300_000);
});
