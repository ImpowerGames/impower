import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import {
  paramKey,
  type StartingValues,
} from "@impower/sparkdown/src/program/startingValueLiterals";
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

const UNREACHED = `scene start
  Top.
end

scene s(a)
  First {a}.
end
`;

const harnessAt = async (
  source: string,
  line: number,
  values: StartingValues | undefined,
  manualClock = false,
) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: source }],
    startFrom: { file: MAIN_URI, line },
    manualClock,
  });
  await h.compile();
  if (values) {
    await (h.controller as any).applyStartingValues(values);
  }
  await h.select(line);
  await settle(40);
  return h;
};

const playFrom = async (source: string, line: number, values?: StartingValues) => {
  const h = await harnessAt(source, line, values, true);
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  try {
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

const previewAt = async (source: string, line: number, values?: StartingValues) => {
  const h = await harnessAt(source, line, values);
  try {
    return writtenText(h.toRouter);
  } finally {
    h.dispose();
  }
};

const A_IS_10 = { s: { [paramKey("a")]: "10" } };

describe("PLAY inside a scene a divert enters with arguments", () => {
  it.each([
    ["the scene's first line", ONE, 5, undefined, "First nil."],
    ["the scene's first line, with a set", ONE, 5, A_IS_10, "First 10."],
    ["the scene's second line, with a set", ONE, 6, A_IS_10, "Second 10."],
    ["a line that reads two parameters", TWO, 7, A_IS_10, "First 10 10."],
  ])("from %s, starts at the scene's top with its starting values", async (_name, source, line, values, shown) => {
    const outcome = await playFrom(source, line, values);
    expect(outcome.started).toBe(true);
    expect(outcome.exited).toEqual([]);
    expect(outcome.state).toBe("running");
    expect(outcome.text).toContain(shown);
    expect(outcome.saved).toBe(true);
    expect(outcome.session).toBeDefined();
  }, 120_000);

  it("from the divert in the start scene, runs with the divert's arguments", async () => {
    const outcome = await playFrom(ONE, 1);
    expect(outcome.started).toBe(true);
    expect(outcome.state).toBe("running");
    expect(outcome.text).toContain("First 10.");
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
    [ONE, 5, undefined, "First nil."],
    [ONE, 5, A_IS_10, "First 10."],
    [ONE, 6, A_IS_10, "Second 10."],
    [TWO, 7, undefined, "First nil nil."],
  ])("at line %#, shows the scene's starting values", async (source, line, values, shown) => {
    const text = await previewAt(source, line, values);
    expect(text).toContain(shown);
  }, 120_000);
});

const DEEP = `scene start
${Array.from({ length: 40 }, (_, i) => `  Top ${i}.`).join("\n")}
  -> s(10)
end

scene s(a)
  Target {a}.
end
`;

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

describe("the route to a line inside a scene that takes parameters", () => {
  it("starts at the scene's top, in the worker's search and in PLAY", () => {
    const { game, to } = gameAt(DEEP, 45);
    const planned = vi.spyOn(Game, "planRoute");
    try {
      game.simulate();
      expect(game.simulation).toBe("success");
      expect(game.plannedRoute?.from).toBe("s");
      const log = new RouteSearchLog();
      const worker = gameAt(DEEP, 45).game;
      searchRouteFor(worker, to, log, {});
      expect(log.outcomeFor(to)?.reachedTarget).toBe(true);
      expect(worker.plannedRoute?.from).toBe("s");
      expect(planned.mock.calls.map((call) => call[2])).toEqual(["s", "s"]);
    } finally {
      planned.mockRestore();
    }
  }, 120_000);

  it("starts at the scene's top again after a compile that changes nothing", () => {
    const { compiler, game, to } = gameAt(DEEP, 45);
    const log = new RouteSearchLog();
    searchRouteFor(game, to, log, {});
    expect(log.outcomeFor(to)?.reachedTarget).toBe(true);
    game.updateProgram(
      compiler.compile({ textDocument: { uri: MAIN_URI } } as never).program,
    );
    const spy = vi.spyOn(Game, "planRoute");
    try {
      searchRouteFor(game, to, log, {});
      expect(spy.mock.calls.map((call) => call[2])).not.toContain("start");
      expect(log.outcomeFor(to)?.reachedTarget).toBe(true);
      expect(game.plannedRoute?.from).toBe("s");
    } finally {
      spy.mockRestore();
    }
  }, 120_000);
});

const DOTTED = readFileSync(
  join(
    process.cwd(),
    "..",
    "sparkdown/src/tests/runtime/fixtures/diverts/dotted-divert-targets-with-arguments.sd",
  ),
  "utf8",
).replace(/\r\n/g, "\n");

describe("a line in a branch only a divert from elsewhere enters", () => {
  it("starts at the branch's top in the worker's search", () => {
    const { game, to } = gameAt(DOTTED, 5);
    const log = new RouteSearchLog();
    searchRouteFor(game, to, log, {});
    expect(log.outcomeFor(to)?.reachedTarget).toBe(true);
    expect(game.plannedRoute?.from).toBe("outer.inner");
    expect(log.outcomeFor(to)?.route?.valuesStart).toBe("outer.inner");
  }, 120_000);

  it.each([
    [undefined, "Inner nil."],
    [{ "outer.inner": { [paramKey("a")]: "5" } }, "Inner 5."],
  ])("previews with the branch's own starting values (%j)", async (values, shown) => {
    const text = await previewAt(DOTTED, 5, values);
    expect(text).toContain(shown);
  }, 120_000);

  it("previews a tunnel's return with nothing to return to as the route's end", () => {
    const { game, to } = gameAt(DOTTED, 13);
    const log = new RouteSearchLog();
    searchRouteFor(game, to, log, {});
    expect(log.outcomeFor(to)?.reachedTarget).toBe(true);
    expect(log.outcomeFor(to)?.route?.tunnelEnds).toBe(true);
    expect(log.outcomeFor(to)?.errors ?? []).toEqual([]);
  }, 120_000);

  it.each([
    [5, "Inner nil."],
    [13, "Visit nil nil."],
  ])("PLAY from line %i starts at the branch's top", async (line, shown) => {
    const outcome = await playFrom(DOTTED, line);
    expect(outcome.started).toBe(true);
    expect(outcome.exited).toEqual([]);
    expect(outcome.text).toContain(shown);
  }, 120_000);
});