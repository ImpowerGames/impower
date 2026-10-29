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
};

type Marks = Record<string, number>;

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

interface RouteOutcome {
  to: ProgramAddress | null | undefined;
  checkpoint: string | undefined;
  simulation: string | undefined;
  searchSteps: number;
  stepAddresses: ProgramAddress[];
  resumedAfter?: number;
}

interface CompiledRound extends RouteOutcome {
  program: SparkProgram;
  startFrom: { file: string; line: number };
  changes: SparkProgram["changes"];
  resumption: ReturnType<Game["routeResumption"]>;
}

class Session {
  readonly compiler = new SparkdownCompiler();
  readonly log = new RouteSearchLog();
  game?: Game;
  text: string;
  readonly kept: SparkProgram[] = [];
  version = 1;
  last?: CompiledRound;

  readonly withoutChangeSummary: boolean;

  constructor(
    text: string,
    {
      withoutChangeSummary = false,
    }: {
      withoutChangeSummary?: boolean;
    } = {},
  ) {
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
      this.route(params.program, true);
    });
    this.compiler.addEventListener("compiler/didPreviewCompile", (params) => {
      this.route(params.program, false);
    });
  }

  protected route(program: SparkProgram, real: boolean) {
    if (this.withoutChangeSummary) {
      delete program.changes;
    }
    this.kept.push(program);
    if (!this.game) {
      this.game = new Game({
        program,
        ...GAME_OPTIONS,
      } as never);
    } else {
      this.game.updateProgram(program);
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
    lastSearchStats.stepsUsed = -1;
    const log = real ? this.log : new RouteSearchLog();
    const checkpoint = searchRouteTo(this.game, to, log, {});
    this.last = {
      program,
      startFrom,
      changes: program.changes,
      resumption,
      to,
      checkpoint,
      simulation: this.game.simulation,
      searchSteps: lastSearchStats.stepsUsed,
      resumedAfter: resumption.resumeFrom?.steps.length,
      ...walked(this.game),
    };
  }

  protected displayEarlierProgram() {
    const shown = this.kept.at(-2);
    if (!shown || !this.game) {
      return;
    }
    this.game.updateProgram(shown);
  }

  compile(line: number): CompiledRound {
    this.displayEarlierProgram();
    quiet(() =>
      this.compiler.compile({
        textDocument: { uri: URI },
        startFrom: { file: URI, line },
      }),
    );
    return this.last!;
  }

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

  preview(find: string, replace: string, line: number): CompiledRound {
    const applied = change(this.text, find, replace);
    this.displayEarlierProgram();
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

function fromTheTop(round: CompiledRound): RouteOutcome {
  const game = new Game({
    program: round.program,
    ...GAME_OPTIONS,
  } as never);
  game.setStartFrom(round.startFrom);
  const to = game.startAddress;
  const log = new RouteSearchLog();
  const checkpoint =
    to != null
      ? searchRouteTo(game, to, log, {})
      : undefined;
  return {
    to,
    checkpoint,
    simulation: game.simulation,
    searchSteps: lastSearchStats.stepsUsed,
    ...walked(game),
  };
}

function walked(game: Game) {
  return {
    stepAddresses: (game.plannedRoute?.steps ?? []).map((s) => s.address),
  };
}

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
    const beats = (story as Record<string, unknown>)["beats"];
    for (const beat of Array.isArray(beats) ? beats : []) {
      if (beat && typeof beat === "object") delete beat["storySeed"];
    }
  }
  const runtime = reparse(save.runtime);
  if (runtime && typeof runtime === "object") {
    delete (runtime as Record<string, unknown>)["pathsExecutedThisFrame"];
  }
  return JSON.stringify({ ...save, story, runtime });
};

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

function watchSearches() {
  const calls: { resumed: boolean }[] = [];
  const planRoute = Game.planRoute.bind(Game);
  vi.spyOn(Game, "planRoute").mockImplementation(((...args: unknown[]) => {
    const budget = args[4] as { resumeFrom?: unknown } | undefined;
    calls.push({ resumed: budget?.resumeFrom != null });
    return planRoute(...(args as Parameters<typeof Game.planRoute>));
  }) as never);
  return calls;
}

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

