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
  toPath: string | null | undefined;
  checkpoint: string | undefined;
  simulation: string | undefined;
  /** Story advances the search that produced this outcome spent, or -1 when no
   *  search ran at all. */
  searchSteps: number;
  /** Paths the resulting route runs through, in order. */
  stepPaths: string[];
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
}

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
  version = 1;
  last?: CompiledRound;

  /** Withhold the compiler's account of what it changed, which is what every
   *  reuse here rests on. A session driven this way behaves as the player did
   *  before there was one: it searches the scene on every compile. */
  readonly withoutChangeSummary: boolean;

  constructor(text: string, withoutChangeSummary = false) {
    this.text = text;
    this.withoutChangeSummary = withoutChangeSummary;
    this.compiler.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
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
    if (!this.game) {
      this.game = new Game({ program, story, ...GAME_OPTIONS } as never);
    } else {
      this.game.updateProgram(program, story as never);
    }
    const startFrom = program.startFrom;
    this.last = undefined;
    if (!startFrom) {
      return;
    }
    this.game.setStartFrom(startFrom);
    const toPath = this.game.startPath;
    if (!toPath) {
      return;
    }
    const resumption = this.game.routeResumption(
      Game.getSimulateFromPath(toPath),
      toPath,
    );
    const options = structuredClone(this.config.simulationOptions ?? {});
    // -1 means nothing overwrote it, so no search ran.
    lastSearchStats.stepsUsed = -1;
    const log = remember ? this.log : new RouteSearchLog();
    const checkpoint = searchRouteTo(this.game, toPath, log, {
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
      toPath,
      checkpoint,
      simulation: this.game.simulation,
      searchSteps: lastSearchStats.stepsUsed,
      stepPaths: (this.game.plannedRoute?.steps ?? []).map((s) => s.path),
    };
  }

  /** Compile the real documents and route to `line`, as a saved edit does. */
  compile(line: number): CompiledRound {
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
  const game = new Game({
    program: round.program,
    story: round.story,
    ...GAME_OPTIONS,
  } as never);
  game.setStartFrom(round.startFrom);
  const toPath = game.startPath;
  const log = new RouteSearchLog();
  const checkpoint = toPath
    ? searchRouteTo(game, toPath, log, {
        config: { simulationOptions: structuredClone(round.options) as never },
      })
    : undefined;
  return {
    toPath,
    checkpoint,
    simulation: game.simulation,
    searchSteps: lastSearchStats.stepsUsed,
    stepPaths: (game.plannedRoute?.steps ?? []).map((s) => s.path),
  };
}

/**
 * The story a checkpoint restores: variables, callstack, visit counts, turn
 * indices — everything the Game Preview shows, and everything a later beat runs
 * on.
 *
 * Two things are left out. The random seed, because every story state picks one
 * from the clock when it is created and it is the one field of a checkpoint that
 * says nothing about the route. And the game's own record of which paths have
 * executed, because a replay resumed from a checkpoint never re-records the
 * paths that checkpoint already covers — which is how the replay has always
 * worked, shortcut or no shortcut, and is not something a route resumed from the
 * same checkpoint could put back.
 */
const restoredStory = (checkpoint: string | undefined) => {
  if (!checkpoint) {
    return "";
  }
  const story = String(JSON.parse(checkpoint).story ?? "");
  return story.replace(/storySeed":\s*\d+/g, 'storySeed":0');
};

/**
 * Assert two routes are the same answer, reporting the first place they are
 * not.
 *
 * A route holds thousands of steps and a checkpoint is a whole serialized
 * story, so comparing them as values gives a failure nobody can read. What is
 * compared instead is the first bytes of the restored story that differ, then
 * the first step, then the verdict, each with its neighbours.
 *
 * The step lists are compared as the same walk rather than as the same list.
 * The engine looks one line ahead at every beat and rewinds, and a search that
 * sees that happen records the positions twice; a search resumed from a
 * checkpoint taken after the rewind cannot see it and records them once. So a
 * resumed plan is allowed to be missing repeats, and nothing else: it must
 * visit the same positions, in the same order, and no others.
 */
function expectSameAnswer(
  actual: RouteOutcome,
  expected: RouteOutcome,
  note = "",
) {
  const a = restoredStory(actual.checkpoint);
  const b = restoredStory(expected.checkpoint);
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
  while (step < actual.stepPaths.length && against < expected.stepPaths.length) {
    if (actual.stepPaths[step] === expected.stepPaths[against]) {
      step += 1;
      against += 1;
      continue;
    }
    // A position the resumed plan did not record a second time. The one it
    // skips has to be one it has just been at, or it is a different walk.
    if (expected.stepPaths[against] === expected.stepPaths[against - 1]) {
      against += 1;
      continue;
    }
    if (
      against > 0 &&
      expected.stepPaths.slice(0, against).includes(expected.stepPaths[against]!)
    ) {
      against += 1;
      continue;
    }
    break;
  }
  expect(
    step === actual.stepPaths.length
      ? null
      : {
          step,
          against,
          counts: [actual.stepPaths.length, expected.stepPaths.length],
          actual: actual.stepPaths.slice(Math.max(0, step - 3), step + 4),
          expected: expected.stepPaths.slice(Math.max(0, against - 3), against + 4),
        },
    note,
  ).toBeNull();
  expect(
    { paths: new Set(actual.stepPaths).size },
    `${note} — the resumed plan visits the same positions`,
  ).toEqual({ paths: new Set(expected.stepPaths).size });
  const shape = (o: RouteOutcome) => ({
    toPath: o.toPath,
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
    const session = new Session(text, true);
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

describe("a change the route's own lines cannot account for", () => {
  for (const hazard of HAZARDS) {
    test(`is searched again (${hazard.name})`, () => {
      const { text, at } = screenplay();
      const session = new Session(text);
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
