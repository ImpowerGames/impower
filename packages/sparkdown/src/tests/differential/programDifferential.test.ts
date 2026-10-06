// The differential run of the binary program (#692, #694, #695, #698, #696,
// #697). It compiles shared fixtures once per engine and compares what they
// show under the parity contract of #692: each beat's text, tags and display
// tables, the errors and warnings with their source lines, and each menu's
// choices with their texts, tags and indexes, taking the first choice at
// every menu and each other choice at the first menus. A program that falls
// back runs on the current engine as a whole, so only the programs that have
// their chunks are compared, and the run reports the constructs the others
// fall back for. Both engines take their shuffles' draws from one injected
// stream per run (`shuffleDraws`), so a shuffle picks the same arms on both.
//
// It also runs randomized incremental edits on the statement chunks, as
// `incrementalEquivalence` and `incrementalCumulativeEquivalence` run them on
// the current compile, over six screenplays made of the constructs the
// writer emits, one of display lines, one of logic, one of functions, one of
// functions that capture the locals around them, one of flow (scenes,
// branches, labels, diverts, tunnels, threads, counts and alternators) and
// one of `choose` blocks (their choices, bodies and `then` clauses, and
// choices raised in threads): after
// each edit, the chunks compared by content, the flows and the diagnostics
// equal a cold compile's, and every chunk of a statement the edit did not
// touch is the chunk it was before.
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
import { Gather } from "../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { shuffleDraws } from "../../inkjs/engine/Story";
import { FLOW_INSERTS, flowScreenplay } from "../program/flowScreenplay";
import { CHOOSE_INSERTS, chooseScreenplay } from "../program/chooseScreenplay";
import type { ProgramEmitter } from "../../program/ProgramEmitter";
import { Op } from "../../program/ProgramInstructions";
import { ProgramStory } from "../../program/ProgramStory";
import { cumulativeEdits } from "../program/cumulativeEdits";
import {
  CAPTURE_INSERTS,
  captureScreenplay,
  FUNCTION_INSERTS,
  functionScreenplay,
} from "../program/functionScreenplay";
import { LOGIC_INSERTS, logicScreenplay } from "../program/logicScreenplay";
import {
  compileScript,
  describeRoot,
  MAIN_URI,
  programCompiler,
  rootChunks,
  storyBeats,
  storyRun,
  type Menu,
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

/** The shuffle draws each engine takes in a run, one seeded stream per run,
 *  so that a shuffle picks the same arms on both (`shuffleDraws`, #696). */
const injectDraws = () => {
  let s = 0x696;
  shuffleDraws.next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff);
};

/** A run's errors, with the source of the one runtime error the two engines
 *  place differently left out: a jump to a target the program does not
 *  define names the jump's line on the program engine, as the design of
 *  record has it (section 2, A symbol that disappears), where the current
 *  engine names the scene's header, or no line, since the divert the
 *  lowering makes carries no range of its own. `programFlows.test.ts`
 *  asserts the program engine's line. */
