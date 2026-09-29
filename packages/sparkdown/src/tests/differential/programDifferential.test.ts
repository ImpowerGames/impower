// The differential run of the binary program (#692, #694, #695). It compiles
// shared fixtures once per engine and compares what they show under the
// parity contract of #692: each beat's text, tags and display tables, and the
// errors and warnings with their source lines. A program that falls back runs
// on the current engine as a whole, so only the programs that have their
// chunks are compared, and the run reports the constructs the others fall
// back for.
//
// It also runs randomized incremental edits on the statement chunks, as
// `incrementalEquivalence` and `incrementalCumulativeEquivalence` run them on
// the current compile, over two screenplays made of the constructs the writer
// emits, one of display lines and one of logic: after each edit, the chunks
// compared by content, the flows and the diagnostics equal a cold compile's,
// and every chunk of a statement the edit did not touch is the chunk it was
// before.
//
// It is kept out of the ordinary suite (`vitest.config.ts`) and runs alone:
//   SPARKDOWN_DIFFERENTIAL=1 node scripts/test-suite.mjs run packages/sparkdown src/tests/differential/programDifferential.test.ts --wait 900
import "../../inkjs/engine/Container";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildBeatsFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { ObjectExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import type { ProgramEmitter } from "../../program/ProgramEmitter";
import { Op } from "../../program/ProgramInstructions";
import { ProgramStory } from "../../program/ProgramStory";
import { LOGIC_INSERTS, logicScreenplay } from "../program/logicScreenplay";
import {
  compileScript,
  describeRoot,
  MAIN_URI,
  programCompiler,
  rootChunks,
  storyBeats,
} from "../program/programHarness";
import {
  programStatements,
  uniqueKeys,
  untouchedChunks,
} from "../program/programStatements";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "runtime",
  "fixtures",
);

const fixtureFiles = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      fixtureFiles(full, out);
    } else if (name.endsWith(".sd")) {
      out.push(full);
    }
  }
  return out;
};

/** What a script shows on each engine from its top, or the construct its
 *  program falls back for. */
function differential(text: string): {
  fallback?: string;
  current?: unknown;
  program?: unknown;
} {
  const quiet = silence();
  // An engine that throws shows the error it threw.
  const shown = (run: () => unknown) => {
    try {
      return run();
    } catch (e) {
      return { threw: e instanceof Error ? e.message : String(e) };
    }
  };
  try {
    const { program } = compileScript(text, { programChunks: true });
    if (!program.chunks) {
      return { fallback: program.fallback?.construct ?? "no story" };
    }
    const current = compileScript(text);
    return {
      current: shown(() => {
        current.story.ResetState();
        return storyBeats(current.story);
      }),
      program: shown(() => storyBeats(new ProgramStory(program.chunks!))),
    };
  } finally {
    quiet();
  }
}

const silence = () => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  return () => {
    console.warn = warn;
    console.error = error;
  };
};

