// The interleaved-preview oracle of `previewCompileRestore.test.ts` (branch
// perf/652-preview-restore-parse) on the binary program back end: a preview
// compile of an edit that is never applied, interleaved with random edits,
// never changes the cumulative program.
//
// The helpers are in ./incrementalOracleHarness; the oracle's shape is set
// out there. Each top-level describe of the former programIncrementalOracles
// test file runs from a file of its own (#1932).
import { describe, expect, it } from "vitest";
import { CHOOSE_INSERTS, chooseScreenplay } from "./chooseScreenplay";
import { MAIN_URI, programCompiler } from "./programHarness";
import {
  CHOOSE_LINES,
  coldSurface,
  CONFIG,
  COUPLED_LINES,
  divergence,
  editDrawer,
  inverseOf,
  lcg,
  preview,
  quiet,
  type RandomEdit,
  record,
  surface,
  update,
} from "./incrementalOracleHarness";

// previewCompileRestore's screenplay (branch perf/652-preview-restore-parse,
// not on main, so copied).
function previewScreenplay(scenes = 8): string {
  const L: string[] = [];
  L.push("title: Preview Restore");
  L.push("");
  L.push("define hero as character:");
  L.push(`  name = "Hero"`);
  L.push(`  color = "#3366cc"`);
  L.push("");
  L.push("define cfg as object:");
  L.push("  speed = 5");
  L.push("");
  L.push("store trust = 0");
  L.push("");
  L.push("function bonus(x):");
  L.push("  return x * 2 + 1");
  L.push("");
  for (let s = 0; s < scenes; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action describing room ${s} in some detail here.`);
    L.push(`hero:`);
    L.push(`  Line one of dialogue in scene ${s}.`);
    L.push(`  Speed is {cfg.speed} and trust is {trust}.`);
    L.push("if trust > 2 then");
    L.push(`  hero: I trust you in scene ${s}.`);
    L.push("else");
    L.push(`  hero: Not yet in scene ${s}.`);
    L.push("end");
    L.push(`& trust = bonus(trust)`);
    L.push(`-> scene_${(s + 1) % scenes}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

describe("previewCompileRestore's interleaved oracle on the binary program", () => {
  // The preview oracle's screenplay, each scene with an `if ... else ...
  // end`, and the choose screenplay, which nests blocks three deep.
  const runs = [
    {
      name: "the preview screenplay",
      text: () => previewScreenplay(10),
      inserts: ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "{scene_2}", "hero:", "-> scene_5", "\n& f = function() return 9 end\n"],
      lines: COUPLED_LINES,
      seed: 0x9e37a,
      count: 50,
      undoFallback: false,
    },
    {
      // As the cumulative run of this screenplay, an edit after which the
      // program fell back is undone by the next one.
      name: "the choose screenplay",
      text: () => chooseScreenplay(2),
      inserts: CHOOSE_INSERTS,
      lines: CHOOSE_LINES,
      seed: 0x9e37b,
      count: 30,
      undoFallback: true,
    },
  ];
  for (const run of runs) {
    it(`interleaved with random edits never changes the cumulative program of ${run.name}`, () => {
      quiet(() => {
        let text = run.text();
        expect(coldSurface(text).chunks).not.toBeNull();
        const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
        c.compile();
        const store = c.compiler.chunkStore!;
        const rand = lcg(run.seed);
        const draw = editDrawer(rand, run.inserts, run.lines);
        let version = 1;
        const failures: string[] = [];
        let chunked = 0;
        let undo: RandomEdit | undefined;
        for (let n = 0; n < run.count; n++) {
          let edit = draw(text);
          if (undo) {
            edit = undo;
            undo = undefined;
          }
          // A preview of an edit that is never applied, drawn the same way.
          const unrelated = draw(text);
          const current = store.current;
          const result = preview(c.compiler, version, unrelated.offset, unrelated.end, text, unrelated.insert);
          if (result.outdated) {
            failures.push(`#${n} preview refused at version ${version}`);
          }
          if (store.current !== current) {
            failures.push(record(n, text, unrelated, "the preview replaced the store's current root"));
          }
          if (edit.insert === "" && edit.end === edit.offset) continue;
          version += 1;
          const before = text;
          text = update(c.compiler, text, version, edit.offset, edit.end, edit.insert);
          const program = quiet(() => c.compile().program);
          if (program.chunks) chunked += 1;
          else if (run.undoFallback && edit.kind !== "undo") undo = inverseOf(before, edit);
          const detail = divergence(surface(program), coldSurface(text));
          if (detail) {
            failures.push(`${record(n, before, edit, detail)} [after preview ${JSON.stringify(unrelated.insert)} @${unrelated.offset} del=${unrelated.end - unrelated.offset}]`);
          }
        }
        expect(failures, `divergences with preview compiles interleaved:\n${failures.join("\n")}`).toEqual([]);
        expect(chunked, "compiles that built chunks").toBeGreaterThan(run.count / 3);
      });
    }, 600_000);
  }
});
