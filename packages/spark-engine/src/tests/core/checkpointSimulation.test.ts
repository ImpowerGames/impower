// Characterization tests for the checkpoint / simulation / HMR-resume machinery
// (save/load, simulate, planRoute/simulateRoute/patchAndSimulateRoute,
// getCheckpoint). These lock in the CURRENT observable behavior so the planned
// incremental/delta-checkpoint refactor can be proven regression-free.
//
// The load-bearing property the delta refactor must preserve is: the checkpoint
// returned for any simulated point restores the EXACT same state into a fresh
// game, AND re-saving is byte-identical. We assert THAT (round-trip +
// determinism) across linear, choice, and variable-driven-conditional routes —
// NOT the route planner's specific chosen values, which are its own concern (and
// note: the route SIMULATOR forces the planned path, so a simulated state need
// not match natural execution — e.g. a forced branch can leave a variable at a
// value the natural branch wouldn't).

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
    throw new Error("checkpoint fixture failed to compile");
  }
  return result.program;
}

function newGame(program: unknown) {
  return new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);
}

/** Stable fingerprint of the observable post-simulation state. */
function fp(game: Game, vars: string[]) {
  const vs: any = game.story.variablesState;
  const o: Record<string, unknown> = {
    text: (game.story.currentText ?? "").trim(),
    startVisits: (game.story.state as any).VisitCountAtPathString("start"),
  };
  for (const n of vars) o[n] = vs.$(n);
  return JSON.stringify(o);
}

function planTo(game: Game, program: any, line: number) {
  game.setStartFrom({ file: URI, line });
  const toPath = (game as any).startPath as string;
  const fromPath = Game.getSimulateFromPath(toPath);
  return Game.planRoute(game.story, program, fromPath, toPath);
}

// ---------------------------------------------------------------------------
// Linear fixture — globals mutated between display beats.
// ---------------------------------------------------------------------------

const LINEAR = `store score = 0
store flag = false

-> start

scene start
  First line here.
  & score = 10
  Second line here.
  & flag = true
  Third line here.
  & score = 30
  Fourth line here.
end
`;
const LINEAR_T = { first: 6, second: 8, third: 10, fourth: 12 };
const LINEAR_VARS = ["score", "flag"];

describe("save / load / simulate (linear)", () => {
  test("simulate() to the last line mutates globals through that point", () => {
    const program = compileSrc(LINEAR);
    const game = newGame(program);
    game.setStartFrom({ file: URI, line: LINEAR_T.fourth });
    game.simulate();
    const vs: any = game.story.variablesState;
    expect({ score: vs.$("score"), flag: vs.$("flag") }).toEqual({ score: 30, flag: true });
  });

  test("simulate() to a MID line reflects only beats up to it", () => {
    const program = compileSrc(LINEAR);
    const game = newGame(program);
    game.setStartFrom({ file: URI, line: LINEAR_T.third });
    game.simulate();
    const vs: any = game.story.variablesState;
    expect({ score: vs.$("score"), flag: vs.$("flag") }).toEqual({ score: 10, flag: true });
  });

  test("save() → load() into a fresh game round-trips state + re-saves identically", () => {
    const program = compileSrc(LINEAR);
    const game = newGame(program);
    game.setStartFrom({ file: URI, line: LINEAR_T.fourth });
    game.simulate();
    const before = fp(game, LINEAR_VARS);
    const saved = game.save();

    const game2 = newGame(program);
    expect(game2.load(saved)).toBe(true);
    expect(fp(game2, LINEAR_VARS)).toBe(before);
    expect(game2.save()).toBe(saved);
  });

  test("save() is deterministic", () => {
    const program = compileSrc(LINEAR);
    const game = newGame(program);
    game.setStartFrom({ file: URI, line: LINEAR_T.fourth });
    game.simulate();
    expect(game.save()).toBe(game.save());
  });
});

// ---------------------------------------------------------------------------
// Shared round-trip check: for every target, the checkpoint from
// patchAndSimulateRoute must restore the exact state into a fresh game and
// re-save byte-identically.
// ---------------------------------------------------------------------------

