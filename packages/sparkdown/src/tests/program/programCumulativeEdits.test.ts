// The cumulative randomized-edit run on the statement chunks (#1917), as the
// "randomized incremental edits on the statement chunks" block of
// `programDifferential.test.ts` ran it before #705 deleted that file with the
// object engine (2a940a750): many edits through one compiler, over six
// screenplays made of the constructs the writer emits (display lines, logic,
// functions, functions that capture the locals around them, flow, and
// `choose` blocks). After each edit, the chunks compared by content (with
// their flows) and the diagnostics equal a cold compile's, and every chunk of
// a statement the edit did not touch is the chunk it was before. The
// two-engine comparison and the whole-project run of that file stay deleted.
//
// It is the run the second acceptance criterion of #1893 reads as. Its seeds
// are the deleted run's (`0x51ed694 + index` per screenplay, and 12345 and
// 99991 for the function screenplay) and every seed a sub-issue of #1893
// names for a cumulative run on these screenplays and their inserts (listed
// with `SCREENPLAYS`), and the seed 77 sequence of #1846 on the cumulative
// oracle's fixture, with its inserts and the edit it makes and takes back.
// The seeds the sub-issues found with inserts of their own, which no file
// holds, are left out: flow 2, 6 and 9 (#1628, single edits), capture 4
// (#1613) and choose 1 with fallback inserts (#1632); choose 1 runs with the
// screenplay's inserts. A seed that still fails is kept and skipped, naming
// the Bug filed for it: flow 3 (#1934).
//
// The full run takes about ten seconds a seed, too long for the Test Suite
// workflow's sparkdown shards, so the suite runs a short form: the deleted
// run's seed of each screenplay for its first `SHORT_EDITS` edits. The full
// run, every seed for 120 edits and #1846's sequence through edit 99, runs
// alone:
//   SPARKDOWN_CUMULATIVE=1 node scripts/test-suite.mjs run packages/sparkdown src/tests/program/programCumulativeEdits.test.ts --wait 1800
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { cumulativeScreenplay } from "../compiler/fixtures/coupledScreenplay";
import { CHOOSE_INSERTS, chooseScreenplay } from "./chooseScreenplay";
import { cumulativeEdits } from "./cumulativeEdits";
import { displayScreenplay } from "./displayScreenplay";
import { FLOW_INSERTS, flowScreenplay } from "./flowScreenplay";
import {
  CAPTURE_INSERTS,
  captureScreenplay,
  FUNCTION_INSERTS,
  functionScreenplay,
} from "./functionScreenplay";
import { LOGIC_INSERTS, logicScreenplay } from "./logicScreenplay";
import { describeRoot, MAIN_URI, programCompiler, rootChunks } from "./programHarness";
import { programStatements, uniqueKeys, untouchedChunks } from "./programStatements";

const silence = () => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  return () => {
    console.warn = warn;
    console.error = error;
  };
};

// The display screenplay's edits.
const INSERTS = [
  "x",
  "\n",
  " ",
  "..",
  " ..",
  ".. ",
  "# t",
  " >",
  "BOB: ",
  "HERO:\n  ",
  "(",
  "[[a]]",
  "// c",
  "load a\n",
  "done\n",
  "{x}",
  "\n  More text.",
];

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

