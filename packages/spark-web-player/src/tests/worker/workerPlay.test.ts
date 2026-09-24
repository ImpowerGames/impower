// PLAY runs in the player's worker (#682): the worker builds PLAY's game
// beside the game that previews, from its own story, and the page only shows
// it. The page builds no game at any point, an edit restarts the run, STOP
// returns the cursor, the worker's thread is not spent on a route search
// while the game runs, and the controls that move time move it on both
// sides.
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { GameReloadedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameReloadedMessage";
import { PauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/PauseGameMessage";
import { StepGameClockMessage } from "@impower/spark-engine/src/game/core/classes/messages/StepGameClockMessage";
import { UnpauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/UnpauseGameMessage";
import { describe, expect, it } from "vitest";
import { programIdentity } from "../../utils/programIdentity";
import { createPlayerHarness, MAIN_URI, settle, recorded } from "./playerHarness";

const SOURCE = `-> start

scene start
  HERO:
    The first line.

  HERO:
    The second line.

  HERO:
    The third line.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const FIRST = lineOf("The first line.");
const SECOND = lineOf("The second line.");
const THIRD = lineOf("The third line.");

/** Replace the text of the third line. */
const editThird = (text: string) => [
  {
    range: {
      start: { line: THIRD, character: 4 },
      end: { line: THIRD, character: 4 + "The third line.".length },
    },
    text,
  },
];

/** STOP waits a frame between its steps, which this page does not draw. */
const framesForStop = (h: { overlay: HTMLElement }) => {
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
};

/** Every game built from now on, and whether the page built it: a game on
 *  the page is built by the controller, and the worker's are built in tasks
 *  that begin in the worker's connection. */
const recordGameBuilds = () => {
  const builds: { page: boolean; program: unknown }[] = [];
  const proto = Game.prototype as any;
  const updateProgram = proto.updateProgram;
  proto.updateProgram = function (this: any, ...args: any[]) {
    // The constructor gives the game its program before it has a connection.
    if (!this._connection) {
      const stack = new Error().stack ?? "";
      builds.push({
        page: stack.includes("GamePlayerController"),
        program: args[0],
      });
    }
    return updateProgram.apply(this, args);
  };
  return {
    builds,
    restore: () => {
      proto.updateProgram = updateProgram;
    },
  };
};

/** Wait until the editor has been told the game restarted after an edit. */
const reloaded = async (h: { toEditor: any[] }) => {
  for (let i = 0; i < 200; i++) {
    if (h.toEditor.some((m) => m.method === GameReloadedMessage.method)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("The game never restarted");
};

/** Stopped preview, PLAY, an edit during PLAY with its restart, and STOP, as
 *  the author does them. Answers what each step showed. */
const session = async () => {
  const gameBuilds = recordGameBuilds();
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: SECOND },
    // Each side ticks the frames the test gives it, and no others.
    manualClock: true,
  });
  framesForStop(h);
  try {
    await h.compile();
    await h.select(SECOND);
    await settle(40);
    const previewed = h.overlay.textContent;

    expect(await h.controller.startGameAndApp()).toBe(true);
    await settle(40);
    // Two seconds of frames: the line is typed out.
    await h.tick(1000 / 60, 120);
    const played = h.overlay.textContent;
    const playedProgram = h.playing()?.program;

    await h.edit(editThird("The third line, edited."));
    await h.compile();
    await reloaded(h);
    await settle(40);
    await h.tick(1000 / 60, 120);
    const restartedProgram = h.playing()?.program;
    const restarted = h.overlay.textContent;

    await h.controller.stopGame("quit");
    await settle(40);
    const stopSelections = [...h.workspace.selections];
    await h.select(SECOND);
    await settle(40);
    return {
      builds: gameBuilds.builds,
      previewed,
      played,
      restarted,
      restartedIds: [
        programIdentity(playedProgram as any),
        programIdentity(restartedProgram as any),
      ],
      stopSelections,
      afterStop: h.overlay.textContent,
      playingAfterStop: h.playing() != null,
    };
  } finally {
    gameBuilds.restore();
    h.dispose();
  }
};

describe("PLAY", () => {
  it("builds no game on the page, and shows what was recorded", async () => {
    const on = await session();

    // Every game is the worker's: the preview's, PLAY's, and the one the
    // restart built.
    expect(on.builds.filter((b) => b.page)).toEqual([]);
    expect(on.builds.length).toBeGreaterThanOrEqual(3);

    // PLAY showed the line it started from, the restart ran the edited
    // program, and STOP asked the editor to select where the game was.
    expect(on.previewed).toContain("The second line.");
    expect(on.played).toContain("The second line.");
    expect(on.afterStop).toContain("The second line.");
    expect(on.restartedIds[0]).not.toBe(on.restartedIds[1]);
    expect(on.stopSelections).toHaveLength(1);
    expect(on.playingAfterStop).toBe(false);
    const { builds: _on, ...onSeen } = on;
    expect(recorded(onSeen)).toMatchSnapshot();
  }, 120_000);
});

describe("a selection while PLAY runs in the worker", () => {
  it("replays no route, and after STOP a selection does", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(FIRST);
      const game = h.workerState.gameState.game!;
      const replay = game.patchAndSimulateRoute.bind(game);
      let replays = 0;
      game.patchAndSimulateRoute = (...args: Parameters<Game["patchAndSimulateRoute"]>) => {
        replays += 1;
        return replay(...args);
      };

      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(40);
      const before = replays;
      await h.select(THIRD);
      await h.select(SECOND);
      expect(replays).toBe(before);
      // The line is still where the next compile starts from.
      expect(h.workerState.compilerState.compiler.config.startFrom).toEqual({
        file: MAIN_URI,
        line: SECOND,
      });

      await h.controller.stopGame("quit");
      await settle(40);
      await h.select(THIRD);
      expect(replays).toBeGreaterThan(before);
      expect(h.overlay.textContent).toContain("The third line.");
    } finally {
      h.dispose();
    }
  }, 120_000);
});

describe("the game that previews while PLAY runs in the worker", () => {
  it("sends the page nothing, so PLAY's stream is the only one there", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      await h.compile();
      await h.select(FIRST);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(40);
      // Anything the game that previews sends, which is still connected to
      // the page from the last display: here a notification of its own, on
      // a stream newer than PLAY's.
      const previewing = h.workerState.gameState.game!;
      previewing.connection.beginEpoch();
      previewing.connection.beginEpoch();
      await previewing.connection.emit({
        jsonrpc: "2.0",
        method: "test/fromPreview",
        params: {},
      } as any);
      await settle(20);
      expect(h.toRouter.some((m) => m.method === "test/fromPreview")).toBe(false);
      // A request it makes is answered, so whatever it was doing, such as a
      // display PLAY took over, does not wait for ever.
      const asked = previewing.connection
        .emit({ jsonrpc: "2.0", id: "from-preview", method: "test/askPreview", params: {} } as any)
        .then(
          () => "answered",
          () => "refused",
        );
      const outcome = await Promise.race([
        asked,
        new Promise((resolve) => setTimeout(() => resolve("waiting"), 2000)),
      ]);
      expect(outcome).toBe("refused");
      expect(h.toRouter.some((m) => m.method === "test/askPreview")).toBe(false);
      // PLAY's game still reaches the page afterwards.
      const before = h.toRouter.length;
      await h.controller.handlePauseGame(PauseGameMessage.type.request({}));
      await h.controller.handleUnpauseGame(UnpauseGameMessage.type.request({}));
      h.controller._app.emit(
        EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
      await settle(20);
      expect(h.toRouter.length).toBeGreaterThan(before);
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);
});

describe("the controls that move time", () => {
  const playing = async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
      manualClock: true,
    });
    await h.compile();
    await h.select(FIRST);
    expect(await h.controller.startGameAndApp()).toBe(true);
    await settle(40);
    await h.tick(1000 / 60, 3);
    return h;
  };

  /** Where each side's clock stands: whether it runs, and how far it has
   *  been moved from the time it reads. */
  const clocks = (h: any) => {
    const game = h.workerState.gameState.running!;
    const app = h.controller._app;
    return {
      game: { paused: game.paused, speed: game.clock.speed, start: game.clock.startTime },
      page: { paused: app.paused, speed: app.clock.speed, start: app.clock.startTime },
    };
  };

  it("pause stops both, and unpause runs both", async () => {
    const h = await playing();
    try {
      expect(clocks(h).game).toMatchObject({ paused: false, speed: 1 });
      expect(clocks(h).page).toMatchObject({ paused: false, speed: 1 });

      const paused = await h.controller.handlePauseGame(PauseGameMessage.type.request({}));
      expect("error" in paused).toBe(false);
      expect(clocks(h).game).toMatchObject({ paused: true, speed: 0 });
      expect(clocks(h).page).toMatchObject({ paused: true, speed: 0 });

      const unpaused = await h.controller.handleUnpauseGame(UnpauseGameMessage.type.request({}));
      expect("error" in unpaused).toBe(false);
      expect(clocks(h).game).toMatchObject({ paused: false, speed: 1 });
      expect(clocks(h).page).toMatchObject({ paused: false, speed: 1 });
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);

  for (const seconds of [2.5, -0.5]) {
    it(`a clock step of ${seconds} s moves both by the same time`, async () => {
      const h = await playing();
      try {
        const before = clocks(h);
        const stepped = await h.controller.handleStepGameClock(
          StepGameClockMessage.type.request({ seconds }),
        );
        expect("error" in stepped).toBe(false);
        const after = clocks(h);
        expect(after.game.start - before.game.start).toBeCloseTo(seconds, 9);
        expect(after.page.start - before.page.start).toBeCloseTo(seconds, 9);
      } finally {
        await h.controller.destroyGameAndApp();
        h.dispose();
      }
    }, 120_000);
  }

  it("a clock step while paused leaves both paused", async () => {
    const h = await playing();
    try {
      await h.controller.handlePauseGame(PauseGameMessage.type.request({}));
      await h.controller.handleStepGameClock(StepGameClockMessage.type.request({ seconds: 1 }));
      expect(clocks(h).game).toMatchObject({ paused: true, speed: 0 });
      expect(clocks(h).page).toMatchObject({ paused: true, speed: 0 });
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);
});
