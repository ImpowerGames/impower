// Resuming the preview's route instead of searching the scene again (#653).
//
// After a compile the player replays the story from the top of the scene down
// to the line the author is on, so the Game Preview can show that line. Finding
// the way there costs one story advance per step, and at the bottom of a long
// scene there are tens of thousands of them — for an edit that usually cannot
// have changed anything the story does before it.
//
// So a compile that cannot have changed anything the story does before the
// author's line reuses the route it already has. What these tests hold down is
// that this is a shortcut and not a different answer: whatever is reused, the
// route, the verdict and the story the checkpoint restores must be the ones a
// search of the whole scene in a game that has never run would have produced
// from the same program. `expectSameAnswer` says exactly how each of the three
// is compared, and why the checkpoint is compared as the story it restores.
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { SymbolKind } from "@impower/sparkdown/src/program/ProgramSymbols";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  lastSearchStats,
  type RoutePlan,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import { searchRouteTo } from "../main/workers/searchRouteTo";

const URI = "inmemory:///main.sd";

const GAME_OPTIONS = {
  now: () => 0,
  setTimeout: ((fn: Function) => {
    fn();
    return 0;
  }) as never,
  // What the player's own worker builds. Delta checkpoints are the mode a route
  // replay runs in, so they are the mode a route resume has to work in.
  incrementalCheckpoints: true,
  verifyCheckpoints: false,
};

type Marks = Record<string, number>;

/**
 * A scene long enough to be worth not searching twice, with a
 * variable-driven condition on the way down so its route carries a decision.
 *
 * Deliberately built without a `choose` block: an incremental compile of a
 * scene holding one serves the pre-edit bytecode for every line after it, so a
 * fixture shaped that way would compare two programs that are the same program
 * and prove nothing about reuse.
 */
function screenplay(beats = 8): { text: string; at: Marks } {
  const lines: string[] = [];
  const at: Marks = {};
  const push = (text: string, mark?: string) => {
    if (mark) {
      at[mark] = lines.length;
    }
    lines.push(text);
  };
  push("store trust = 0");
  push("store key = false", "keyDeclaration");
  push("");
  push("-> act_one");
  push("");
  push("scene act_one", "actOneHeader");
  for (let i = 0; i < beats; i += 1) {
    push(`  Beat ${i} of the first act.`, `one_${i}`);
  }
  push("  & key = true");
  push("  if key then");
  push("    & trust = trust + 5");
  push("    The door is open.", "doorOpen");
  push("  else");
  push("    The door is shut.");
  push("  end");
  for (let i = 0; i < beats; i += 1) {
    push(`  Beat ${i} of the long tail.`, `tail_${i}`);
  }
  push("end");
  push("");
  push("scene act_two", "actTwoHeader");
  for (let i = 0; i < beats; i += 1) {
    push(`  Beat ${i} of the second act.`, `two_${i}`);
  }
  push("end");
  push("");
  return { text: lines.join("\n"), at };
}

/** The screenplay with two labels in its first act, `alpha` and `beta`, whose
 *  visit counts a later line can read. */
const withLabels = (text: string) =>
  text
    .replace(
      "  Beat 0 of the first act.",
      "  label alpha\n  Beat 0 of the first act.",
    )
    .replace(
      "  Beat 2 of the first act.",
      "  label beta\n  Beat 2 of the first act.",
    );

const posAt = (text: string, offset: number) => {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
};

/** A minimal-range change turning the first `find` in `text` into `replace`. */
function change(text: string, find: string, replace: string) {
  const offset = text.indexOf(find);
  expect(offset, `"${find}" is in the text`).toBeGreaterThanOrEqual(0);
  return {
    contentChanges: [
      {
        range: {
          start: posAt(text, offset),
          end: posAt(text, offset + find.length),
        },
        text: replace,
      },
    ],
    after: text.slice(0, offset) + replace + text.slice(offset + find.length),
  };
}

