// The preview's debugger controls reach whichever game shows the preview, and
// what the editor asks for before there is a game to ask holds for the game
// built next — in either position of the worker-display switch (#680).
import { DisableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/DisableGameDebugMessage";
import { EnableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/EnableGameDebugMessage";
import { SetGameBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameBreakpointsMessage";
import { describe, expect, it } from "vitest";
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

/** The game that shows the preview, whichever side holds it. */
const displayingGame = (h: any, workerDisplays: boolean) =>
  workerDisplays ? h.workerState.gameState.game : h.controller._game;

for (const workerDisplays of [false, true]) {
  describe(`with the switch ${workerDisplays ? "on" : "off"}`, () => {
    it("gives the game it builds the debugger settings made before it existed", async () => {
      const h = await createPlayerHarness({
        workerDisplays,
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line: FIRST },
      });
      try {
        // The editor sets a breakpoint and turns debugging on before anything
        // has compiled, so neither side has a game yet.
        expect(displayingGame(h, workerDisplays)).toBeUndefined();
        const breakpoints = [{ file: MAIN_URI, line: FIRST }];
        const answered = await h.controller.handleSetGameBreakpoints(
          SetGameBreakpointsMessage.type.request({ breakpoints }),
        );
        expect("error" in answered).toBe(false);
        const enabled = await h.controller.handleEnableGameDebug(
          EnableGameDebugMessage.type.request({}),
        );
        expect("error" in enabled).toBe(false);

        await h.compile();
        await settle(40);

        // The game that now shows the preview holds both.
        const game = displayingGame(h, workerDisplays);
        expect(game).toBeDefined();
        expect(game.context.system.debugging).toBe(true);
        // The breakpoint the editor set is one the game now stops at: it
        // resolved to a line of the script it holds.
        const stops = Object.values(game._breakpointMap as Record<number, Map<number, unknown>>);
        expect(stops.flatMap((m) => [...m.keys()])).toContain(FIRST);
      } finally {
        h.dispose();
      }
    }, 120_000);
  });
}

describe("with the switch on", () => {
  it("answers the editor when the worker cannot be asked", async () => {
    const h = await createPlayerHarness({
      workerDisplays: true,
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
      workerDisplays: true,
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      await h.compile();
      await h.select(FIRST);

      // PLAY asks the worker for the program, and the editor turns debugging
      // on while it waits: the toolbar offers the control from the moment
      // PLAY is pressed.
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const programForPlay = h.workspace.programForPlay.bind(h.workspace);
      h.workspace.programForPlay = async (...args: unknown[]) => {
        await held;
        return programForPlay(...(args as [any, any]));
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
      expect(h.controller._game?.context?.system?.debugging).toBe(true);
    } finally {
      h.dispose();
    }
  }, 120_000);
});
