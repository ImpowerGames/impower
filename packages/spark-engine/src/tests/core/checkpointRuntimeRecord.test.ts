// A checkpoint's runtime record (the executed positions, the choices and the
// conditions met) is the record the game held when it took the checkpoint
// (#1701). An ordinary continue starts the record again, so in play a
// checkpoint holds its own beat's record; a route replay (`continue(true)`)
// keeps it, so there a checkpoint holds every beat's since the replay began.
// The store keeps the record as each beat's changes, replayed from a chain's
// start; a beat that started the record again must not be replayed onto the
// beats before it.
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";

const MAIN = "file:///local/main.sd";

const SCRIPT = [
  "store n = 0",
  "",
  "-> start",
  "",
  "scene start",
  ...Array.from({ length: 10 }, (_, i) => `  Line number ${i} here.`),
  "end",
  "",
].join("\n");

// A script whose beats meet conditions and choices.
const DECISIONS = [
  "store key = false",
  "",
  "-> start",
  "",
  "scene start",
  "  You approach the door.",
  "  & key = true",
  "  if key then",
  "    The door opens.",
  "  else",
  "    The door is shut.",
  "  end",
  "  choose",
  "  + [Take the gold]",
  "    You grab the gold.",
  "  + [Leave it]",
  "    You leave it be.",
  "  end",
  "  if key then",
  "    You lock the door behind you.",
  "  end",
  "  choose",
  "  + [Rest]",
  "    You rest.",
  "  + [Run]",
  "    You run.",
  "  end",
  "  Final words.",
  "end",
  "",
].join("\n");

// The line of `scene start`, 0-based, and so the 1-based line after it. Both
// scripts open their scene on the same line.
const SCENE_LINE = SCRIPT.split("\n").indexOf("scene start");

function compile(script = SCRIPT): SparkProgram {
  const c = new SparkdownCompiler();
  c.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text: script,
        version: 1,
        languageId: "sparkdown",
      },
    ] as never,
    seedBuiltinsIntoStory: true,
  });
  return c.compile({ textDocument: { uri: MAIN } }).program;
}

function createGame(program: SparkProgram, config: Record<string, unknown>) {
  return new Game({
    now: () => 0,
    setTimeout: (handler: Function) => {
      handler();
      return 0;
    },
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program,
    startFrom: { file: MAIN, line: SCENE_LINE + 1 },
    ...config,
  } as never);
}

/** Starts a game and continues it `beats` times, with `preserve` passed to
 *  each continue, and returns the runtime record the game held right after
 *  each checkpoint it took. */
function play(game: Game, beats: number, preserve: boolean): string[] {
  const live: string[] = [];
  const checkpoint = game.checkpoint.bind(game);
  game.checkpoint = () => {
    checkpoint();
    live[game.checkpoints.length - 1] = (game as any)._runtimeState.toJSON();
  };
  game.start();
  for (let i = 0; i < beats; i += 1) {
    game.continue(preserve);
  }
  return live;
}

const executedOf = (record: string): unknown[] =>
  JSON.parse(record).pathsExecutedThisFrame;

describe("a checkpoint's runtime record", () => {
  for (const [mode, preserve] of [
    ["play", false],
    ["a route replay", true],
  ] as const) {
    it(`is the record the game held when it took the checkpoint, in ${mode}`, () => {
      // A keyframe every 4 beats, so the run crosses keyframes and deltas.
      const game = createGame(compile(), { checkpointBaseInterval: 4 });
      const live = play(game, 12, preserve);
      const store = game.checkpoints;
      expect(store.length).toBeGreaterThan(8);
      expect(store.stats.deltas).toBeGreaterThan(4);
      for (let i = 0; i < store.length; i += 1) {
        expect(live[i]).toBeDefined();
        expect({ i, record: store.imageAt(i)!.save["runtime"] }).toEqual({
          i,
          record: live[i],
        });
        // The full save holds the same positions, written durably.
        const save = JSON.parse(store.getJson(i)!);
        expect({ i, count: executedOf(save.runtime).length }).toEqual({
          i,
          count: executedOf(live[i]!).length,
        });
      }
      // A replay's record grows with every beat, so it exercises the chain.
      if (preserve) {
        const counts = live.map((r) => executedOf(r).length);
        expect(counts.at(-1)!).toBeGreaterThan(counts[1]! + 4);
      }
    });
  }

  it("is the record the game held in play, through the choices and conditions its beats met", () => {
    const game = createGame(compile(DECISIONS), { checkpointBaseInterval: 4 });
    const live: string[] = [];
    const checkpoint = game.checkpoint.bind(game);
    game.checkpoint = () => {
      checkpoint();
      live[game.checkpoints.length - 1] = (game as any)._runtimeState.toJSON();
    };
    game.start();
    for (let turn = 0; turn < 20; turn += 1) {
      if ((game as any).story.currentChoices.length > 0) {
        game.chosePathToContinue(0);
      } else {
        game.clickedToContinue();
      }
    }
    const store = game.checkpoints;
    const records = live.map((r) => JSON.parse(r));
    // The run met conditions and choices, and checkpointed beats between
    // keyframes after them.
    expect(records.some((r) => r.choicesEncountered.length > 0)).toBe(true);
    expect(records.some((r) => r.conditionsEncountered.length > 0)).toBe(true);
    expect(store.stats.deltas).toBeGreaterThan(2);
    for (let i = 0; i < store.length; i += 1) {
      expect({ i, record: store.imageAt(i)!.save["runtime"] }).toEqual({
        i,
        record: live[i],
      });
    }
  });

  it("restored in play reports the lines of that checkpoint's beat only", () => {
    const game = createGame(compile(), { checkpointBaseInterval: 100 });
    const live = play(game, 12, false);
    const executed = () =>
      JSON.stringify((game as any).executedParams().executedLines);
    // The report the game made from the record it held at checkpoint 5.
    const restoredLive = (game as any)._runtimeState;
    expect(game.restoreCheckpoint(5)).toBe(true);
    expect((game as any)._runtimeState.toJSON()).toBe(live[5]);
    const afterRestore = executed();
    // The same record loaded directly gives the report the game made then.
    (game as any)._runtimeState = (restoredLive.constructor as any).fromJSON(live[5]);
    expect(afterRestore).toBe(executed());
    const lines = JSON.parse(afterRestore)[MAIN];
    expect(lines.ranges).toEqual([lines.last, lines.last]);
  });
});