function quiet<T>(fn: () => T): T {
  const warn = console.warn;
  const error = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

type SimulationOptions = Record<string, unknown>;

interface RouteOutcome {
  to: ProgramAddress | null | undefined;
  checkpoint: string | undefined;
  simulation: string | undefined;
  /** Story advances the search that produced this outcome spent, or -1 when no
   *  search ran at all. */
  searchSteps: number;
  /** The addresses the resulting route runs through, in order. */
  stepAddresses: ProgramAddress[];
  /** How many steps of the plan it already had this compile was offered to
   *  resume from, or undefined when it was offered nothing. Where a resumed
   *  route was taken, this is the one position in it where steps copied from
   *  the earlier plan meet steps this search found. */
  resumedAfter?: number;
}

interface CompiledRound extends RouteOutcome {
  program: SparkProgram;
  story: unknown;
  startFrom: { file: string; line: number };
  /** What the compile said it changed, and what the route already planned
   *  offered it. Kept so a test can assert on the decision rather than on the
   *  work it saved. */
  changes: SparkProgram["changes"];
  resumption: ReturnType<Game["routeResumption"]>;
  /** The favored conditions and choices the search that produced this outcome
   *  started from, so the same search can be run again against it. */
  options: SimulationOptions;
  /** Whether the round ran on the program engine. */
  programChunks: boolean;
}

/** The session a test is driving, so a comparison made after later compiles
 *  can run the story it compares against. */
let currentSession: Session | undefined;

/**
 * One compiler and one game, driven the way the player's workspace worker
 * drives them: a compile, then a route to the author's line replayed in the
 * program it produced.
 */
class Session {
  readonly compiler = new SparkdownCompiler();
  readonly log = new RouteSearchLog();
  readonly config: { simulationOptions?: SimulationOptions } = {};
  game?: Game;
  text: string;
  /** Every story compiled so far, oldest first. The player's worker keeps
   *  the stories it displays runnable across later compiles, and between
   *  compiles its game displays one of them, which puts that story's values
   *  back into the objects the newest story shares with it. */
  readonly kept: { program: SparkProgram; story: any }[] = [];
  version = 1;
  last?: CompiledRound;

  /** Withhold the compiler's account of what it changed, which is what every
   *  reuse here rests on. A session driven this way behaves as the player did
   *  before there was one: it searches the scene on every compile. */
  readonly withoutChangeSummary: boolean;

  /** Whether the compiler builds statement chunks and the game runs them on
   *  the program engine, whose route steps are addresses (#700). */
  readonly programChunks: boolean;

  constructor(
    text: string,
    {
      withoutChangeSummary = false,
      emitCompiledProgram = false,
      programChunks = false,
    }: {
      withoutChangeSummary?: boolean;
      /** Off, the game routes the compiler's own story and no bytecode is
       *  written, as a player that holds the compiler in its own worker does. */
      emitCompiledProgram?: boolean;
      programChunks?: boolean;
    } = {},
  ) {
    this.text = text;
    this.withoutChangeSummary = withoutChangeSummary;
    this.programChunks = programChunks;
    currentSession = this;
    this.compiler.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
      emitCompiledProgram,
      programChunks,
      files: [
        {
          uri: URI,
          type: "script",
          name: "main",
          ext: "sd",
          text,
          version: 1,
          languageId: "sparkdown",
        },
      ],
    } as never);
    this.compiler.addEventListener("compiler/didCompile", (params) => {
      this.log.forget();
      this.route(params.program, params.story, true);
    });
    this.compiler.addEventListener("compiler/didPreviewCompile", (params) => {
      this.route(params.program, params.story, false);
    });
  }

  protected route(program: SparkProgram, story: unknown, remember: boolean) {
    if (this.withoutChangeSummary) {
      delete program.changes;
    }
    if (story) {
      this.compiler.keepStory(story as never);
      this.kept.push({ program, story });
    }
    if (!this.game) {
      this.game = new Game({
        program,
        story,
        ...GAME_OPTIONS,
        programChunks: this.programChunks,
      } as never);
    } else {
      this.game.updateProgram(program, story as never);
    }
    const startFrom = program.startFrom;
    this.last = undefined;
    if (!startFrom) {
      return;
    }
    this.game.setStartFrom(startFrom);
    const to = this.game.startAddress;
    if (to == null) {
      return;
    }
    const resumption = this.game.routeResumption(
      this.game.routeStartOf(to),
      to,
    );
    const options = structuredClone(this.config.simulationOptions ?? {});
    // -1 means nothing overwrote it, so no search ran.
    lastSearchStats.stepsUsed = -1;
    const log = remember ? this.log : new RouteSearchLog();
    const checkpoint = searchRouteTo(this.game, to, log, {
      config: this.config as never,
      remember,
    });
    this.last = {
      program,
      story,
      startFrom,
      changes: program.changes,
      resumption,
      options,
      programChunks: this.programChunks,
      to,
      checkpoint,
      simulation: this.game.simulation,
      searchSteps: lastSearchStats.stepsUsed,
      resumedAfter: resumption.resumeFrom?.steps.length,
      ...walked(this.game),
    };
  }

  /** Show the story before the newest on the game, as a display of the real
   *  document after a suggestion, or of a kept suggestion, does between
   *  compiles. */
  protected displayEarlierStory() {
    const shown = this.kept.at(-2);
    if (!shown || !this.game) {
      return;
    }
    this.compiler.activateStory(shown.story);
    this.game.updateProgram(shown.program, shown.story);
  }

  /** Make `story` the one that runs, when this session keeps it. */
  activate(story: unknown) {
    if (this.kept.some((k) => k.story === story)) {
      this.compiler.activateStory(story as never);
    }
  }

  /** Compile the real documents and route to `line`, as a saved edit does. */
  compile(line: number): CompiledRound {
    this.displayEarlierStory();
    quiet(() =>
      this.compiler.compile({
        textDocument: { uri: URI },
        startFrom: { file: URI, line },
      }),
    );
    return this.last!;
  }

  /** Apply an edit to the real document, as typing does. */
  edit(find: string, replace: string) {
    const applied = change(this.text, find, replace);
    this.version += 1;
    quiet(() =>
      this.compiler.updateDocument({
        textDocument: { uri: URI, version: this.version },
        contentChanges: applied.contentChanges,
      } as never),
    );
    this.text = applied.after;
    return applied.after;
  }

  /** Compile the text an autocomplete suggestion would produce, without
   *  applying it, and route to `line` in that program. */
  preview(find: string, replace: string, line: number): CompiledRound {
    const applied = change(this.text, find, replace);
    this.displayEarlierStory();
    quiet(() =>
      this.compiler.previewCompile({
        root: { uri: URI },
        textDocument: { uri: URI, version: this.version },
        contentChanges: applied.contentChanges,
        startFrom: { file: URI, line },
      }),
    );
    return this.last!;
  }
}

/**
 * The same program, routed by a game that has never run: no route to resume, so
 * the scene is searched from the top.
 *
 * The favored conditions and choices are the ones the round being checked
 * started with, so the two searches are given the same question as well as the
 * same program.
 */
function fromTheTop(round: CompiledRound): RouteOutcome {
  currentSession?.activate(round.story);
  const game = new Game({
    program: round.program,
    story: round.story,
    ...GAME_OPTIONS,
    programChunks: round.programChunks,
  } as never);
  game.setStartFrom(round.startFrom);
  const to = game.startAddress;
  const log = new RouteSearchLog();
  const checkpoint =
    to != null
      ? searchRouteTo(game, to, log, {
          config: { simulationOptions: structuredClone(round.options) as never },
        })
      : undefined;
  return {
    to,
    checkpoint,
    simulation: game.simulation,
    searchSteps: lastSearchStats.stepsUsed,
    ...walked(game),
  };
}

/** The route a game is holding, as the comparison reads it: the address of
 *  every step, in order. */
function walked(game: Game) {
  return {
    stepAddresses: (game.plannedRoute?.steps ?? []).map((s) => s.address),
  };
}

/**
 * A whole checkpoint, as far as anything downstream can tell it apart from
 * another: the story it restores, the state of every module, and the game's
 * runtime record. This is what the worker's game displays and PLAY's game
 * starts from, and what the worker reads its next route's favored decisions
 * out of, so it is what a reused route has to reproduce.
 *
 * Exactly two things are normalized, each because reproducing it is impossible
 * rather than because it is inconvenient:
 *
 *   - `storySeed`. Every story state picks one from the clock when it is
 *     created, and creating one is what a fresh game and a story reset both do.
 *     Two runs of the identical route through the identical program differ here
 *     and nowhere else.
 *   - `pathsExecutedThisFrame`. A replay resumed from a checkpoint continues
 *     from the state that checkpoint holds and never re-executes what came
 *     before it, so it never re-records those paths. That is how the replay has
 *     always worked — driving the same session with the compiler's change
 *     summary withheld, so only the older step-identity reuse runs, leaves the
 *     same gap — and no route resumed from the same checkpoint could put them
 *     back.
 *
 * Everything else is compared, including the module states and the encountered
 * choices and conditions.
 */
const comparableCheckpoint = (checkpoint: string | undefined) => {
  if (!checkpoint) {
    return "";
  }
  const save = JSON.parse(checkpoint);
  const reparse = (value: unknown) =>
    typeof value === "string" && value ? JSON.parse(value) : value;
  const story = reparse(save.story);
  if (story && typeof story === "object") {
    delete (story as Record<string, unknown>)["storySeed"];
  }
  const runtime = reparse(save.runtime);
  if (runtime && typeof runtime === "object") {
    delete (runtime as Record<string, unknown>)["pathsExecutedThisFrame"];
  }
  return JSON.stringify({ ...save, story, runtime });
};

/**
 * Assert two routes are the same answer, reporting the first place they are
 * not.
 *
 * A route holds thousands of steps and a checkpoint is a whole serialized
 * story, so comparing them as values gives a failure nobody can read. What is
 * compared instead is the first bytes of the restored story that differ, then
 * the first step, then the verdict, each with its neighbours. Every statement
 * runs once, so a resumed route and a route searched from the top hold the same
 * steps in the same order.
 */
