// The preview's debugger controls reach the worker's game that shows the
// preview, and what the editor asks for before there is a game to ask holds
// for the game built next.
import { DisableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/EnableGameDebugMessage";
import { SetGameBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameBreakpointsMessage";
import { SetGameDataBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameDataBreakpointsMessage";
import { SetGameFunctionBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameFunctionBreakpointsMessage";
import { describe, expect, it } from "vitest";
import { PlayMessage } from "../../main/workers/messages/PlayMessage";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `-> start

scene start
  HERO:
    The first line.

  HERO:
    The line after.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const FIRST = lineOf("The first line.");

/** The worker's game that shows the preview. */
const displayingGame = (h: any) => h.workerState.gameState.game;

/** The lines a game stops at for its source breakpoints. */
const stopsAt = (game: any) =>
  Object.values(game._breakpointMap as Record<number, Map<number, unknown>>).flatMap((m) => [
    ...m.keys(),
  ]);

describe("debugger settings", () => {
  it("gives the game it builds the debugger settings made before it existed", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      // The editor sets a breakpoint and turns debugging on before anything
      // has compiled, so neither side has a game yet.
      expect(displayingGame(h) == null).toBe(true);
      const breakpoints = [{ file: MAIN_URI, line: FIRST }];
      const answered = await h.controller.handleSetGameBreakpoints(
        SetGameBreakpointsMessage.type.request({ breakpoints }),
      );
      const answeredFunctions = await h.controller.handleSetGameFunctionBreakpoints(
        SetGameFunctionBreakpointsMessage.type.request({
          functionBreakpoints: [{ name: "greet" }],
        }),
      );
      const answeredData = await h.controller.handleSetGameDataBreakpoints(
        SetGameDataBreakpointsMessage.type.request({
          dataBreakpoints: [{ dataId: "mood" }],
        }),
      );
      // No game has resolved where any of them lands, so none is answered
      // as a breakpoint: the editor's debugger reads each answer as a
      // resolved breakpoint, with its verification and location.
      expect(answered.result).toEqual({ breakpoints: [] });
      expect(answeredFunctions.result).toEqual({ functionBreakpoints: [] });
      expect(answeredData.result).toEqual({ dataBreakpoints: [] });
      const enabled = await h.controller.handleEnableGameDebug(
        EnableGameDebugMessage.type.request({}),
      );
      expect("error" in enabled).toBe(false);

      await h.compile();
      await settle(40);

      // The game that now shows the preview holds both.
      const game = displayingGame(h);
      expect(game != null).toBe(true);
      expect(game.context.system.debugging).toBe(true);
      // The breakpoint the editor set is one the game now stops at: it
      // resolved to a line of the script it holds.
      expect(stopsAt(game)).toContain(FIRST);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("shows the preview after STOP with the debugger settings made while PLAY ran", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      await h.compile();
      await h.select(FIRST);
      await settle(40);
      // Debugging on, and a breakpoint on the line, while the preview shows.
      await h.controller.handleEnableGameDebug(EnableGameDebugMessage.type.request({}));
      await h.controller.handleSetGameBreakpoints(
        SetGameBreakpointsMessage.type.request({
          breakpoints: [{ file: MAIN_URI, line: FIRST }],
        }),
      );
      expect(displayingGame(h).context.system.debugging).toBe(true);

      // The editor turns both off while PLAY runs, which only the running
      // game hears.
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(40);
      await h.controller.handleDisableGameDebug(DisableGameDebugMessage.type.request({}));
      await h.controller.handleSetGameBreakpoints(
        SetGameBreakpointsMessage.type.request({ breakpoints: [] }),
      );
      const win = h.overlay.ownerDocument.defaultView as any;
      win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
      await h.controller.stopGame("quit");
      await h.select(FIRST);
      await settle(40);

      // The preview after STOP is shown by a game with the settings the
      // editor made last.
      const game = displayingGame(h);
      expect(game.context.system.debugging).toBeFalsy();
      expect(stopsAt(game)).not.toContain(FIRST);
    } finally {
      h.dispose();
    }
  }, 120_000);
});

describe("a worker that cannot be asked, and PLAY that is starting", () => {
  it("answers the editor when the worker cannot be asked", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      await h.compile();
      // Whatever the worker's trouble is, the request is answered: an
      // unanswered one leaves the editor waiting for ever.
      (h.link as any).request = async () => {
        throw new Error("the worker is gone");
      };
      const enabled = await h.controller.handleEnableGameDebug(
        EnableGameDebugMessage.type.request({}),
      );
      expect("error" in enabled).toBe(true);
      const disabled = await h.controller.handleDisableGameDebug(
        DisableGameDebugMessage.type.request({}),
      );
      expect("error" in disabled).toBe(true);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("gives the game PLAY starts the mode the editor asked for meanwhile", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      await h.compile();
      await h.select(FIRST);

      // PLAY asks the worker to build its game, and the editor turns
      // debugging on before the request goes: the toolbar offers the control
      // from the moment PLAY is pressed.
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const request = h.link.request.bind(h.link);
      (h.link as any).request = async (type: any, params: any) => {
        if (type.method === PlayMessage.method) {
          await held;
        }
        return request(type, params);
      };
      const played = h.controller.startGameAndApp();
      await settle(20);
      const enabled = await h.controller.handleEnableGameDebug(
        EnableGameDebugMessage.type.request({}),
      );
      expect("error" in enabled).toBe(false);
      release();
      expect(await played).toBe(true);
      await settle(40);

      // The game that is running is the one the editor was talking about.
      expect(h.playing()?.context?.system?.debugging).toBe(true);
    } finally {
      h.dispose();
    }
  }, 120_000);
});
