// PLAY and the preview inside a scene that takes parameters (I-1608). A
// line inside the scene starts as the run that reaches it stands there, with
// the arguments the divert that enters the scene passes; a scene no run
// reaches binds nil for each parameter (#664). The story saves either way.
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, it, vi } from "vitest";
import { RouteSearchLog } from "../../main/workers/RouteSearchLog";
import { searchRouteFor } from "../../main/workers/searchRouteTo";
import { createPlayerHarness, MAIN_URI, settle, writtenText } from "./playerHarness";

const ONE = `scene start
  -> s(10)
end

scene s(a)
  First {a}.
  Second {a}.
end
`;

const TWO = `store keep = function() return 0 end
scene start
  -> s(10, 0)
end

scene s(a, b)
  & keep = function() return a end
  First {a} {keep()}.
  Second {a} {keep()}.
end
`;

// No divert enters the scene.
const UNREACHED = `scene start
  Top.
end

scene s(a)
  First {a}.
end
`;

/** PLAY `source` from `line` (zero-based) and a second of frames; answers
 *  what the run showed and whether the story it plays saves and loads. */
const playFrom = async (source: string, line: number) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: source }],
    startFrom: { file: MAIN_URI, line },
    manualClock: true,
  });
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  try {
    await h.compile();
    await h.select(line);
    await settle(40);
    const sentBefore = h.toRouter.length;
    const started = await h.controller.startGameAndApp();
    await settle(40);
    await h.tick(1000 / 60, 60);
    const story = h.playing()?.programStory;
    const save = story?.toSave();
    const session = story?.state.ToJson();
    const outcome = {
      started,
      state: h.playing()?.state,
      exited: h.toEditor
        .filter((m) => m.method === "game/exited")
        .map((m) => m.params?.reason),
      text: writtenText(h.toRouter.slice(sentBefore)),
      saved: typeof save === "string" || (save != null && typeof save === "object"),
      session: typeof session === "string" ? session : undefined,
    };
    await h.controller.destroyGameAndApp();
    return outcome;
  } finally {
    h.dispose();
  }
};

/** The text the first preview of `source` at `line` (zero-based) writes. */
const previewAt = async (source: string, line: number) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: source }],
    startFrom: { file: MAIN_URI, line },
  });
  try {
    await h.compile();
    await h.select(line);
    await settle(40);
    return writtenText(h.toRouter);
  } finally {
    h.dispose();
  }
};

describe("PLAY inside a scene a divert enters with arguments", () => {
  it.each([
    // The control: the divert's own line.
    ["the divert", ONE, 1, "First 10."],
    ["the scene's first line", ONE, 5, "First 10."],
    ["the scene's second line", ONE, 6, "Second 10."],
    ["a line that reads two parameters", TWO, 7, "First 10 10."],
    ["the next line that reads them", TWO, 8, "Second 10 10."],
  ])("from %s, runs with the divert's arguments", async (_name, source, line, shown) => {
    const outcome = await playFrom(source, line);
    expect(outcome.started).toBe(true);
    expect(outcome.exited).toEqual([]);
    expect(outcome.state).toBe("running");
    expect(outcome.text).toContain(shown);
    expect(outcome.text).not.toContain("nil");
    // The story PLAY started saves (#664, #1204).
    expect(outcome.saved).toBe(true);
    expect(outcome.session).toBeDefined();
  }, 120_000);

  it("from a scene no run reaches, binds nil and still saves", async () => {
    const outcome = await playFrom(UNREACHED, 5);
    expect(outcome.started).toBe(true);
    expect(outcome.state).toBe("running");
    expect(outcome.text).toContain("First nil.");
    expect(outcome.saved).toBe(true);
    expect(outcome.session).toBeDefined();
  }, 120_000);
});