function expectSameAnswer(
  actual: RouteOutcome,
  expected: RouteOutcome,
  note = "",
) {
  const a = comparableCheckpoint(actual.checkpoint);
  const b = comparableCheckpoint(expected.checkpoint);
  if (a !== b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
      i += 1;
    }
    expect(
      {
        at: i,
        lengths: [a.length, b.length],
        actual: a.slice(Math.max(0, i - 90), i + 90),
        expected: b.slice(Math.max(0, i - 90), i + 90),
      },
      note,
    ).toBeNull();
  }
  let step = 0;
  let against = 0;
  while (
    step < actual.stepAddresses.length &&
    against < expected.stepAddresses.length &&
    actual.stepAddresses[step] === expected.stepAddresses[against]
  ) {
    step += 1;
    against += 1;
  }
  // Both lists, to the end. Stopping when either one runs out would leave
  // whatever the other still holds unexamined.
  expect(
    step === actual.stepAddresses.length && against === expected.stepAddresses.length
      ? null
      : {
          step,
          against,
          resumedAfter: actual.resumedAfter,
          counts: [actual.stepAddresses.length, expected.stepAddresses.length],
          actual: actual.stepAddresses.slice(Math.max(0, step - 3), step + 4),
          expected: expected.stepAddresses.slice(Math.max(0, against - 3), against + 4),
        },
    note,
  ).toBeNull();
  expect(
    { paths: new Set(actual.stepAddresses).size },
    `${note} — the resumed plan visits the same positions`,
  ).toEqual({ paths: new Set(expected.stepAddresses).size });
  const shape = (o: RouteOutcome) => ({
    to: o.to,
    simulation: o.simulation,
    hasCheckpoint: o.checkpoint != null,
  });
  expect(shape(actual), note).toEqual(shape(expected));
}

/** Count calls to the planner without holding on to their arguments: one of
 *  them is the whole runtime story, and a failed assertion that tries to print
 *  it runs out of string. */
function watchSearches() {
  const calls: { resumed: boolean }[] = [];
  const planRoute = Game.planRoute.bind(Game);
  vi.spyOn(Game, "planRoute").mockImplementation(((...args: unknown[]) => {
    const budget = args[5] as { resumeFrom?: unknown } | undefined;
    calls.push({ resumed: budget?.resumeFrom != null });
    return planRoute(...(args as Parameters<typeof Game.planRoute>));
  }) as never);
  return calls;
}

/** The same, for the replay: what is kept is where it resumed and which
 *  checkpoint that step carried. */
function watchReplays() {
  const calls: { fromStep: number; checkpoint: number }[] = [];
  const proto = Game.prototype as unknown as Record<string, any>;
  const simulateRoute = proto["simulateRoute"]!;
  vi.spyOn(proto, "simulateRoute").mockImplementation(function (
    this: Game,
    route: RoutePlan,
    fromStep = 0,
    fromCheckpoint?: number,
  ) {
    calls.push({
      fromStep,
      checkpoint: fromCheckpoint ?? route.steps[fromStep]?.checkpoint ?? -1,
    });
    return simulateRoute.call(this, route, fromStep, fromCheckpoint);
  } as never);
  return calls;
}

/** The deepest checkpoint a route captured. */
const deepestCheckpoint = (route: RoutePlan) =>
  Math.max(-1, ...route.steps.map((s) => s.checkpoint ?? -1));

afterEach(() => {
  vi.restoreAllMocks();
});

// Everything below rests on `expectSameAnswer`, so it is worth knowing that it
// can fail. A comparison that quietly accepts a difference turns every test
// that uses it into a test of nothing.
describe("the comparison the rest of these tests rest on", () => {
  const save = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      modules: { ui: { images: ["a"] } },
      context: {},
      story: JSON.stringify({ variablesState: { trust: 0 }, storySeed: 41 }),
      runtime: JSON.stringify({
        pathsExecutedThisFrame: ["act_one.0"],
        choicesEncountered: [],
        conditionsEncountered: [{ selected: true }],
      }),
      ...over,
    });
  const outcome = (over: Partial<RouteOutcome> = {}): RouteOutcome => ({
    to: "act_one.9",
    checkpoint: save(),
    simulation: "success",
    searchSteps: 0,
    stepAddresses: ["a", "b", "c"],
    ...over,
  });
  const differs = (over: Partial<RouteOutcome>) => () =>
    expectSameAnswer(outcome(over), outcome());

  test("accepts two runs that differ only in the story's random seed", () => {
    const reseeded = save({
      story: JSON.stringify({ variablesState: { trust: 0 }, storySeed: 7 }),
    });
    expect(differs({ checkpoint: reseeded })).not.toThrow();
  });

  test("rejects a module's state differing", () => {
    expect(differs({ checkpoint: save({ modules: { ui: { images: ["b"] } } }) })).toThrow();
  });

  test("rejects the recorded conditions differing", () => {
    const other = save({
      runtime: JSON.stringify({
        pathsExecutedThisFrame: ["act_one.0"],
        choicesEncountered: [],
        conditionsEncountered: [{ selected: false }],
      }),
    });
    expect(differs({ checkpoint: other })).toThrow();
  });

  test("rejects a position the route never visited", () => {
    expect(differs({ stepAddresses: ["a", "b", "d"] })).toThrow();
  });

  test("rejects a route that holds a run of steps once where the other holds it twice", () => {
    expect(() =>
      expectSameAnswer(
        outcome({ stepAddresses: ["a", "b", "c"], resumedAfter: 1 }),
        outcome({ stepAddresses: ["a", "b", "a", "b", "c"] }),
      ),
    ).toThrow();
  });

  test("rejects a route that skipped steps", () => {
    expect(() =>
      expectSameAnswer(outcome({ stepAddresses: ["a", "d"] }), outcome({ stepAddresses: ["a", "b", "c", "d"] })),
    ).toThrow();
  });
});

describe("a compile whose edit is below the route's last checkpoint", () => {
  test("replays the route it has, with no search and from that checkpoint", () => {
    const { text, at } = screenplay();
    const session = new Session(text);
    const target = at["tail_6"]!;
    session.compile(target);
    const deepest = deepestCheckpoint(session.game!.plannedRoute!);
    expect(deepest).toBeGreaterThanOrEqual(0);

    const searches = watchSearches();
    const replays = watchReplays();
    session.edit(
      "Beat 6 of the long tail.",
      "Beat 6 of the long tail, at last.",
    );
    const after = session.compile(target);

    expect(searches).toEqual([]);
    expect(after.searchSteps).toBe(-1);
    expect(after.simulation).toBe("success");
    expect(replays).toHaveLength(1);
    expect(replays[0]!.checkpoint).toBe(deepest);
    expect(replays[0]!.fromStep).toBeGreaterThan(0);
  });

  test("answers what a search from the top would answer", () => {
    const { text, at } = screenplay();
    const session = new Session(text);
    const target = at["tail_6"]!;
    session.compile(target);
    session.edit(
      "Beat 6 of the long tail.",
      "Beat 6 of the long tail, at last.",
    );
    const after = session.compile(target);

    expectSameAnswer(after, fromTheTop(after));
  });

  test("searches the scene when the compile says nothing about what it changed", () => {
    const { text, at } = screenplay();
    const session = new Session(text, { withoutChangeSummary: true });
    const target = at["tail_6"]!;
    const first = session.compile(target);

    const searches = watchSearches();
    session.edit(
      "Beat 6 of the long tail.",
      "Beat 6 of the long tail, at last.",
    );
    const after = session.compile(target);

    expect(searches).toEqual([{ resumed: false }]);
    expect(after.searchSteps).toBeGreaterThan(first.searchSteps / 2);
    expectSameAnswer(after, fromTheTop(after));
  });
});