function assertRoundTrips(src: string, targets: Record<string, number>, vars: string[]) {
  const program = compileSrc(src);
  // Fixture must compile WITHOUT errors (no parse-recovery edge cases).
  const diags = (program as any).diagnostics?.[URI] ?? [];
  expect(diags.filter((d: any) => d?.severity === 1)).toEqual([]);

  for (const [name, line] of Object.entries(targets)) {
    const game = newGame(program);
    const cp = game.patchAndSimulateRoute(planTo(game, program, line));
    expect(typeof cp, `route to ${name}`).toBe("string");
    const original = fp(game, vars);

    const game2 = newGame(program);
    expect(game2.load(cp as string), `load ${name}`).toBe(true);
    expect(fp(game2, vars), `state round-trip ${name}`).toBe(original);
    expect(game2.save(), `byte-identical re-save ${name}`).toBe(cp);
  }
  return program;
}

// ---------------------------------------------------------------------------
// Choice fixture — each arm sets globals; route must take the right decision.
// ---------------------------------------------------------------------------

const CHOICE = `store gold = 0
store picked = "none"
store done = false

-> start

scene start
  You enter the cave.
  choose
  + [Take the gold]
    & gold = 100
    & picked = "gold"
    You grab the gold.
  + [Leave it]
    & gold = 0
    & picked = "left"
    You leave it be.
  then
    & done = true
    You step back.
  end
  Final words.
end
`;
const CHOICE_T = { grab: 12, leave: 16, stepBack: 19, final: 21 };
const CHOICE_VARS = ["gold", "picked", "done"];

describe("checkpoint round-trip through CHOICE routes", () => {
  test("every choice target round-trips + re-saves identically", () => {
    assertRoundTrips(CHOICE, CHOICE_T, CHOICE_VARS);
  });

  test("re-plan ACROSS the choice (grab → leave) reuses + round-trips", () => {
    const program = compileSrc(CHOICE);
    const game = newGame(program);
    game.patchAndSimulateRoute(planTo(game, program, CHOICE_T.grab));
    const cp = game.patchAndSimulateRoute(planTo(game, program, CHOICE_T.leave));
    const original = fp(game, CHOICE_VARS);
    const game2 = newGame(program);
    expect(game2.load(cp as string)).toBe(true);
    expect(fp(game2, CHOICE_VARS)).toBe(original);
    expect(game2.save()).toBe(cp);
  });

  test("re-plan to the same target is deterministic", () => {
    const program = compileSrc(CHOICE);
    const game = newGame(program);
    const a = game.patchAndSimulateRoute(planTo(game, program, CHOICE_T.final));
    const b = game.patchAndSimulateRoute(planTo(game, program, CHOICE_T.final));
    expect(b).toBe(a);
  });
});

// ---------------------------------------------------------------------------
// Variable-driven conditional fixture — a global set earlier gates an if/else
// (the case the route simulator forces conditions through + rewinds).
// ---------------------------------------------------------------------------

const COND = `store key = false
store result = "none"

-> start

scene start
  You approach the door.
  & key = true
  if key then
    & result = "open"
    The door opens.
  else
    & result = "shut"
    The door is shut.
  end
  You continue on.
end
`;
const COND_T = { open: 10, shut: 13, after: 15 };
const COND_VARS = ["key", "result"];

describe("checkpoint round-trip through variable-driven IF routes", () => {
  test("every if target round-trips + re-saves identically", () => {
    assertRoundTrips(COND, COND_T, COND_VARS);
  });

  test("re-plan ACROSS the conditional (open → shut) reuses + round-trips", () => {
    const program = compileSrc(COND);
    const game = newGame(program);
    game.patchAndSimulateRoute(planTo(game, program, COND_T.open));
    const cp = game.patchAndSimulateRoute(planTo(game, program, COND_T.shut));
    const original = fp(game, COND_VARS);
    const game2 = newGame(program);
    expect(game2.load(cp as string)).toBe(true);
    expect(fp(game2, COND_VARS)).toBe(original);
    expect(game2.save()).toBe(cp);
  });
});
