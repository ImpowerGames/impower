import { EnableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/EnableGameDebugMessage";
import { GetGameStackTraceMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameStackTraceMessage";
import { GetGameThreadsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameThreadsMessage";
import { StepGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StepGameMessage";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `store mood = 0

scene start
  HERO:
    The first line.
  & mood = 1
  HERO:
    The second line.
  HERO:
    The third line.
end
`;

const FIRST = SOURCE.split("\n").findIndex((l) => l.includes("The first line."));

const playing = async () => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: FIRST },
    manualClock: true,
  });
  const c = h.controller as any;
  await h.compile();
  await h.select(FIRST);
  await settle(40);
  await c.handleEnableGameDebug(EnableGameDebugMessage.type.request({}));
  expect(await c.startGameAndApp()).toBe(true);
  await settle(40);
  await h.tick(1000 / 60, 60);
  const standing = async () => {
    const threads = (await c.handleGetGameThreads(GetGameThreadsMessage.type.request({})))
      .result;
    const stack = (
      await c.handleGetGameStackTrace(
        GetGameStackTraceMessage.type.request({
          threadId: threads.threads[0]?.id ?? 0,
          startFrame: 0,
          levels: 20,
        }),
      )
    ).result;
    return {
      stopped: threads.stopped,
      line: stack.stackFrames[0]?.location?.range.start.line,
    };
  };
  return { h, c, standing };
};

describe("the player's own Resume", () => {
  it("runs the story on after a debug Step", async () => {
    const { h, c, standing } = await playing();
    try {
      await c.pauseGame();
      await c.handleStepGame(StepGameMessage.type.request({ traversal: "over" }));
      await settle(10);
      const stepped = await standing();
      expect(stepped.stopped).toBe(true);
      await c.resumeGame();
      await settle(10);
      const resumed = await standing();
      expect(c._app.paused).toBe(false);
      expect(resumed.stopped).toBe(false);
      expect(resumed.line).toBeGreaterThan(stepped.line);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("resumes in place after a plain Pause", async () => {
    const { h, c, standing } = await playing();
    try {
      await c.pauseGame();
      const paused = await standing();
      expect(paused.stopped).toBe(true);
      await c.resumeGame();
      await settle(10);
      const resumed = await standing();
      expect(c._app.paused).toBe(false);
      expect(resumed.stopped).toBe(false);
      expect(resumed.line).toBe(paused.line);
    } finally {
      h.dispose();
    }
  }, 120_000);
});