function stable(value: unknown): string {
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/** What an incremental compile and a cold compile of the same text must
 *  agree on: its chunks by content (with its flows), or none when the
 *  compile reported an error that stops them, and its diagnostics. */
const surface = (program: SparkProgram) => ({
  chunks: program.chunks ? describeRoot(program.chunks) : null,
  diagnostics: stable(program.diagnostics ?? {}),
});

const coldSurface = (text: string) => {
  const c = new SparkdownCompiler();
  c.configure({
    files: [
      { uri: MAIN_URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
    ] as never,
  });
  return surface(c.compile({ textDocument: { uri: MAIN_URI } }).program);
};

type Surface = ReturnType<typeof surface>;

/** The first thing `field` of an incremental compile's surface holds that a
 *  cold compile's does not, or the other way round, as the failure reports
 *  it: a diagnostic by its line, column and message, a chunk by the first
 *  line of `describeRoot` that differs. */
function firstDifference(incremental: Surface, cold: Surface, field: keyof Surface): string {
  const entries = (s: Surface): string[] => {
    if (field === "diagnostics") {
      const byUri = JSON.parse(s.diagnostics) as Record<string, any[]>;
      return Object.values(byUri)
        .flat()
        .map((d) => {
          const message = typeof d.message === "string" ? d.message : d.message?.value;
          return `${d.range.start.line}:${d.range.start.character} ${message}`;
        })
        .sort();
    }
    return s.chunks ?? ["no chunks"];
  };
  const a = entries(incremental);
  const b = entries(cold);
  const extra = a.find((entry) => !b.includes(entry));
  const missing = b.find((entry) => !a.includes(entry));
  const cut = (entry: string) => JSON.stringify(entry.length > 160 ? `${entry.slice(0, 160)}...` : entry);
  if (extra === undefined && missing === undefined) {
    return `${field}: the same entries, differing in order or in other fields`;
  }
  return `${field}: ${missing !== undefined ? `cold has ${cut(missing)}` : ""}${extra !== undefined && missing !== undefined ? ", " : ""}${extra !== undefined ? `incremental has ${cut(extra)}` : ""}`;
}

// The keys of the statements that stand once before an edit. A key holds how
// the names of its statement resolved, which the parsed objects report only
// until any compiler compiles again (`CompileEpoch.ts`), so the keys of a
// compile, and the untouched statements found by them, are taken before the
// cold compile it is compared with.
const keysOf = (c: SparkdownCompiler) => uniqueKeys(programStatements(c));

interface Edit {
  offset: number;
  end: number;
  insert: string;
}

/** One compiler over `text`, compiled once, that makes edits and compares
 *  each compile with a cold compile of the text it leaves. */
function cumulativeSession(text: string) {
  const c = programCompiler({ [MAIN_URI]: text });
  c.compile();
  let keysBefore = keysOf(c.compiler);
  let version = 1;
  const failures: string[] = [];
  let chunked = 0;
  // The untouched statements the edits' checks covered.
  let checked = 0;
  // Whether the compile before the edit built chunks of this text, so that
  // its root is the one the edit's untouched statements keep their chunks
  // from.
  let previousChunked = true;
  const update = ({ offset, end, insert }: Edit) => {
    version += 1;
    c.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version },
      contentChanges: [
        { range: { start: posAt(text, offset), end: posAt(text, end) }, text: insert },
      ],
    });
    text = text.slice(0, offset) + insert + text.slice(end);
  };
  return {
    get text() {
      return text;
    },
    failures,
    get chunked() {
      return chunked;
    },
    get checked() {
      return checked;
    },
    /** Makes `edit`, compiles, and records how the compile differs from a
     *  cold one. Returns whether the program built its chunks. */
    edit(n: number, edit: Edit, deleted: number): boolean {
      const label = `#${n} insert=${JSON.stringify(edit.insert)} del=${deleted} @${edit.offset}`;
      const current = c.compiler.chunkStore?.current;
      const before = new Set(current ? rootChunks(current) : []);
      update(edit);
      let incremental: SparkProgram;
      try {
        incremental = c.compile().program;
      } catch (e) {
        failures.push(`${label}: the compile threw ${(e as Error).message}`);
        previousChunked = false;
        keysBefore = keysOf(c.compiler);
        return false;
      }
      const untouched = incremental.chunks
        ? untouchedChunks(c.compiler, edit.offset, edit.offset + edit.insert.length, keysBefore)
        : [];
      const statements = programStatements(c.compiler);
      keysBefore = uniqueKeys(statements);
      const incrementalSurface = surface(incremental);
      const cold = coldSurface(text);
      const fields = (Object.keys(cold) as (keyof typeof cold)[]).filter(
        (f) => stable(incrementalSurface[f]) !== stable(cold[f]),
      );
      if (fields.length) {
        failures.push(
          `${label} fields={${fields.join(",")}}; ${firstDifference(incrementalSurface, cold, fields[0]!)}`,
        );
      }
      if (incremental.chunks) {
        chunked += 1;
        const held = new Set(rootChunks(incremental.chunks));
        checked += untouched.length;
        const lost = untouched.filter((chunk) => held.has(chunk) && !before.has(chunk));
        if (previousChunked && lost.length) {
          const first = statements.find((s) => s.chunk === lost[0])?.syntax ?? "";
          failures.push(
            `${label}: ${lost.length} untouched statements emitted again, the first ${JSON.stringify(first)}`,
          );
        }
      }
      previousChunked = !!incremental.chunks;
      return !!incremental.chunks;
    },
    /** Makes `edit` and compiles, then takes it back without compiling, so
     *  that the next compile's previous root is not of the text it edits. */
    editAndTakeBack(edit: Edit): void {
      const taken = text.slice(edit.offset, edit.end);
      update(edit);
      c.compile();
      update({ offset: edit.offset, end: edit.offset + edit.insert.length, insert: taken });
      keysBefore = keysOf(c.compiler);
      previousChunked = false;
    },
  };
}

// The screenplays the randomized edits run on, each with its edits and the
// seeds besides the deleted run's `0x51ed694 + index`.
const SCREENPLAYS = [
  { name: "display", text: displayScreenplay, inserts: INSERTS, seeds: [] },
  // 5: a diagnostic's end column kept from before the edit (#1613).
  { name: "logic", text: () => logicScreenplay(3), inserts: LOGIC_INSERTS, seeds: [5] },
  // 12345 and 99991: statements an edit moved past the ones keeping their
  // chunks (#1221). 1, 3 and 4: #1623. 3: a call's arguments carried with a
  // line they no longer read (#1614). 4, 6 and 10: #1613. 12: #1627, and its
  // edits #27 and #117 emitted an untouched `do` block's and `function
  // inner()`'s chunks again (#1933).
  {
    name: "function",
    text: () => functionScreenplay(3),
    inserts: FUNCTION_INSERTS,
    seeds: [12345, 99991, 1, 3, 4, 6, 10, 12],
  },
  // 2: #1613. 7: #1614's string case.
  { name: "capture", text: () => captureScreenplay(3), inserts: CAPTURE_INSERTS, seeds: [2, 7] },
  // 3: #1611's inline alternator case; its edits #70 and #102, a branch
  // named as a label, also #1934.
  { name: "flow", text: () => flowScreenplay(3), inserts: FLOW_INSERTS, seeds: [3] },
  // 1, 2, 8, 9 and 10: chunks kept or dropped past a change to the
  // anonymous symbols they read (#1611; 1 also #1632). 3: a `<` kept as text
  // above a `>` an edit adds (#1614).
  {
    name: "choose",
    text: () => chooseScreenplay(3),
    inserts: CHOOSE_INSERTS,
    seeds: [1, 2, 3, 8, 9, 10],
  },
];

