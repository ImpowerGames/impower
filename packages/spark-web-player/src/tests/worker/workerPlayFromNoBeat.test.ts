import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle, writtenText } from "./playerHarness";

const SOURCE = `-> start
scene start
  Hello.
  done
end
`;

const playFrom = async (line: number) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
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
    const outcome = {
      started,
      state: h.playing()?.state,
      exited: h.toEditor
        .filter((m) => m.method === "game/exited")
        .map((m) => m.params?.reason),
      text: writtenText(h.toRouter.slice(sentBefore)),
    };
    await h.controller.destroyGameAndApp();
    return outcome;
  } finally {
    h.dispose();
  }
};

describe("PLAY from a line that holds no beat", () => {
  it.each([
    ["the top-level divert", 0],
    ["the scene's header", 1],
    ["the scene's first line", 2],
  ])("from %s, runs the scene and waits on its first line", async (_name, line) => {
    const outcome = await playFrom(line);
    expect(outcome.started).toBe(true);
    expect(outcome.exited).toEqual([]);
    expect(outcome.state).toBe("running");
    expect(outcome.text).toContain("Hello.");
  }, 120_000);
});
