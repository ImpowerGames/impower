import { EnableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/EnableGameDebugMessage";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { SetGameBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameBreakpointsMessage";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `scene start
  HERO:
    The first line.
  HERO:
    The second line.
  HERO:
    The third line.
  HERO:
    The fourth line.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const FIRST = lineOf("The first line.");
const SECOND = lineOf("The second line.");
const FOURTH = lineOf("The fourth line.");

const hits = (toEditor: any[]) =>
  toEditor
    .filter((m) => m.method === "game/hitBreakpoint")
    .map((m) => m.params.location?.range.start.line);

describe("breakpoints and the time-free scrub", () => {
  it("scrubs past a breakpoint without stopping, and only play stops at it", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
      manualClock: true,
    });
    const c = h.controller;
    try {
      await h.compile();
      await h.select(FIRST);
      await settle(40);
      await c.handleEnableGameDebug(EnableGameDebugMessage.type.request({}));
      const set: any = await c.handleSetGameBreakpoints(
        SetGameBreakpointsMessage.type.request({
          breakpoints: [{ file: MAIN_URI, line: SECOND }],
        }),
      );
      expect(set.result.breakpoints[0].verified).toBe(true);

      await h.select(FOURTH);
      await settle(40);
      await h.select(FIRST);
      await settle(40);
      expect(hits(h.toEditor)).toEqual([]);

      expect(await c.startGameAndApp()).toBe(true);
      await settle(40);
      await h.tick(1000 / 60, 60);
      for (let i = 0; i < 4 && hits(h.toEditor).length === 0; i += 1) {
        c._app.emit(EventMessage.type.notification({ type: "pointerdown", button: 0 } as never));
        await settle(10);
        await h.tick(1000 / 60, 60);
      }
      expect(hits(h.toEditor)).toEqual([SECOND]);
      await c.destroyGameAndApp();
    } finally {
      h.dispose();
    }
  }, 120_000);
});