const FULL = process.env["SPARKDOWN_CUMULATIVE"] === "1";
const EDITS = 120;
// The short form's edits per seed, which keep the suite's file at about
// twenty seconds.
const SHORT_EDITS = 30;

describe("cumulative randomized edits on the statement chunks", () => {
  // Many edits through one compiler, each compared with a cold compile of
  // the text it leaves. An edit after which the program built no chunks (a
  // compile error stops them) is undone by the next edit (`cumulativeEdits`),
  // so the run spends most of its edits on a program that has its chunks.
  const runs = SCREENPLAYS.flatMap((screenplay, index) =>
    // A seed that still fails is `{ seed, skip }`.
    ([0x51ed694 + index, ...(FULL ? screenplay.seeds : [])] as (number | { seed: number; skip: string })[]).map((entry) =>
      typeof entry === "number"
        ? { screenplay, seed: entry, skip: undefined }
        : { screenplay, ...entry },
    ),
  );
  const count = FULL ? EDITS : SHORT_EDITS;
  for (const { screenplay, seed, skip } of runs) {
    (skip ? it.skip : it)(`keeps the chunks of a cold compile through ${count} edits of the ${screenplay.name} screenplay by one compiler, with seed ${seed}${skip ? ` (${skip})` : ""}`, () => {
      const quiet = silence();
      try {
        const session = cumulativeSession(screenplay.text());
        const edits = cumulativeEdits(seed, screenplay.inserts);
        for (let n = 0; n < count; n++) {
          const edit = edits.next(session.text);
          edits.built(session.edit(n, edit, edit.deleted));
        }
        expect(session.failures, session.failures.join("\n")).toEqual([]);
        // A run that never built chunks would pass the comparisons above
        // without testing them.
        expect(session.chunked).toBeGreaterThan(count / 3);
        // Every compile that built chunks checked some statement on average.
        expect(session.checked).toBeGreaterThan(session.chunked);
      } finally {
        quiet();
      }
    }, 600_000);
  }

  // #1846's sequence: seed 77's edits of the cumulative oracle's fixture,
  // where edit 66 is made after a change compiled and taken back without a
  // compile, which once lost the diagnostics of a `do` block served from its
  // memo. The draws are the issue's, so that its edits are the ones it
  // reported; the divergence it found lasted through edit 99. It runs in the
  // full run only.
  it.runIf(FULL)("keeps the chunks of a cold compile through #1846's seed 77 sequence of the cumulative fixture", () => {
    const quiet = silence();
    try {
      const INSERTS_1846 = ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "{scene_2}", "hero:", "-> scene_5", "\n& f = function() return 9 end\n", "then", ":add(1)", " += 1", "function() return 1 end", "{t.a}", "\ndefine header with\n", "\nfunction later()\n  return 7\nend\n"];
      let seed = 77;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const session = cumulativeSession(cumulativeScreenplay());
      const TAKEN_BACK = 66;
      const COUNT = 100;
      for (let n = 0; n < COUNT; n++) {
        const text = session.text;
        // A name declared twice stops the cold compile resolving the rest of
        // the script (#979), so each header takes a name of its own.
        const insert = INSERTS_1846[Math.floor(rand() * INSERTS_1846.length)]!.replace("define header", `define header_${n}`);
        const deleted = rand() < 0.4 ? Math.min(1 + Math.floor(rand() * 10), 16) : 0;
        const offset = Math.floor(rand() * text.length);
        const previews = rand() < 0.3 ? 2 : 1;
        for (let p = 0; p < previews; p++) {
          const pOffset = Math.floor(rand() * text.length);
          const pDeleted = rand() < 0.3 ? Math.min(1 + Math.floor(rand() * 6), 16) : 0;
          const pInsert = INSERTS_1846[Math.floor(rand() * INSERTS_1846.length)]!;
          if (n === TAKEN_BACK) {
            session.editAndTakeBack({ offset: pOffset, end: Math.min(pOffset + pDeleted, text.length), insert: pInsert });
          }
        }
        session.edit(n, { offset, end: Math.min(offset + deleted, text.length), insert }, deleted);
      }
      expect(session.failures, session.failures.join("\n")).toEqual([]);
      expect(session.chunked).toBeGreaterThan(COUNT / 3);
      expect(session.checked).toBeGreaterThan(session.chunked);
    } finally {
      quiet();
    }
  }, 600_000);
});