describe("a compile that adds a line at the bottom of the scene", () => {
  test("searches onward from the last checkpoint rather than from the top", () => {
    const { text, at } = screenplay();
    const session = new Session(text);
    const first = session.compile(at["tail_7"]!);
    expect(first.searchSteps).toBeGreaterThan(50);
    const deepest = deepestCheckpoint(session.game!.plannedRoute!);

    const searches = watchSearches();
    const replays = watchReplays();
    session.edit(
      "  Beat 7 of the long tail.",
      "  Beat 7 of the long tail.\n  One more beat entirely.",
    );
    const target = at["tail_7"]! + 1;
    const after = session.compile(target);

    expect(after.simulation).toBe("success");
    expect(after.resumption).toMatchObject({ replayOnly: false });
    expect(after.resumption.stepIndex).toBeGreaterThan(0);
    expect(searches).toEqual([{ resumed: true }]);
    // The one search that ran covered the added beat, not the scene: the whole
    // scene costs what the first compile above spent.
    expect(after.searchSteps).toBeGreaterThan(0);
    expect(after.searchSteps).toBeLessThan(first.searchSteps / 4);
    expect(replays[0]!.checkpoint).toBe(deepest);
  });

  test("answers what a search from the top would answer", () => {
    const { text, at } = screenplay();
    const session = new Session(text);
    session.compile(at["tail_7"]!);
    session.edit(
      "  Beat 7 of the long tail.",
      "  Beat 7 of the long tail.\n  One more beat entirely.",
    );
    const after = session.compile(at["tail_7"]! + 1);

    expectSameAnswer(after, fromTheTop(after));
  });
});

describe("a compile that changes a statement the route already ran", () => {
  test("resumes from no checkpoint captured after it", () => {
    const { text, at } = screenplay();
    const session = new Session(text);
    const target = at["tail_6"]!;
    session.compile(target);
    const route = session.game!.plannedRoute!;
    const changedLine = at["one_2"]!;
    // The deepest checkpoint the route captured before the statement about to
    // change. Anything past it was captured with that statement as it reads
    // now, so resuming from it would carry the old reading forward.
    const allowed = Math.max(
      -1,
      ...route.steps
        .filter((s) => s.location != null && s.location[1]! < changedLine)
        .map((s) => s.checkpoint ?? -1),
    );

    const replays = watchReplays();
    session.edit(
      "Beat 2 of the first act.",
      "Beat 2 of the first act, rewritten.",
    );
    const after = session.compile(target);

    expect(replays.length).toBeGreaterThan(0);
    for (const replay of replays) {
      expect(replay.checkpoint).toBeLessThanOrEqual(allowed);
    }
    expectSameAnswer(after, fromTheTop(after));
  });
});

describe("a preview compile", () => {
  test("reuses the route and answers what a search from the top would", () => {
    const { text, at } = screenplay();
    const session = new Session(text);
    const target = at["tail_6"]!;
    session.compile(target);

    const searches = watchSearches();
    const preview = session.preview(
      "Beat 6 of the long tail.",
      "Beat 6 of the long tail, suggested.",
      target,
    );

    expect(searches).toEqual([]);
    expectSameAnswer(preview, fromTheTop(preview));
  });

  test("leaves the real program's next route able to resume too", () => {
    const { text, at } = screenplay();
    const session = new Session(text);
    const target = at["tail_6"]!;
    session.compile(target);
    session.preview(
      "Beat 6 of the long tail.",
      "Beat 6 of the long tail, suggested.",
      target,
    );

    const searches = watchSearches();
    const after = session.compile(target);

    expect(searches).toEqual([]);
    expectSameAnswer(after, fromTheTop(after));
  });
});

// Each of these changes what the story does along a route without editing a
// line the route runs through: a declaration whose value every checkpoint's
// variables embed, or an edit that moves a visit-count flag or a divert target
// inside a scene nobody touched. The compile must refuse to call itself
// confined, the route must be searched again, and the answer must be the one a
// search from the top gives.
const HAZARDS: { name: string; find: string; replace: string }[] = [
  {
    name: "a store's value changes",
    find: "store trust = 0",
    replace: "store trust = 7",
  },
  {
    name: "a new global is declared",
    find: "store key = false",
    replace: "store key = false\nstore extra = 3",
  },
  {
    name: "a constant is declared below the route",
    find: "scene act_two",
    replace: "const LATE = 4\n\nscene act_two",
  },
  {
    name: "a later line first reads an earlier container's visit count",
    find: "  Beat 0 of the second act.",
    replace: "  Beat 0 of the second act. It has run {act_one} times.",
  },
  {
    // The same hazard written inside the scene the route runs through. The
    // scene's own shape is expected to change here, so the comparison that
    // catches the case above cannot be the one that catches this: what moves is
    // how much counting the scene requires, and every checkpoint taken before
    // it started counting is short a visit it cannot reconstruct.
    name: "a later line first reads the visit count of the scene being routed",
    find: "  Beat 7 of the long tail.",
    replace: "  Beat 7 of the long tail. It has run {act_one} times.",
  },
  {
    name: "a flow below the route is renamed",
    find: "scene act_two",
    replace: "scene act_three",
  },
  {
    name: "a scene is added below the route",
    find: "scene act_two",
    replace: "scene act_interlude\n  A quiet moment.\nend\n\nscene act_two",
  },
  {
    name: "a function is added below the route",
    find: "scene act_two",
    replace: "function late(n)\n  return n + 1\nend\n\nscene act_two",
  },
];

// Each case runs with the bytecode emitted and without it, because a compile
// that writes none has to reach the same verdict from the same evidence.
const EMISSION = [
  { emitCompiledProgram: true, mode: "emitting" },
  { emitCompiledProgram: false, mode: "not emitting" },
];

describe.each(EMISSION)("a change the route's own lines cannot account for, $mode", ({ emitCompiledProgram }) => {
  for (const hazard of HAZARDS) {
    test(`is searched again (${hazard.name})`, () => {
      const { text, at } = screenplay();
      const session = new Session(text, { emitCompiledProgram });
      const target = at["tail_6"]!;
      session.compile(target);

      const searches = watchSearches();
      session.edit(hazard.find, hazard.replace);
      const after = session.compile(target);

      expect({
        confined: after.changes?.confined,
        resumed: after.resumption.stepIndex != null,
      }).toEqual({ confined: false, resumed: false });
      expect(searches.length).toBeGreaterThan(0);
      expectSameAnswer(after, fromTheTop(after));
    });
  }

  // The same hazard again, written so that nothing which merely adds up how
  // much counting a scene does can catch it. Two labels stand in the first act
  // and one of them is read from the bottom of the scene; moving the read to
  // the other label stops one container counting and starts another under the
  // same flags. Every checkpoint taken before the move carries a count for the
  // container that no longer keeps one and none for the container that now
  // does, so a route resumed from one reports the wrong number of visits.
  test("is searched again (a later line reads a different container's visit count)", () => {
    const { text } = screenplay();
    const READ = "  Beat 7 of the long tail. It has run {act_one.alpha} times.";
    const labelled = withLabels(text).replace("  Beat 7 of the long tail.", READ);
    const target = labelled.split("\n").indexOf(READ);
    expect(target, "the line being routed to is in the fixture").toBeGreaterThan(
      0,
    );
    const session = new Session(labelled, { emitCompiledProgram });
    const before = session.compile(target);
    expect(
      (before.program.diagnostics?.[URI] ?? []).filter(
        (d) => d.severity === 1,
      ),
      "the fixture compiles clean",
    ).toEqual([]);

    const searches = watchSearches();
    session.edit("{act_one.alpha}", "{act_one.beta}");
    const after = session.compile(target);

    expect({
      confined: after.changes?.confined,
      resumed: after.resumption.stepIndex != null,
    }).toEqual({ confined: false, resumed: false });
    expect(searches.length).toBeGreaterThan(0);
    expectSameAnswer(after, fromTheTop(after));
  });
});

