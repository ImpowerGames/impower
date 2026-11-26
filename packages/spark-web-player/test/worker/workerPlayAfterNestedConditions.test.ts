import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle, writtenText } from "./playerHarness";

const NESTED = `scene start
  Before.
  if true then
    if true then
      Natural.
    end
  end
  done
end
`;

const FORCED_ONLY = `scene start
  Before.
  if false then
    Forced.
  end
  done
end
`;

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
    const outcome = {
      started,
      state: h.playing()?.state,
      text: writtenText(h.toRouter.slice(sentBefore)),
    };
    await h.controller.destroyGameAndApp();
    return outcome;
  } finally {
    h.dispose();
  }
};

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

describe("a line the story's own run reaches after nested conditions", () => {
  it.each([
    ["the beat inside the conditions", 4],
    ["the done after them", 7],
  ])("PLAY from %s waits on the beat the run displayed", async (_name, line) => {
    const outcome = await playFrom(NESTED, line);
    expect(outcome.started).toBe(true);
    expect(outcome.state).toBe("running");
    expect(outcome.text).toContain("Natural.");
  }, 120_000);

  it.each([
    ["the beat inside the conditions", 4],
    ["the done after them", 7],
  ])("the preview at %s shows the beat the run displayed", async (_name, line) => {
    expect(await previewAt(NESTED, line)).toContain("Natural.");
  }, 120_000);
});

describe("a line only a forced condition reaches", () => {
  it("is still routed by forcing the condition", async () => {
    const outcome = await playFrom(FORCED_ONLY, 3);
    expect(outcome.started).toBe(true);
    expect(outcome.state).toBe("running");
    expect(outcome.text).toContain("Forced.");
  }, 120_000);

  it("leaves no forced verdict behind for the next line the run reaches", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: FORCED_ONLY }],
      startFrom: { file: MAIN_URI, line: 3 },
    });
    try {
      await h.compile();
      await h.select(3);
      await settle(40);
      expect(writtenText(h.toRouter)).toContain("Forced.");
      const sentBefore = h.toRouter.length;
      await h.select(5);
      await settle(40);
      const text = writtenText(h.toRouter.slice(sentBefore));
      expect(text).toContain("Before.");
      expect(text).not.toContain("Forced.");
    } finally {
      h.dispose();
    }
  }, 120_000);
});