const deepestCheckpoint = (route: RoutePlan) =>
  Math.max(-1, ...route.steps.map((s) => s.checkpoint ?? -1));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the comparison the rest of these tests rest on", () => {
  const save = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      modules: { ui: { images: ["a"] } },
      context: {},
      story: JSON.stringify({ variablesState: { trust: 0 }, storySeed: 41 }),
      runtime: JSON.stringify({
        pathsExecutedThisFrame: [0],
        choicesEncountered: [],
        conditionsEncountered: [{ selected: true }],
      }),
      ...over,
    });
  const outcome = (over: Partial<RouteOutcome> = {}): RouteOutcome => ({
    to: 9,
    checkpoint: save(),
    simulation: "success",
    searchSteps: 0,
    stepAddresses: [1, 2, 3],
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
        pathsExecutedThisFrame: [0],
        choicesEncountered: [],
        conditionsEncountered: [{ selected: false }],
      }),
    });
    expect(differs({ checkpoint: other })).toThrow();
  });

  test("rejects a position the route never visited", () => {
    expect(differs({ stepAddresses: [1, 2, 4] })).toThrow();
  });

  test("rejects a route that holds a run of steps once where the other holds it twice", () => {
    expect(() =>
      expectSameAnswer(
        outcome({ stepAddresses: [1, 2, 3], resumedAfter: 1 }),
        outcome({ stepAddresses: [1, 2, 1, 2, 3] }),
      ),
    ).toThrow();
  });

  test("rejects a route that skipped steps", () => {
    expect(() =>
      expectSameAnswer(outcome({ stepAddresses: [1, 4] }), outcome({ stepAddresses: [1, 2, 3, 4] })),
    ).toThrow();
  });
});

describe("a compile whose edit is below the route's last checkpoint", () => {
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
    const allowed = Math.max(
      -1,
      ...route.steps
        .filter(
          (s) =>
            (session.game!.locator.locationOf(s.address)?.startLine ?? Infinity) <
            changedLine,
        )
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
        target = targets[Math.floor(next() * targets.length)]!;
        round = session.compile(target);
        rounds.push(`move to ${target}`);
      } else if (roll < 0.4) {
        const find = `Beat ${beat} of the long tail.`;
        round = session.preview(find, `${find}${suffix}`, target);
        rounds.push(`preview ${find}`);
      } else if (roll < 0.6) {
        const find = `Beat ${beat} of the long tail.`;
        session.edit(find, `${find}${suffix}`);
        round = session.compile(target);
        rounds.push(`edit tail ${beat}`);
      } else if (roll < 0.75) {
        const find = `Beat ${beat} of the first act.`;
        session.edit(find, `${find}${suffix}`);
        round = session.compile(target);
        rounds.push(`edit first act ${beat}`);
      } else if (roll < 0.85) {
        const find = `Beat ${beat} of the second act.`;
        session.edit(find, `${find}${suffix}`);
        round = session.compile(target);
        rounds.push(`edit second act ${beat}`);
      } else if (roll < 0.95) {
        const find = "  Beat 7 of the long tail.";
        session.edit(find, `${find}\n  Added beat${suffix}.`);
        round = session.compile(target);
        rounds.push(`insert after the tail`);
      } else {
        session.edit("store trust = ", `store trust =  `);
        round = session.compile(target);
        rounds.push(`touch a global`);
      }
      expectSameAnswer(round, fromTheTop(round), rounds.join(" | "));
    }
  });
});