/** A small deterministic generator, so a failing sequence is reproducible. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe("randomized edit sequences", () => {
  test("never answer differently from a search of the whole scene", () => {
    const { text, at } = screenplay();
    const session = new Session(text);
    const targets = ["tail_1", "tail_4", "tail_7", "doorOpen", "one_5"].map(
      (mark) => at[mark]!,
    );
    let target = targets[2]!;
    session.compile(target);

    const next = rng(20260920);
    const rounds: string[] = [];
    for (let i = 0; i < 24; i += 1) {
      const roll = next();
      const beat = Math.floor(next() * 8);
      const suffix = ` (${i})`;
      let round: CompiledRound;
      if (roll < 0.2) {
        // Move the cursor without editing anything.
        target = targets[Math.floor(next() * targets.length)]!;
        round = session.compile(target);
        rounds.push(`move to ${target}`);
      } else if (roll < 0.4) {
        // A suggestion highlighted in the list: compiled, never applied.
        const find = `Beat ${beat} of the long tail.`;
        round = session.preview(find, `${find}${suffix}`, target);
        rounds.push(`preview ${find}`);
      } else if (roll < 0.6) {
        // An edit to the beat the cursor is on.
        const find = `Beat ${beat} of the long tail.`;
        session.edit(find, `${find}${suffix}`);
        round = session.compile(target);
        rounds.push(`edit tail ${beat}`);
      } else if (roll < 0.75) {
        // An edit above everything the route runs through.
        const find = `Beat ${beat} of the first act.`;
        session.edit(find, `${find}${suffix}`);
        round = session.compile(target);
        rounds.push(`edit first act ${beat}`);
      } else if (roll < 0.85) {
        // An edit in a scene the route never enters.
        const find = `Beat ${beat} of the second act.`;
        session.edit(find, `${find}${suffix}`);
        round = session.compile(target);
        rounds.push(`edit second act ${beat}`);
      } else if (roll < 0.95) {
        // A line added at the bottom of the scene.
        const find = "  Beat 7 of the long tail.";
        session.edit(find, `${find}\n  Added beat${suffix}.`);
        round = session.compile(target);
        rounds.push(`insert after the tail`);
      } else {
        // A global's value, which every checkpoint's variables embed.
        session.edit("store trust = ", `store trust =  `);
        round = session.compile(target);
        rounds.push(`touch a global`);
      }
      expectSameAnswer(round, fromTheTop(round), rounds.join(" | "));
    }
  });
});

// A player that holds the compiler in its own worker routes the compiler's own
// story and never reads bytecode, so it compiles with emission off. Whether a
// compile is confined is a question about the program, not about whether it was
// written out, so the verdict has to be the same one.
describe("a compile that emits no bytecode", () => {
  test("certifies an edit inside one beat and replays with no search", () => {
    const { text, at } = screenplay();
    const session = new Session(text, { emitCompiledProgram: false });
    const target = at["tail_6"]!;
    session.compile(target);
    const deepest = deepestCheckpoint(session.game!.plannedRoute!);
    expect(deepest).toBeGreaterThanOrEqual(0);

    const searches = watchSearches();
    const replays = watchReplays();
    session.edit(
      "Beat 6 of the long tail.",
      "Beat 6 of the long tail, at last.",
    );
    const after = session.compile(target);

    expect(after.program.compiled).toBeUndefined();
    expect(after.changes?.confined).toBe(true);
    expect(searches).toEqual([]);
    expect(after.searchSteps).toBe(-1);
    expect(replays).toHaveLength(1);
    expect(replays[0]!.checkpoint).toBe(deepest);
    expectSameAnswer(after, fromTheTop(after));
  });

  test("never serializes the program", () => {
    const { text, at } = screenplay();
    const session = new Session(text, { emitCompiledProgram: false });
    session.compiler.profilerId = "713";
    const proto = SparkdownCompiler.prototype as unknown as Record<string, any>;
    const serialize = vi.spyOn(proto, "serializeCompiledProgram");
    const measure = vi.spyOn(performance, "measure");
    const target = at["tail_6"]!;

    session.compile(target);
    session.edit(
      "Beat 6 of the long tail.",
      "Beat 6 of the long tail, at last.",
    );
    session.preview(
      "Beat 5 of the long tail.",
      "Beat 5 of the long tail, suggested.",
      target,
    );
    const after = session.compile(target);

    const phases = measure.mock.calls.map(([name]) => String(name));
    expect(serialize).not.toHaveBeenCalled();
    expect(phases.filter((name) => name.includes("ink/json"))).toEqual([]);
    // The walk that stands in for serialization is measured under its own name.
    expect(phases.some((name) => name.includes("ink/flowShapes"))).toBe(true);
    expect(after.program.compiled).toBeUndefined();
    expect(after.program.compiledBuffer).toBeUndefined();
    expect(after.changes?.confined).toBe(true);
  });
});

describe("randomized edit sequences, emitting and not", () => {
  test("reach the same verdict on every compile", () => {
    const text = withLabels(screenplay().text);
    const lines = text.split("\n");
    const targets = [
      "  Beat 1 of the long tail.",
      "  Beat 4 of the long tail.",
      "  Beat 7 of the long tail.",
      "    The door is open.",
      "  Beat 5 of the first act.",
    ].map((line) => lines.indexOf(line));
    expect(targets.every((line) => line > 0)).toBe(true);
    const emitting = new Session(text);
    const silent = new Session(text, { emitCompiledProgram: false });
    const both = (act: (session: Session) => CompiledRound) => {
      const a = act(emitting);
      const b = act(silent);
      expect(emitting.text).toBe(silent.text);
      return [a, b] as const;
    };
    let target = targets[2]!;
    both((s) => s.compile(target));

    // The two reproductions #653's reviews found, as edits the sequence can
    // make: the first `{act_one}` reference inside the scene being routed, and
    // counting moving between two labels.
    const SCENE_READ = " It has run {act_one} times.";
    let sceneRead = false;
    let labelRead: "alpha" | "beta" | undefined;

    const next = rng(20260921);
    const rounds: string[] = [];
    const verdicts = new Set<boolean | undefined>();
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const roll = next();
      const beat = Math.floor(next() * 8);
      const suffix = ` (${i})`;
      let label: string;
      let pair: readonly [CompiledRound, CompiledRound];
      if (roll < 0.15) {
        target = targets[Math.floor(next() * targets.length)]!;
        label = "move";
        pair = both((s) => s.compile(target));
      } else if (roll < 0.35) {
        const find = `Beat ${beat} of the long tail.`;
        label = "preview";
        pair = both((s) => s.preview(find, `${find}${suffix}`, target));
      } else if (roll < 0.5) {
        const find = `Beat ${beat} of the long tail.`;
        label = "edit tail";
        pair = both((s) => (s.edit(find, `${find}${suffix}`), s.compile(target)));
      } else if (roll < 0.6) {
        const find = `Beat ${beat} of the first act.`;
        label = "edit first act";
        pair = both((s) => (s.edit(find, `${find}${suffix}`), s.compile(target)));
      } else if (roll < 0.68) {
        const find = `Beat ${beat} of the second act.`;
        label = "edit second act";
        pair = both((s) => (s.edit(find, `${find}${suffix}`), s.compile(target)));
      } else if (roll < 0.8) {
        const find = "Beat 6 of the long tail.";
        label = sceneRead ? "drop the scene read" : "add the scene read";
        pair = both((s) => {
          if (sceneRead) {
            s.edit(SCENE_READ, "");
          } else {
            s.edit(find, `${find}${SCENE_READ}`);
          }
          return s.compile(target);
        });
        sceneRead = !sceneRead;
      } else if (roll < 0.95) {
        const to = labelRead === "alpha" ? "beta" : "alpha";
        label = labelRead ? `move the label read to ${to}` : "add a label read";
        pair = both((s) => {
          if (labelRead) {
            s.edit(`{act_one.${labelRead}}`, `{act_one.${to}}`);
          } else {
            const find = "Beat 7 of the long tail.";
            s.edit(find, `${find} Counted {act_one.${to}}.`);
          }
          return s.compile(target);
        });
        labelRead = to;
      } else {
        label = "touch a global";
        pair = both((s) => (s.edit("store trust = ", "store trust =  "), s.compile(target)));
      }
      rounds.push(label);
      seen.add(label);
      const note = rounds.join(" | ");
      const [on, off] = pair;
      expect(off.changes?.confined, note).toBe(on.changes?.confined);
      verdicts.add(off.changes?.confined);
      expectSameAnswer(off, fromTheTop(off), note);
    }
    // A sequence that never certified anything, or never refused, or never made
    // the two edits it exists for, would prove nothing.
    expect([...verdicts].sort()).toEqual([false, true]);
    expect(seen).toContain("add the scene read");
    expect(seen).toContain("move the label read to beta");
  });
});

// The same oracle on the program engine (#700). A route step is known by its
// address, which names its statement's chunk, and a step is reused when the
// new root still holds its chunk and still moves from the step before it the
// way the route did (`validAddressPrefixLength`): the first statement the
// compile emitted again or inserted along the route ends the reuse. What is
// reused must still be a shortcut and not a different answer: the route, the
// verdict and the checkpoint equal a search and replay from the top of the
// scene in a fresh game.
const PROGRAM = { programChunks: true } as const;

/** The story steps the program engine ran during `run`, past any story's
 *  declarations: the search's and the replay's. */
