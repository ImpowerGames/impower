// Delta-checkpoint-specific tests. The characterization net
// (checkpointSimulation.test.ts) proves observable behavior is identical with
// the flag OFF and ON. These tests additionally prove the DELTA PATH IS REALLY
// EXERCISED (not silently falling back to full keyframes) and that EVERY stored
// checkpoint — not just the last — reconstructs byte-identically to the
// full-save baseline.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "../../game/core/classes/Game";

const URI = "inmemory:///main.sd";

function compileSrc(src: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: src, version: 1, languageId: "sparkdown" },
    ],
  });
  const result = compiler.compile({ textDocument: { uri: URI }, countAllVisits: true });
  if (!result.program.compiled) {
    throw new Error("delta fixture failed to compile");
  }
  return result.program;
}

function newGame(program: unknown, config: Record<string, unknown>) {
  return new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
    ...config,
  } as any);
}

function planTo(game: Game, program: any, line: number) {
  game.setStartFrom({ file: URI, line });
  const toPath = (game as any).startPath as string;
  const fromPath = Game.getSimulateFromPath(toPath);
  return Game.planRoute(game.story, program, fromPath, toPath);
}

/** Simulate to `line` and return the final checkpoint, every reconstructed
 *  checkpoint, and the store's storage stats. */
function simulateAll(program: any, line: number, config: Record<string, unknown>) {
  const game = newGame(program, config);
  const cp = game.patchAndSimulateRoute(planTo(game, program, line));
  const store: any = game.checkpoints;
  const all: (string | null)[] = [];
  for (let i = 0; i < store.length; i++) {
    all.push(store.getJson(i));
  }
  return { cp, all, stats: store.stats, length: store.length };
}

// A long-ish linear scene: enough display beats that the store spans many
// keyframe/delta cycles, with globals mutated between beats so the per-beat
// state genuinely differs (the delta isn't trivially empty).
function buildLinearScene(lines: number): { src: string; lastLine: number } {
  const head = ["store n = 0", "", "-> start", "", "scene start"];
  const body: string[] = [];
  for (let i = 0; i < lines; i++) {
    body.push(`  Line number ${i} here.`);
    body.push(`  & n = ${i + 1}`);
  }
  const all = [...head, ...body, "end", ""];
  // Last display line is the second-to-last body entry pair's text line.
  const lastTextLineIndex = head.length + (lines - 1) * 2; // 0-based line of last "Line number" text
  return { src: all.join("\n"), lastLine: lastTextLineIndex };
}

const OFF = {};
const ON = {
  incrementalCheckpoints: true,
  verifyCheckpoints: true,
  checkpointBaseInterval: 4,
};
const ON_NO_VERIFY = {
  incrementalCheckpoints: true,
  verifyCheckpoints: false,
  checkpointBaseInterval: 4,
};

// Each game seeds story RNG from wall-clock time, so two independent runs are not
// comparable byte-for-byte. The seed-STABLE proof is a load→re-save round-trip:
// a reconstructed checkpoint must load into a fresh game and re-save identically.
// This also exercises the delta reconstruction INDEPENDENTLY of the capture-time
// self-check (load/save never touch the CheckpointStore).
function assertEveryCheckpointRoundTrips(program: any, all: (string | null)[]) {
  expect(all.length).toBeGreaterThan(0);
  for (let i = 0; i < all.length; i++) {
    const cp = all[i];
    expect(typeof cp, `checkpoint ${i} reconstructs to a string`).toBe("string");
    const g2 = newGame(program, OFF);
    expect(g2.load(cp as string), `load checkpoint ${i}`).toBe(true);
    expect(g2.save(), `byte-identical re-save of checkpoint ${i}`).toBe(cp);
  }
}

describe("delta checkpoints actually reconstruct byte-identically", () => {
  test("every reconstructed checkpoint loads + re-saves identically (verify ON)", () => {
    const { src, lastLine } = buildLinearScene(24);
    const program = compileSrc(src);
    const on = simulateAll(program, lastLine, ON);

    // The route produced enough beats to span multiple keyframe/delta cycles.
    expect(on.length).toBeGreaterThan(ON.checkpointBaseInterval);
    assertEveryCheckpointRoundTrips(program, on.all);
  });

  test("the delta path is exercised and never falls back", () => {
    const { src, lastLine } = buildLinearScene(24);
    const program = compileSrc(src);
    const on = simulateAll(program, lastLine, ON);

    // Real deltas were stored (not all keyframes), and not one of them failed
    // the byte-identical self-check (no fallback to a full keyframe).
    expect(on.stats.deltas).toBeGreaterThan(0);
    expect(on.stats.keyframes).toBeGreaterThan(0);
    expect(on.stats.fallbacks).toBe(0);
    expect(on.stats.total).toBe(on.length);
  });

  test("disabling verify still reconstructs byte-identically (pure delta path)", () => {
    const { src, lastLine } = buildLinearScene(24);
    const program = compileSrc(src);
    // verify OFF: no per-beat full save() self-check at all — pure delta path.
    const on = simulateAll(program, lastLine, ON_NO_VERIFY);

    expect(on.stats.deltas).toBeGreaterThan(0);
    expect(on.stats.fallbacks).toBe(0);
    assertEveryCheckpointRoundTrips(program, on.all);
  });

  // A scene the route simulator must drive through several forced conditionals
  // (each a lookahead try/rewind) before reaching the target — exercises the
  // runtime executedSinceCheckpoint / count-delta tracking across rewinds, in
  // the pure-delta path (verify OFF) so a rewind-leak would corrupt rather than
  // silently fall back.
  const REWIND = `store a = false
store b = false
store c = false
store out = "none"

-> start

scene start
  Intro line.
  & a = true
  if a then
    & out = "a-open"
    A opens.
  else
    & out = "a-shut"
    A shut.
  end
  & b = true
  if b then
    & out = "b-open"
    B opens.
  else
    & out = "b-shut"
    B shut.
  end
  & c = true
  if c then
    & out = "c-open"
    C opens.
  else
    & out = "c-shut"
    C shut.
  end
  Final line.
end
`;
  const REWIND_LAST_LINE = 33; // "Final line."

  test("rewind-heavy conditional route reconstructs byte-identically (verify OFF)", () => {
    const program = compileSrc(REWIND);
    const diags = (program as any).diagnostics?.[URI] ?? [];
    expect(diags.filter((d: any) => d?.severity === 1)).toEqual([]);

    const off = simulateAll(program, REWIND_LAST_LINE, OFF);
    const on = simulateAll(program, REWIND_LAST_LINE, ON_NO_VERIFY);

    expect(on.length).toBe(off.length);
    expect(on.stats.deltas).toBeGreaterThan(0);
    expect(on.stats.fallbacks).toBe(0);
    assertEveryCheckpointRoundTrips(program, on.all);
  });
});