const comparable = (shown: unknown): unknown => {
  const run = shown as { errors?: string[] };
  return Array.isArray(run?.errors)
    ? {
        ...run,
        errors: run.errors.map((e) =>
          e.replace(/RUNTIME ERROR: .*: Divert target not found\.$/, "RUNTIME ERROR: Divert target not found."),
        ),
      }
    : shown;
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
    const run = (picks: number[]) => {
      injectDraws();
      const currentShown = shown(() => {
        current.story.ResetState();
        return storyRun(current.story, picks);
      });
      injectDraws();
      const programShown = shown(() =>
        storyRun(new ProgramStory(program.chunks!), picks),
      );
      return { current: comparable(currentShown), program: comparable(programShown) };
    };
    // The first choice at every menu, then each other choice at each of the
    // first menus the current engine shows (#697), so that taking each
    // choice is compared.
    const runs = [run([])];
    const menus = (runs[0]!.current as { menus?: Menu[] }).menus ?? [];
    for (let m = 0; m < Math.min(menus.length, 3); m += 1) {
      for (let c = 1; c < menus[m]!.choices.length && runs.length < 12; c += 1) {
        runs.push(run([...Array<number>(m).fill(0), c]));
      }
    }
    return {
      current: runs.map((r) => r.current),
      program: runs.map((r) => r.program),
    };
  } finally {
    shuffleDraws.next = null;
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

// The keys of the statements that stand once before an edit. A key holds how
// the names of its statement resolved, which the parsed objects report only
// until any compiler compiles again (`CompileEpoch.ts`), so the keys of a
// compile, and the untouched statements found by them, are taken before the
// cold compile it is compared with.
const keysOf = (c: SparkdownCompiler) => uniqueKeys(programStatements(c));

// The screenplays the randomized edits run on, each with its edits.
const SCREENPLAYS = [
  { name: "the display screenplay", text: displayScreenplay, inserts: INSERTS },
  { name: "the logic screenplay", text: () => logicScreenplay(3), inserts: LOGIC_INSERTS },
  { name: "the function screenplay", text: () => functionScreenplay(3), inserts: FUNCTION_INSERTS },
  { name: "the capture screenplay", text: () => captureScreenplay(3), inserts: CAPTURE_INSERTS },
  { name: "the flow screenplay", text: () => flowScreenplay(3), inserts: FLOW_INSERTS },
  { name: "the choose screenplay", text: () => chooseScreenplay(3), inserts: CHOOSE_INSERTS },
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
    for (const text of [beats, displayScreenplay(), logicScreenplay(3), functionScreenplay(3), captureScreenplay(3), flowScreenplay(3), chooseScreenplay(3)]) {
      const quiet = silence();
      try {
        const scenes = [...text.matchAll(/^scene (\w+)/gm)].map((m) => m[1]!);
        const { program } = compileScript(text, { programChunks: true });
        expect(program.fallback).toBeUndefined();
        const current = compileScript(text);
        for (const scene of scenes) {
          // The first choice at every menu, and other choices at the first
          // menus, as the fixtures take them.
          for (const picks of [[], [1], [2, 1], [3, 3, 3]]) {
            injectDraws();
            current.story.ResetState();
            const expected = storyRun(current.story, picks, { from: scene });
            injectDraws();
            const actual = storyRun(new ProgramStory(program.chunks!), picks, {
              from: scene,
            });
            expect(actual).toEqual(expected);
            expect(expected.beats.length).toBeGreaterThan(0);
          }
        }
      } finally {
        shuffleDraws.next = null;
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

  // The flow writer broken on purpose: a label emits no `Visit`, so a label
  // a jump or a pass reaches is never counted.
  it("fails when the flow writer is broken", () => {
    const emit = Gather.prototype.EmitProgram;
    Gather.prototype.EmitProgram = function (this: Gather, emitter: ProgramEmitter) {
      if (this.name) {
        emitter.recordResolution(this.programResolutionKey);
        emitter.exportHere(emitter.labelSymbol(this));
      }
      emitter.emitObjects(this.content);
    };
    const quiet = silence();
    try {
      const text = flowScreenplay(1);
      const { program } = compileScript(text, { programChunks: true });
      expect(program.fallback).toBeUndefined();
      const current = compileScript(text);
      injectDraws();
      current.story.ResetState();
      const expected = storyBeats(current.story, "FLOW_0");
      injectDraws();
      expect(stable(storyBeats(new ProgramStory(program.chunks!), "FLOW_0"))).not.toBe(
        stable(expected),
      );
    } finally {
      shuffleDraws.next = null;
      quiet();
      Gather.prototype.EmitProgram = emit;
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
        // The untouched statements the edits' checks covered.
        let checked = 0;
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
          const untouched = incremental.chunks
            ? untouchedChunks(c.compiler, offset, offset + insert.length, keysBefore)
            : [];
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
            checked += untouched.length;
            const lost = untouched.filter((chunk) => held.has(chunk) && !before.has(chunk));
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
        // Every compile that built chunks checked some statement on average.
        expect(checked).toBeGreaterThan(chunked);
      } finally {
        quiet();
      }
    });
  }

  // As `incrementalCumulativeEquivalence` runs its fuzz: many edits through
  // one compiler, each compared with a cold compile of the text it leaves.
  // The function screenplay runs besides with the seeds that found statements
  // an edit moved past the ones keeping their chunks (#1221).
  const cumulativeRuns = SCREENPLAYS.flatMap((screenplay, index) =>
    [
      0x51ed694 + index,
      ...(screenplay.inserts === FUNCTION_INSERTS ? [12345, 99991] : []),
    ].map((seed, run) => ({ screenplay, seed, run })),
  );
  for (const { screenplay, seed, run } of cumulativeRuns) {
    it(`keeps the chunks of a cold compile through many edits of ${screenplay.name} by one compiler${run === 0 ? "" : `, with seed ${seed}`}`, () => {
      const quiet = silence();
      try {
        let text = screenplay.text();
        const c = programCompiler({ [MAIN_URI]: text }, { programChunks: true });
        c.compile();
        let keysBefore = keysOf(c.compiler);
        const failures: string[] = [];
        const edits = cumulativeEdits(seed, screenplay.inserts);
        let chunked = 0;
        // The untouched statements the edits' checks covered.
        let checked = 0;
        // Whether the compile before the edit built chunks, so that its root is
        // the one the edit's untouched statements keep their chunks from.
        let previousChunked = true;
        // An edit that made the program fall back is undone by the next edit,
        // so the run spends most of its edits on a program that has its chunks.
        const EDITS = 120;
        for (let n = 0; n < EDITS; n++) {
          const { offset, end, insert, deleted } = edits.next(text);
          const before = new Set(rootChunks(c.compiler.chunkStore!.current!));
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
          const untouched = incremental.chunks
            ? untouchedChunks(c.compiler, offset, offset + insert.length, keysBefore)
            : [];
          keysBefore = keysOf(c.compiler);
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
            checked += untouched.length;
            const lost = untouched.filter((chunk) => held.has(chunk) && !before.has(chunk));
            if (previousChunked && lost.length) {
              failures.push(`#${n} insert=${JSON.stringify(insert)} del=${deleted} @${offset}: ${lost.length} untouched statements emitted again`);
            }
          }
          previousChunked = !!incremental.chunks;
          edits.built(!!incremental.chunks);
        }
        expect(failures, failures.join("\n")).toEqual([]);
        expect(chunked).toBeGreaterThan(EDITS / 3);
        expect(checked).toBeGreaterThan(chunked);
      } finally {
        quiet();
      }
    });
  }
});