// A screenplay made of the constructs the writer emits for display: scenes
// and a branch, action and dialogue lines inline and in blocks,
// parentheticals and directives, trailing and leading glue, breaks, tags,
// load lines, comments, and `done`.
function displayScreenplay(): string {
  const L: string[] = ["# opening tag", "Before any scene.", ""];
  for (let s = 0; s < 6; s++) {
    L.push(`scene SCENE_${s}`);
    L.push(`  The room ${s} is quiet.`);
    L.push("");
    L.push("  HERO:");
    L.push(`    [[hero_calm]]`);
    L.push("    (quietly)");
    L.push(`    Line one of scene ${s}.`);
    L.push("");
    L.push(`  RIVAL: A reply in scene ${s}. # mood`);
    L.push(`  You see a ..`);
    L.push(`  .. door in scene ${s}. > It opens.`);
    L.push(`  HERO: Wait ..`);
    L.push(`  HERO: .. right there.`);
    L.push("  // a comment");
    L.push(`  load hero_calm`);
    L.push(`  First beat ${s} > Second beat ${s}.`);
    if (s % 2 === 0) {
      L.push(`  branch side_${s}`);
      L.push(`    A side line in scene ${s}.`);
      L.push("  end");
    }
    L.push("  done");
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

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
 *  agree on: the construct a program falls back for, its chunks by content
 *  (with its flows), and its diagnostics. */
const surface = (program: SparkProgram) => ({
  fallback: program.fallback ?? null,
  chunks: program.chunks ? describeRoot(program.chunks) : null,
  diagnostics: stable(program.diagnostics ?? {}),
});

const coldSurface = (text: string) => {
  const c = new SparkdownCompiler();
  c.configure({
    files: [
      { uri: MAIN_URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
    ] as never,
    programChunks: true,
  });
  return surface(c.compile({ textDocument: { uri: MAIN_URI } }).program);
};

// The keys of the statements that stand once before an edit.
const keysOf = (c: SparkdownCompiler) => uniqueKeys(programStatements(c));

// The screenplays the randomized edits run on, each with its edits.
const SCREENPLAYS = [
  { name: "the display screenplay", text: displayScreenplay, inserts: INSERTS },
  { name: "the logic screenplay", text: () => logicScreenplay(3), inserts: LOGIC_INSERTS },
];

describe("the differential run", () => {
  it("shows every shared fixture that has its chunks as the current engine does", () => {
    const fallbacks: Record<string, number> = {};
    const compared: string[] = [];
    const differing: string[] = [];
    for (const file of fixtureFiles(FIXTURES)) {
      const name = relative(FIXTURES, file);
      const result = differential(readFileSync(file, "utf8"));
      if (result.fallback) {
        fallbacks[result.fallback] = (fallbacks[result.fallback] ?? 0) + 1;
        continue;
      }
      compared.push(name);
      if (stable(result.program) !== stable(result.current)) {
        differing.push(name);
      }
    }
    console.log(
      `differential: ${compared.length} fixtures compared, fallbacks ${stable(fallbacks)}`,
    );
    expect(differing).toEqual([]);
    expect(compared.length).toBeGreaterThan(5);
  });

  it("shows the beats fixture and the screenplays as the current engine does", () => {
    const { files } = buildBeatsFixture({ lines: 300 });
    const beats = files.get("main.sd")!.replace("include scripts/characters\n", "");
    for (const text of [beats, displayScreenplay(), logicScreenplay(3)]) {
      const quiet = silence();
      try {
        const scenes = [...text.matchAll(/^scene (\w+)/gm)].map((m) => m[1]!);
        const { program } = compileScript(text, { programChunks: true });
        expect(program.fallback).toBeUndefined();
        const current = compileScript(text);
        for (const scene of scenes) {
          current.story.ResetState();
          const expected = storyBeats(current.story, scene);
          const actual = storyBeats(new ProgramStory(program.chunks!), scene);
          expect(actual).toEqual(expected);
          expect(expected.beats.length).toBeGreaterThan(0);
        }
      } finally {
        quiet();
      }
    }
  });

  // The writer broken on purpose: the first key of each table it emits is
  // dropped, so every display table the engine builds lacks its first entry.
  it("fails when the writer is broken", () => {
    const emit = ObjectExpression.prototype.EmitExpression;
    ObjectExpression.prototype.EmitExpression = function (
      this: ObjectExpression,
      emitter: ProgramEmitter,
    ) {
      this.entries.slice(1).forEach((entry) => {
        emitter.emit(Op.Str, emitter.string(entry.key as string));
        entry.value.EmitProgram(emitter);
      });
      emitter.emit(Op.MakeTable, this.entries.length - 1);
    };
    try {
      const { files } = buildBeatsFixture({ lines: 60 });
      const text = files.get("main.sd")!.replace("include scripts/characters\n", "");
      const { program } = compileScript(text, { programChunks: true });
      const current = compileScript(text);
      current.story.ResetState();
      expect(stable(storyBeats(new ProgramStory(program.chunks!), "MAIN"))).not.toBe(
        stable(storyBeats(current.story, "MAIN")),
      );
    } finally {
      ObjectExpression.prototype.EmitExpression = emit;
    }
  });
});

describe("randomized incremental edits on the statement chunks", () => {
  // As `incrementalEquivalence` runs its fuzz: each random edit from a freshly
  // configured compiler that has compiled once and made one warm-up edit.
  for (const [index, screenplay] of SCREENPLAYS.entries()) {
    it(`gives each edit of ${screenplay.name} the chunks of a cold compile, and keeps untouched ones`, () => {
      const quiet = silence();
      try {
        const base = screenplay.text();
        const failures: string[] = [];
        let compiles = 0;
        let chunked = 0;
        let seed = 0x694 + index;
        const rand = () => {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          return seed / 0x7fffffff;
        };
        for (let n = 0; n < 60; n++) {
          const insert = screenplay.inserts[Math.floor(rand() * screenplay.inserts.length)]!;
          const deleted = rand() < 0.4 ? 1 + Math.floor(rand() * 8) : 0;
          const offset = Math.floor(rand() * base.length);
          const after =
            base.slice(0, offset) + insert + base.slice(offset + deleted);
          const c = programCompiler({ [MAIN_URI]: base }, { programChunks: true });
          c.compile();
          const warm = base.indexOf("The room 0 is quiet.");
          c.compiler.updateDocument({
            textDocument: { uri: MAIN_URI, version: 2 },
            contentChanges: [
              { range: { start: posAt(base, warm), end: posAt(base, warm) }, text: "" },
            ],
          });
          c.compile();
          const before = new Set(rootChunks(c.compiler.chunkStore!.current!));
          const keysBefore = keysOf(c.compiler);
          c.compiler.updateDocument({
            textDocument: { uri: MAIN_URI, version: 3 },
            contentChanges: [
              {
                range: { start: posAt(base, offset), end: posAt(base, offset + deleted) },
                text: insert,
              },
            ],
          });
          c.compiler.lastProgramBuild = undefined;
          const { program: incremental, story } = c.compile();
          compiles += 1;
          if (story && !c.compiler.lastProgramBuild) {
            failures.push(`#${n} insert=${JSON.stringify(insert)} del=${deleted} @${offset}: the chunk build did not finish`);
          }
          const incrementalSurface = surface(incremental);
          const cold = coldSurface(after);
          const fields = (Object.keys(cold) as (keyof typeof cold)[]).filter(
            (f) => stable(incrementalSurface[f]) !== stable(cold[f]),
          );
          if (fields.length) {
            failures.push(`#${n} insert=${JSON.stringify(insert)} del=${deleted} @${offset} fields={${fields.join(",")}}`);
          }
          if (incremental.chunks) {
            chunked += 1;
            const held = new Set(rootChunks(incremental.chunks));
            const lost = untouchedChunks(c.compiler, offset, offset + insert.length, keysBefore)
              .filter((chunk) => held.has(chunk) && !before.has(chunk));
            if (lost.length) {
              failures.push(`#${n} insert=${JSON.stringify(insert)} del=${deleted} @${offset}: ${lost.length} untouched statements emitted again`);
            }
          }
        }
        expect(failures, failures.join("\n")).toEqual([]);
        // Most edits keep the program within the constructs the writer emits,
        // so most compiles build chunks; a fuzz that always fell back would
        // pass the comparisons above without testing them.
        expect(chunked).toBeGreaterThan(compiles / 2);
      } finally {
        quiet();
      }
    });
  }

  // As `incrementalCumulativeEquivalence` runs its fuzz: many edits through
  // one compiler, each compared with a cold compile of the text it leaves.
  for (const [index, screenplay] of SCREENPLAYS.entries()) {
    it(`keeps the chunks of a cold compile through many edits of ${screenplay.name} by one compiler`, () => {
      const quiet = silence();
      try {
        let text = screenplay.text();
        const c = programCompiler({ [MAIN_URI]: text }, { programChunks: true });
        c.compile();
        const failures: string[] = [];
        let seed = 0x51ed694 + index;
        const rand = () => {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          return seed / 0x7fffffff;
        };
        let chunked = 0;
        // Whether the compile before the edit built chunks, so that its root is
        // the one the edit's untouched statements keep their chunks from.
        let previousChunked = true;
        // An edit that made the program fall back is undone by the next edit,
        // so the run spends most of its edits on a program that has its chunks.
        let undo: { offset: number; length: number; text: string } | undefined;
        const EDITS = 120;
        for (let n = 0; n < EDITS; n++) {
          let insert = screenplay.inserts[Math.floor(rand() * screenplay.inserts.length)]!;
          let deleted = rand() < 0.4 ? 1 + Math.floor(rand() * 10) : 0;
          let offset = Math.floor(rand() * text.length);
          if (undo) {
            ({ offset, length: deleted, text: insert } = undo);
          }
          const end = Math.min(offset + deleted, text.length);
          undo = { offset, length: insert.length, text: text.slice(offset, end) };
          const before = new Set(rootChunks(c.compiler.chunkStore!.current!));
          const keysBefore = keysOf(c.compiler);
          c.compiler.updateDocument({
            textDocument: { uri: MAIN_URI, version: n + 2 },
            contentChanges: [
              { range: { start: posAt(text, offset), end: posAt(text, end) }, text: insert },
            ],
          });
          text = text.slice(0, offset) + insert + text.slice(end);
          c.compiler.lastProgramBuild = undefined;
          const { program: incremental, story } = c.compile();
          if (story && !c.compiler.lastProgramBuild) {
            failures.push(`#${n} insert=${JSON.stringify(insert)} del=${deleted} @${offset}: the chunk build did not finish`);
          }
          const incrementalSurface = surface(incremental);
          const cold = coldSurface(text);
          const fields = (Object.keys(cold) as (keyof typeof cold)[]).filter(
            (f) => stable(incrementalSurface[f]) !== stable(cold[f]),
          );
          if (fields.length) {
            failures.push(`#${n} insert=${JSON.stringify(insert)} del=${deleted} @${offset} fields={${fields.join(",")}}`);
          }
          if (incremental.chunks) {
            chunked += 1;
            const held = new Set(rootChunks(incremental.chunks));
            const lost = untouchedChunks(c.compiler, offset, offset + insert.length, keysBefore)
              .filter((chunk) => held.has(chunk) && !before.has(chunk));
            if (previousChunked && lost.length) {
              failures.push(`#${n} insert=${JSON.stringify(insert)} del=${deleted} @${offset}: ${lost.length} untouched statements emitted again`);
            }
          }
          previousChunked = !!incremental.chunks;
          if (incremental.chunks) {
            undo = undefined;
          }
        }
        expect(failures, failures.join("\n")).toEqual([]);
        expect(chunked).toBeGreaterThan(EDITS / 3);
      } finally {
        quiet();
      }
    });
  }
});
