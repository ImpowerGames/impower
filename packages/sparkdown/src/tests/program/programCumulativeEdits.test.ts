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

const keysOf = (c: SparkdownCompiler) => uniqueKeys(programStatements(c));

interface Edit {
  offset: number;
  end: number;
  insert: string;
}

function cumulativeSession(text: string) {
  const c = programCompiler({ [MAIN_URI]: text });
  c.compile();
  let keysBefore = keysOf(c.compiler);
  let version = 1;
  const failures: string[] = [];
  let chunked = 0;
  let checked = 0;
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

const SCREENPLAYS = [
  { name: "display", text: displayScreenplay, inserts: INSERTS, seeds: [] },
  { name: "logic", text: () => logicScreenplay(3), inserts: LOGIC_INSERTS, seeds: [5] },
  {
    name: "function",
    text: () => functionScreenplay(3),
    inserts: FUNCTION_INSERTS,
    seeds: [12345, 99991, 1, 3, 4, 6, 10, 12],
  },
  { name: "capture", text: () => captureScreenplay(3), inserts: CAPTURE_INSERTS, seeds: [2, 7] },
  { name: "flow", text: () => flowScreenplay(3), inserts: FLOW_INSERTS, seeds: [3] },
  {
    name: "choose",
    text: () => chooseScreenplay(3),
    inserts: CHOOSE_INSERTS,
    seeds: [1, 2, 3, 8, 9, 10],
  },
];

const FULL = process.env["SPARKDOWN_CUMULATIVE"] === "1";
const EDITS = 120;
const SHORT_EDITS = 30;

describe("cumulative randomized edits on the statement chunks", () => {
  const runs = SCREENPLAYS.flatMap((screenplay, index) =>
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
        expect(session.chunked).toBeGreaterThan(count / 3);
        expect(session.checked).toBeGreaterThan(session.chunked);
      } finally {
        quiet();
      }
    }, 600_000);
  }

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