const stepsRun = (_session: Session, run: () => CompiledRound) => {
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
    const session = new Session(text);
    const round = session.compile(at["tail_6"]!);
    expect(round.simulation).toBe("success");
    expect(typeof round.to).toBe("number");
    expect(round.stepAddresses.length).toBeGreaterThan(20);
    expect(round.stepAddresses.every((a) => typeof a === "number")).toBe(true);
    expect(round.changes?.chunks).toBeDefined();
    expect(session.game!.programStory).not.toBeNull();
  });

  test("an edit to a display beat below every checkpoint resumes the last one, and runs only the steps after it", () => {
    const { text, at } = screenplay();
    const session = new Session(text);
    const target = at["tail_6"]!;
    const first = stepsRun(session, () => session.compile(target));
    const route = session.game!.plannedRoute!;
    const deepest = deepestCheckpoint(route);
    expect(deepest).toBeGreaterThanOrEqual(0);
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
    expect(after.steps).toBeGreaterThan(0);
    expect(after.steps).toBeLessThan(first.steps / 4);
    expectSameAnswer(after.round, fromTheTop(after.round));
  });

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
    const session = new Session(lines.join("\n"));
    const round = session.compile(lines.indexOf("  After the tunnel."));
    expect(round.simulation).toBe("success");
    expect(round.searchSteps).toBeGreaterThan(0);
    expectSameAnswer(round, fromTheTop(round));
  });

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
      const session = new Session(text);
      const first = session.compile(target);
      expect(first.simulation).toBe("success");
      const route = session.game!.plannedRoute!;
      expect(deepestCheckpoint(route)).toBeGreaterThan(0);
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
      const after = session.compile(tunnel ? target : target + 4);

      expect(after.simulation).toBe("success");
      expect(after.changes?.chunks?.initializers).toBe(false);
      expect(session.game!.story.variablesState.$("score")).toBe(1);
      expectSameAnswer(after, fromTheTop(after));
      expect(after.resumption.validSteps).toBeLessThanOrEqual(entered);
    });
  }

  test("a line added at the bottom of the scene searches on from the last checkpoint", () => {
    const { text, at } = screenplay();
    const session = new Session(text);
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
    const session = new Session(text);
    const target = at["tail_6"]!;
    session.compile(target);
    const route = session.game!.plannedRoute!;
    const before = session.game!.programStory!.root;
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
    const session = new Session(text);
    const target = at["tail_7"]!;
    session.compile(target);

    const searches = watchSearches();
    const preview = session.preview(
      "Beat 6 of the long tail.",
      "Beat 6 of the long tail, suggested.",
      target,
    );
    expect(preview.resumption.stepIndex).toBeGreaterThan(0);
    expect(searches).toEqual([{ resumed: true }]);
    expectSameAnswer(preview, fromTheTop(preview));

    searches.length = 0;
    const onTarget = session.preview(
      "Beat 7 of the long tail.",
      "Beat 7 of the long tail, suggested.",
      target,
    );
    expect(onTarget.resumption.stepIndex).toBeGreaterThan(0);
    expect(searches).toEqual([{ resumed: true }]);
    expectSameAnswer(onTarget, fromTheTop(onTarget));

    searches.length = 0;
    const after = session.compile(target);
    expect(after.resumption.stepIndex).toBeGreaterThan(0);
    expect(searches.every((s) => s.resumed)).toBe(true);
    expectSameAnswer(after, fromTheTop(after));
  });

  test("randomized edit sequences, with preview compiles between them, never answer differently from a search of the whole scene", () => {
    const { text, at } = screenplay();
    const session = new Session(text);
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
    expect(resumed).toBeGreaterThan(0);
    expect(fromTop).toBeGreaterThan(0);
    expect(seen).toContain("preview");
    expect(seen).toContain("insert in the first act");
    expect(seen).toContain("touch a global");
  });
});

describe("on the program engine, a compile that edits an initializer", () => {
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
        const session = new Session(text);
        const first = session.compile(target);
        expect(first.simulation).toBe("success");
        const route = session.game!.plannedRoute!;
        expect(deepestCheckpoint(route)).toBeGreaterThan(0);
        const declarationLine = lines.indexOf(edit.find);
        const checkpointLines = route.steps
          .filter((s) => s.checkpoint != null)
          .map((s) => session.game!.locator.locationOf(s.address)?.startLine ?? -1);
        if (layout.startsWith("declarations above")) {
          expect(checkpointLines.every((l) => l > declarationLine)).toBe(true);
        } else {
          expect(checkpointLines.every((l) => l < declarationLine)).toBe(true);
        }
        const before = session.game!.programStory!.root;

        const replays = watchReplays();
        session.edit(edit.find, edit.replace);
        const after = session.compile(target);

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