describe("the preview inside a scene a divert enters with arguments", () => {
  it.each([
    [ONE, 5, "First 10."],
    [ONE, 6, "Second 10."],
    [TWO, 7, "First 10 10."],
  ])("at line %#, shows the divert's arguments", async (source, line, shown) => {
    const text = await previewAt(source, line);
    expect(text).toContain(shown);
    expect(text).not.toContain("nil");
  }, 120_000);

  it("after an edit adds the divert that enters the scene, shows its arguments", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: UNREACHED.replace("First {a}.", "First {a}.\n  Second {a}.") }],
      startFrom: { file: MAIN_URI, line: 6 },
    });
    try {
      await h.compile();
      await h.select(6);
      await settle(40);
      expect(writtenText(h.toRouter)).toContain("Second nil.");
      const sentBefore = h.toRouter.length;
      await h.edit([
        {
          range: { start: { line: 1, character: 2 }, end: { line: 1, character: 6 } },
          text: "-> s(10)",
        },
      ]);
      await h.compile();
      await h.select(6);
      await settle(40);
      expect(writtenText(h.toRouter.slice(sentBefore))).toContain("Second 10.");
    } finally {
      h.dispose();
    }
  }, 120_000);
});

// Forty beats before the divert: a search from the story's start limited to
// twenty steps stops before it reaches the divert.
const DEEP = `scene start
${Array.from({ length: 40 }, (_, i) => `  Top ${i}.`).join("\n")}
  -> s(10)
end

scene s(a)
  Target {a}.
end
`;

/** A game started from `line` (zero-based) of `source`, with its compiler. */
const gameAt = (source: string, line: number) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: MAIN_URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const { program } = compiler.compile({ textDocument: { uri: MAIN_URI } } as never);
  const game = new Game({
    program,
    now: () => 0,
    setTimeout: ((fn: () => void) => {
      fn();
      return 0;
    }) as never,
  } as never);
  game.setStartFrom({ file: MAIN_URI, line });
  return { compiler, game, to: game.startAddress! };
};

/** Limits every search from the story's start to twenty steps. */
const limitStartSearch = () => {
  const original = Game.planRouteFromStart.bind(Game);
  return vi
    .spyOn(Game, "planRouteFromStart")
    .mockImplementation((story, program, to, options, budget) =>
      original(story, program, to, options, { ...budget, maxSteps: 20 }),
    );
};

describe("the route to a line inside a scene that takes parameters", () => {
  it("is not the scene's own route when the search from the start is cut short", () => {
    const { game, to } = gameAt(DEEP, 45);
    const spy = limitStartSearch();
    try {
      game.simulate();
      expect(game.simulation).not.toBe("success");
      expect(game.simulationFailure).toBe("timeout");
    } finally {
      spy.mockRestore();
    }
    const log = new RouteSearchLog();
    const worker = gameAt(DEEP, 45).game;
    const limited = limitStartSearch();
    try {
      searchRouteFor(worker, to, log, { config: {} });
      expect(log.outcomeFor(to)?.reachedTarget).toBe(false);
      expect(log.outcomeFor(to)?.simulationFailure).toBe("timeout");
    } finally {
      limited.mockRestore();
    }
  }, 120_000);

  it("is replayed from the story's start after a compile that changes nothing", () => {
    const { compiler, game, to } = gameAt(DEEP, 45);
    const log = new RouteSearchLog();
    searchRouteFor(game, to, log, { config: {} });
    expect(log.outcomeFor(to)?.reachedTarget).toBe(true);
    expect(log.outcomeFor(to)?.fromStart).toBe(true);
    expect(game.plannedRoute?.from).toBe("0");
    game.updateProgram(
      compiler.compile({ textDocument: { uri: MAIN_URI } } as never).program,
    );
    const spy = vi.spyOn(Game, "planRouteFromStart");
    try {
      searchRouteFor(game, to, log, { config: {} });
      expect(spy).not.toHaveBeenCalled();
      expect(log.outcomeFor(to)?.reachedTarget).toBe(true);
    } finally {
      spy.mockRestore();
    }
  }, 120_000);
});