const stepsRun = (_session: Session, run: () => CompiledRound) => {
  // Every step any program story runs, counted where its own counter moves:
  // a compile may hand the game a new story, whose counter starts again, and
  // each new story first runs the program's declarations (the builtins
  // prelude's among them), which are the same for every compile.
  const proto = ProgramStory.prototype as unknown as {
    Step(this: ProgramStory): void;
    runDeclarations(this: ProgramStory): void;
  };
  const step = proto.Step;
  const declare = proto.runDeclarations;
  let declaring = 0;
  let steps = 0;
  const spies = [
    vi.spyOn(proto, "Step").mockImplementation(function (this: ProgramStory) {
      const before = this.stepCount;
      try {
        step.call(this);
      } finally {
        if (declaring === 0) {
          steps += this.stepCount - before;
        }
      }
    }),
    vi
      .spyOn(proto, "runDeclarations")
      .mockImplementation(function (this: ProgramStory) {
        declaring += 1;
        try {
          declare.call(this);
        } finally {
          declaring -= 1;
        }
      }),
  ];
  try {
    return { round: run(), steps };
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
};

describe("on the program engine", () => {
  test("a route's steps are addresses, and its checkpoints those of the program engine", () => {
    const { text, at } = screenplay();
    const session = new Session(text, PROGRAM);
    const round = session.compile(at["tail_6"]!);
    expect(round.simulation).toBe("success");
    expect(typeof round.to).toBe("number");
    expect(round.stepAddresses.length).toBeGreaterThan(20);
    expect(round.stepAddresses.every((a) => typeof a === "number")).toBe(true);
    expect(round.program.pathLocations).toBeUndefined();
    expect(round.changes?.chunks).toBeDefined();
    expect(session.game!.programStory).not.toBeNull();
  });

  test("an edit to a display beat below every checkpoint resumes the last one, and runs only the steps after it", () => {
    const { text, at } = screenplay();
    const session = new Session(text, PROGRAM);
    const target = at["tail_6"]!;
    const first = stepsRun(session, () => session.compile(target));
    const route = session.game!.plannedRoute!;
    const deepest = deepestCheckpoint(route);
    expect(deepest).toBeGreaterThanOrEqual(0);
    // The last checkpoint standing before the edited beat: the deepest one
    // that a step before the beat's own carries. The beat's statement is
    // emitted again, so the route's steps from it on name an address the new
    // program does not hold, unlike the current engine's paths, and the
    // story searches on from that checkpoint instead of replaying (#700).
    const edited = Math.floor(
      session.game!.programStory!.root.addressAt(URI, target)! / 2 ** 21,
    );
    const beat = route.steps.findIndex(
      (s) => Math.floor((s.address as number) / 2 ** 21) === edited,
    );
    expect(beat).toBeGreaterThan(0);
    const standing = Math.max(
      -1,
      ...route.steps.slice(0, beat).map((s) => s.checkpoint ?? -1),
    );
    expect(standing).toBeGreaterThanOrEqual(deepest - 1);

    const searches = watchSearches();
    const replays = watchReplays();
    session.edit("Beat 6 of the long tail.", "Beat 6 of the long tail, at last.");
    const after = stepsRun(session, () => session.compile(target));

    expect(after.round.changes?.chunks).toMatchObject({ initializers: false });
    expect(after.round.simulation).toBe("success");
    expect(after.round.resumption).toMatchObject({
      replayOnly: false,
      checkpointIndex: standing,
    });
    expect(searches).toEqual([{ resumed: true }]);
    expect(replays.every((r) => r.checkpoint === standing)).toBe(true);
    // The counter of steps the engine ran: the beats after the last
    // checkpoint, against the search and the replay of the whole scene.
    expect(after.steps).toBeGreaterThan(0);
    expect(after.steps).toBeLessThan(first.steps / 4);
    expectSameAnswer(after.round, fromTheTop(after.round));
  });

  // Round 1 of the review of #1618 (report 6026971997): a search that keeps
  // to its scene asks whether the story has left it by the addresses it will
  // come back to, which left out a suspended thread's frames, so a fork's
  // tunnel onward out of the scene looked like leaving it for good.
  test("a route through a fork's tunnel onward comes back to its scene", () => {
    const lines = [
      "-> A",
      "",
      "scene A",
      "  Before the tunnel.",
      "  -> B ->",
      "  After the tunnel.",
      "  done",
      "end",
      "",
      "scene B",
      "  In B.",
      "  <- C",
      "  ->->",
      "end",
      "",
      "scene C",
      "  In C.",
      "  ->-> D",
      "end",
      "",
      "scene D",
      "  In D.",
      "  done",
      "end",
      "",
    ];
    const session = new Session(lines.join("\n"), PROGRAM);
    const round = session.compile(lines.indexOf("  After the tunnel."));
    expect(round.simulation).toBe("success");
    expect(round.searchSteps).toBeGreaterThan(0);
    expectSameAnswer(round, fromTheTop(round));
  });

  // A scene with nothing of its own before its first branch enters that
  // branch, by the scene's start binding, not by any statement's code. A
  // branch inserted above the first one changes where the scene starts while
  // every chunk the route ran stays, so a route that entered the old first
  // branch keeps none of its steps (round 1 of the review of #1618).
  for (const where of ["the scene's start", "a tunnel into the scene"]) {
    test(`a branch inserted above a scene's first branch keeps none of a route that entered it (${where})`, () => {
      const tunnel = where === "a tunnel into the scene";
      const lines = [
        "store score = 0",
        "",
        tunnel ? "-> LEAD" : "-> MAIN",
        "",
        ...(tunnel
          ? [
              "scene LEAD",
              ...Array.from({ length: 4 }, (_, i) => `  Lead ${i}.`),
              "  -> MAIN ->",
              ...Array.from({ length: 4 }, (_, i) => `  After ${i}, score {score}.`),
              "end",
              "",
            ]
          : []),
        "scene MAIN",
        "  branch first",
        ...Array.from({ length: 30 }, (_, i) => `    Beat ${i} of the branch, score {score}.`),
        ...(tunnel ? ["    ->->"] : []),
        "  end",
        "end",
        "",
      ];
      const text = lines.join("\n");
      const target = tunnel
        ? lines.indexOf("  After 2, score {score}.")
        : lines.indexOf("    Beat 25 of the branch, score {score}.");
      const session = new Session(text, PROGRAM);
      const first = session.compile(target);
      expect(first.simulation).toBe("success");
      const route = session.game!.plannedRoute!;
      expect(deepestCheckpoint(route)).toBeGreaterThan(0);
      // The route's first step in the branch: the steps before it ran in
      // flows the edit leaves alone.
      const branchLine = lines.indexOf("  branch first");
      const entered = route.steps.findIndex(
        (s) => (session.game!.locator.locationOf(s.address)?.startLine ?? -1) > branchLine,
      );
      expect(entered).toBeGreaterThanOrEqual(0);
      if (tunnel) {
        expect(entered).toBeGreaterThan(0);
      }

      session.edit(
        "  branch first",
        "  branch prologue\n    & score = score + 1\n    -> MAIN.first\n  end\n  branch first",
      );
      // The tunnel's target stands above the edit, and the branch's below it.
      const after = session.compile(tunnel ? target : target + 4);

      expect(after.simulation).toBe("success");
      expect(after.changes?.chunks?.initializers).toBe(false);
      // The prologue ran, as it does in a fresh game.
      expect(session.game!.story.variablesState.$("score")).toBe(1);
      expectSameAnswer(after, fromTheTop(after));
      expect(after.resumption.validSteps).toBeLessThanOrEqual(entered);
    });
  }

  test("a line added at the bottom of the scene searches on from the last checkpoint", () => {
    const { text, at } = screenplay();
    const session = new Session(text, PROGRAM);
    const first = session.compile(at["tail_7"]!);
    expect(first.searchSteps).toBeGreaterThan(20);

    const searches = watchSearches();
    session.edit(
      "  Beat 7 of the long tail.",
      "  Beat 7 of the long tail.\n  One more beat entirely.",
    );
    const after = session.compile(at["tail_7"]! + 1);

    expect(after.simulation).toBe("success");
    expect(after.resumption.stepIndex).toBeGreaterThan(0);
    expect(searches).toEqual([{ resumed: true }]);
    expect(after.searchSteps).toBeLessThan(first.searchSteps / 4);
    expectSameAnswer(after, fromTheTop(after));
  });

  test("a statement inserted above the route's last checkpoint resumes from none captured after it", () => {
    const { text, at } = screenplay();
    const session = new Session(text, PROGRAM);
    const target = at["tail_6"]!;
    session.compile(target);
    const route = session.game!.plannedRoute!;
    const before = session.game!.programStory!.root;
    // The steps that ran before the inserted line's place: those of the
    // statements up to `Beat 2 of the first act`, whose chunk stays. The
    // checkpoint taken at that beat's newline, which the first step after it
    // carries, holds the state the inserted line runs on; any later one
    // holds a state that ran past where the line now stands.
    const beat = Math.floor(before.addressAt(URI, at["one_2"]!)! / 2 ** 21);
    const lastOfBeat = route.steps.findLastIndex(
      (s) => Math.floor((s.address as number) / 2 ** 21) === beat,
    );
    expect(lastOfBeat).toBeGreaterThan(0);
    const allowed = Math.max(
      -1,
      ...route.steps.slice(0, lastOfBeat + 2).map((s) => s.checkpoint ?? -1),
    );
    expect(allowed).toBeLessThan(deepestCheckpoint(route));

    const replays = watchReplays();
    session.edit(
      "  Beat 2 of the first act.",
      "  Beat 2 of the first act.\n  An aside nobody saw coming.",
    );
    const after = session.compile(target + 1);

    expect(after.resumption.validSteps).toBeGreaterThan(0);
    expect(after.resumption.validSteps).toBeLessThan(route.steps.length);
    for (const replay of replays) {
      expect(replay.checkpoint).toBeLessThanOrEqual(allowed);
    }
    expectSameAnswer(after, fromTheTop(after));
  });

  test("a preview compile reuses the route, and leaves the real program's next route able to resume", () => {
    const { text, at } = screenplay();
    const session = new Session(text, PROGRAM);
    const target = at["tail_7"]!;
    session.compile(target);

    // A suggestion on a beat above the target: the target's statement is
    // kept, and the route searches on from the last checkpoint before the
    // suggested beat. (The searches are read before the comparison, whose
    // own search from the top the spy counts too.)
    const searches = watchSearches();
    const preview = session.preview(
      "Beat 6 of the long tail.",
      "Beat 6 of the long tail, suggested.",
      target,
    );
    expect(preview.resumption.stepIndex).toBeGreaterThan(0);
    expect(searches).toEqual([{ resumed: true }]);
    expectSameAnswer(preview, fromTheTop(preview));

    // A suggestion on the target's own beat emits its statement again, and
    // its address with it: the search goes on from the last checkpoint.
    searches.length = 0;
    const onTarget = session.preview(
      "Beat 7 of the long tail.",
      "Beat 7 of the long tail, suggested.",
      target,
    );
    expect(onTarget.resumption.stepIndex).toBeGreaterThan(0);
    expect(searches).toEqual([{ resumed: true }]);
    expectSameAnswer(onTarget, fromTheTop(onTarget));

    // The real program after the suggestions resumes the route the last
    // suggestion left, whose kept steps are the real program's too.
    searches.length = 0;
    const after = session.compile(target);
    expect(after.resumption.stepIndex).toBeGreaterThan(0);
    expect(searches.every((s) => s.resumed)).toBe(true);
    expectSameAnswer(after, fromTheTop(after));
  });

  test("randomized edit sequences, with preview compiles between them, never answer differently from a search of the whole scene", () => {
    const { text, at } = screenplay();
    const session = new Session(text, PROGRAM);
    const targets = ["tail_1", "tail_4", "tail_7", "doorOpen", "one_5"].map(
      (mark) => at[mark]!,
    );
    let target = targets[2]!;
    session.compile(target);

    const next = rng(20261006);
    const rounds: string[] = [];
    const seen = new Set<string>();
    let resumed = 0;
    let fromTop = 0;
    let touched = false;
    for (let i = 0; i < 32; i += 1) {
      // One round in the sequence always touches a global, which no checkpoint
      // survives, so the sequence searches from the top at least once.
      const rolled = next();
      const roll = i === 9 ? 0.95 : rolled;
      const beat = Math.floor(next() * 8);
      const suffix = ` (${i})`;
      let round: CompiledRound;
      let label: string;
      if (roll < 0.15) {
        target = targets[Math.floor(next() * targets.length)]!;
        label = "move";
        round = session.compile(target);
      } else if (roll < 0.35) {
        const find = `Beat ${beat} of the long tail.`;
        label = "preview";
        round = session.preview(find, `${find}${suffix}`, target);
      } else if (roll < 0.5) {
        const find = `Beat ${beat} of the long tail.`;
        label = "edit tail";
        session.edit(find, `${find}${suffix}`);
        round = session.compile(target);
      } else if (roll < 0.62) {
        const find = `Beat ${beat} of the first act.`;
        label = "edit first act";
        session.edit(find, `${find}${suffix}`);
        round = session.compile(target);
      } else if (roll < 0.7) {
        const find = `Beat ${beat} of the second act.`;
        label = "edit second act";
        session.edit(find, `${find}${suffix}`);
        round = session.compile(target);
      } else if (roll < 0.8) {
        // A line inserted between two statements the route runs through,
        // whose chunks both stay.
        const find = `  Beat ${beat} of the first act.`;
        label = "insert in the first act";
        session.edit(find, `${find}\n  An aside${suffix}.`);
        round = session.compile(target);
      } else if (roll < 0.9) {
        const find = "  Beat 7 of the long tail.";
        label = "insert after the tail";
        session.edit(find, `${find}\n  Added beat${suffix}.`);
        round = session.compile(target);
      } else {
        // An initializer written another way, to the same value, which every
        // checkpoint's globals embed: it emits the declarations again.
        label = "touch a global";
        const [from, to] = touched
          ? ["store trust = 0 + 0", "store trust = 0"]
          : ["store trust = 0", "store trust = 0 + 0"];
        touched = !touched;
        session.edit(from, to);
        round = session.compile(target);
      }
      rounds.push(label);
      seen.add(label);
      if (round.resumption.stepIndex != null) {
        resumed += 1;
      } else {
        fromTop += 1;
      }
      expectSameAnswer(round, fromTheTop(round), rounds.join(" | "));
    }
    // A sequence that never reused a route, or never had to search from the
    // top, or never made the edits it exists for, would prove nothing.
    expect(resumed).toBeGreaterThan(0);
    expect(fromTop).toBeGreaterThan(0);
    expect(seen).toContain("preview");
    expect(seen).toContain("insert in the first act");
    expect(seen).toContain("touch a global");
  });
});

describe("on the program engine, a compile that edits an initializer", () => {
  // The globals and a function one of their initializers calls, written
  // above the scene, so that every checkpoint stands below them, or below
  // the scene, so that every checkpoint stands above them. The scene reads
  // both globals, so a checkpoint taken before the edit holds the values the
  // old initializers computed.
  const DECLARATIONS = [
    "store trust = 0",
    "store bonus = boost(2)",
    "",
    "function boost(n)",
    "  return n + 1",
    "end",
    "",
  ];
  const SCENE = [
    "-> act_one",
    "",
    "scene act_one",
    ...Array.from({ length: 6 }, (_, i) => `  Beat ${i} of the first act.`),
    "  & trust = trust + bonus",
    "  Trust is {trust} and the bonus {bonus}.",
    ...Array.from({ length: 6 }, (_, i) => `  Beat ${i} of the long tail.`),
    "end",
    "",
  ];
  const layouts = {
    "declarations above the checkpoints": [...DECLARATIONS, ...SCENE],
    "declarations below the checkpoints": [...SCENE, ...DECLARATIONS],
  };
  const EDITS = [
    { name: "a global's initializer", find: "store trust = 0", replace: "store trust = 10" },
    { name: "the body of a function an initializer calls", find: "  return n + 1", replace: "  return n + 5" },
  ];
  for (const [layout, lines] of Object.entries(layouts)) {
    for (const edit of EDITS) {
      test(`resumes no checkpoint and replays from the top (${edit.name}, ${layout})`, () => {
        const text = lines.join("\n");
        const target = lines.indexOf("  Beat 4 of the long tail.");
        const session = new Session(text, PROGRAM);
        const first = session.compile(target);
        expect(first.simulation).toBe("success");
        const route = session.game!.plannedRoute!;
        expect(deepestCheckpoint(route)).toBeGreaterThan(0);
        const declarationLine = lines.indexOf(edit.find);
        const checkpointLines = route.steps
          .filter((s) => s.checkpoint != null)
          .map((s) => session.game!.locator.locationOf(s.address)?.startLine ?? -1);
        // Where the checkpoints stand against the edited declaration.
        if (layout.startsWith("declarations above")) {
          expect(checkpointLines.every((l) => l > declarationLine)).toBe(true);
        } else {
          expect(checkpointLines.every((l) => l < declarationLine)).toBe(true);
        }
        const before = session.game!.programStory!.root;

        const replays = watchReplays();
        session.edit(edit.find, edit.replace);
        const after = session.compile(target);

        // No chunk of a flow was emitted again: only the declaration's or
        // the function's.
        const chunks = after.changes?.chunks;
        expect(chunks?.initializers).toBe(true);
        const root = after.program.chunks!;
        for (const id of chunks!.emitted) {
          const at = root.position(id)!;
          const flow = root.flowAt(id * 2 ** 21)!;
          expect(
            flow.flow < 0 || flow.kind === SymbolKind.Function,
            `chunk ${id} at entry ${at.entry} is a declaration's or a function's`,
          ).toBe(true);
        }
        expect(root).not.toBe(before);
        expect(after.resumption.validSteps).toBe(0);
        expect(after.resumption.stepIndex).toBeUndefined();
        for (const replay of replays) {
          expect(replay).toEqual({ fromStep: 0, checkpoint: -1 });
        }
        expect(after.simulation).toBe("success");
        // The final variable values are a fresh game's: the checkpoint the
        // route ends at holds the new initializers' values.
        const expected = edit.name.startsWith("a global's")
          ? { trust: 13, bonus: 3 }
          : { trust: 7, bonus: 7 };
        const variables = session.game!.story.variablesState;
        expect({
          trust: variables.$("trust"),
          bonus: variables.$("bonus"),
        }).toEqual(expected);
        expectSameAnswer(after, fromTheTop(after));
      });
    }
  }
});
