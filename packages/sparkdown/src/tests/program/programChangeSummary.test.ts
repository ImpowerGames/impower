// What a compile with statement chunks says it changed
// (`ProgramChangeSummary.chunks`, #1643). The summary of a compile measured
// against the root the chunk store built from is derived from the store's
// records of that build, so its work scales with the edit; every other compile
// (a first compile, a preview's, the compile after a preview) compares the two
// whole roots. Either way it equals the whole-root comparison of the root it
// is measured against and the root the compile built.
import "../../inkjs/engine/Container";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { ChunkChanges } from "../../compiler/types/ProgramChangeSummary";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { ChunkStore } from "../../program/ChunkStore";
import { ProgramRoot } from "../../program/ProgramRoot";
import { rootChanges } from "../../program/rootChanges";
import { cumulativeEdits } from "./cumulativeEdits";
import { MAIN_URI, programCompiler } from "./programHarness";

const CONFIG = { seedBuiltinsIntoStory: true };

function quiet<T>(fn: () => T): T {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

const update = (
  compiler: SparkdownCompiler,
  text: string,
  version: number,
  offset: number,
  end: number,
  insert: string,
): string => {
  compiler.updateDocument({
    textDocument: { uri: MAIN_URI, version },
    contentChanges: [
      { range: { start: posAt(text, offset), end: posAt(text, end) }, text: insert },
    ],
  });
  return text.slice(0, offset) + insert + text.slice(end);
};

const preview = (
  compiler: SparkdownCompiler,
  version: number,
  text: string,
  offset: number,
  end: number,
  insert: string,
): SparkProgram | undefined =>
  compiler.previewCompile({
    root: { uri: MAIN_URI },
    textDocument: { uri: MAIN_URI, version },
    contentChanges: [
      { range: { start: posAt(text, offset), end: posAt(text, end) }, text: insert },
    ],
  } as never).program;

/** A summary with its ids in ascending order, which is how two are compared:
 *  the order of the ids carries no meaning. */
const sorted = (changes: ChunkChanges | undefined) =>
  changes && {
    dropped: [...changes.dropped].sort((a, b) => a - b),
    emitted: [...changes.emitted].sort((a, b) => a - b),
    moved: [...changes.moved].sort((a, b) => a - b),
    initializers: changes.initializers,
  };

/** Scenes of two lines around an `if` whose body holds a `for` loop, after a
 *  global and a function, so a program has declarations, functions, nested
 *  bodies and many flows. */
function screenplay(scenes: number): string {
  const L: string[] = ["store visits = 0", "", "function bonus(x)", "  return x * 2 + 1", "end", ""];
  for (let s = 0; s < scenes; s++) {
    L.push(`scene scene_${s}`);
    L.push(`  Room ${s} line one.`);
    L.push(`  if visits < 9 then`);
    L.push(`    Room ${s} inside the if.`);
    L.push("    for i = 1, 2 do");
    L.push(`      Room ${s} loop {i}.`);
    L.push("    end");
    L.push("  end");
    L.push(`  Room ${s} line two.`);
    L.push(`  -> scene_${(s + 1) % scenes}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the change summary of an edit inside one beat", () => {
  it("reads the definitions of the symbols the edit touched, not of every symbol", () => {
    quiet(() => {
      let text = screenplay(60);
      const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
      const first = c.compile().program;
      expect(first.fallback ?? null).toBe(null);
      expect(first.chunks).toBeDefined();
      const symbols = first.chunks!.table.symbols.length;
      expect(symbols).toBeGreaterThan(60);
      const at = text.indexOf("Room 30 line one.") + "Room 30".length;
      text = update(c.compiler, text, 2, at, at, " concerned");
      // Off for this compile: its check compares the whole roots as well.
      ChunkStore.verifyBuilds = false;
      const place = vi.spyOn(ProgramRoot.prototype, "place");
      let program: SparkProgram;
      try {
        program = c.compile().program;
      } finally {
        ChunkStore.verifyBuilds = true;
      }
      const reads = place.mock.calls.length;
      place.mockRestore();
      expect(program.chunks).toBeDefined();
      expect(program.changes?.chunks?.emitted.length).toBeGreaterThan(0);
      expect(program.changes?.chunks?.initializers).toBe(false);
      // The whole-root comparison reads every symbol's definition in both
      // roots, twice as many reads as the table has symbols.
      expect(reads, `definition reads of ${symbols} symbols`).toBeLessThan(20);
    });
  });
});

describe("the change summary equals the whole-root comparison", () => {
  it("on a first compile, a compile after a preview, and the preview itself", () => {
    quiet(() => {
      let text = screenplay(6);
      const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
      const first = c.compile().program;
      expect(sorted(first.changes?.chunks)).toEqual(
        sorted(rootChanges(undefined, first.chunks!)),
      );
      expect(first.changes?.chunks?.initializers).toBe(true);

      const at = text.indexOf("Room 3 line two.") + "Room 3".length;
      const previewed = preview(c.compiler, 1, text, at, at, " previewed")!;
      expect(previewed.chunks).toBeDefined();
      expect(previewed.chunks).not.toBe(first.chunks);
      expect(c.compiler.chunkStore!.current).toBe(first.chunks);
      expect(previewed.changes?.since).toBe(first.changes?.id);
      expect(sorted(previewed.changes?.chunks)).toEqual(
        sorted(rootChanges(first.chunks, previewed.chunks!)),
      );

      // The next served compile is measured against the preview's root, the
      // last stamped one, and not the store's current root it was built from.
      const edit = text.indexOf("Room 1 line one.") + "Room 1".length;
      text = update(c.compiler, text, 2, edit, edit, " edited");
      const next = c.compile().program;
      expect(next.changes?.since).toBe(previewed.changes?.id);
      expect(sorted(next.changes?.chunks)).toEqual(
        sorted(rootChanges(previewed.chunks, next.chunks!)),
      );
      expect(sorted(next.changes?.chunks)).not.toEqual(
        sorted(rootChanges(first.chunks, next.chunks!)),
      );

      // And the compile after that is measured against the store's root again.
      const again = text.indexOf("Room 4 inside the if.") + "Room 4".length;
      text = update(c.compiler, text, 3, again, again, " again");
      const last = c.compile().program;
      expect(last.changes?.since).toBe(next.changes?.id);
      expect(sorted(last.changes?.chunks)).toEqual(
        sorted(rootChanges(next.chunks, last.chunks!)),
      );
    });
  });

  it("across many edits with preview compiles interleaved", () => {
    quiet(() => {
      let text = screenplay(8);
      const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
      let program = c.compile().program;
      // The root the next compile is measured against: the last one stamped,
      // which is nothing after a compile that built no chunks.
      let measured = program.chunks;
      const inserts = [
        "x",
        "\n",
        " ",
        "1",
        "end",
        "then",
        "-> scene_2",
        "\n  Room said more.\n",
        "\n  local f = function() return 9 end\n",
        "\nfunction helper(y)\n  return y\nend\n",
        "\nstore count = 1\n",
        "\nscene added\n  New room.\nend\n",
        "",
      ];
      const edits = cumulativeEdits(0x1643, inserts);
      // The previews draw their own edits, which are never applied.
      const previews = cumulativeEdits(0x1644, inserts);
      const failures: string[] = [];
      let compared = 0;
      let version = 1;
      const check = (n: string, compiled: SparkProgram | undefined) => {
        if (!compiled) {
          return;
        }
        if (compiled.chunks) {
          compared += 1;
          const want = sorted(rootChanges(measured, compiled.chunks));
          const got = sorted(compiled.changes?.chunks);
          if (JSON.stringify(got) !== JSON.stringify(want)) {
            failures.push(`${n}: ${JSON.stringify(got)} vs whole-root ${JSON.stringify(want)}`);
          }
        }
        measured = compiled.chunks;
      };
      for (let n = 0; n < 60; n++) {
        if (n % 3 === 1) {
          const shown = previews.next(text);
          previews.built(true);
          check(`#${n} preview`, preview(c.compiler, version, text, shown.offset, shown.end, shown.insert));
        }
        const edit = edits.next(text);
        version += 1;
        text = update(c.compiler, text, version, edit.offset, edit.end, edit.insert);
        program = c.compile().program;
        edits.built(!!program.chunks);
        check(`#${n} edit ${JSON.stringify(edit.insert)} @${edit.offset}`, program);
      }
      expect(failures, failures.join("\n")).toEqual([]);
      expect(compared).toBeGreaterThan(40);
    });
  }, 600_000);
});
