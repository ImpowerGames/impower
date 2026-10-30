import { NO_START_SCENE_MESSAGE } from "@impower/sparkdown/src/compiler/utils/startScene";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI } from "./playerHarness";

const START = "scene start\n  Hello.\nend\n";

const harness = async () => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: START }],
    startFrom: { file: MAIN_URI, line: 1 },
  });
  h.refs.playButton = h.overlay.ownerDocument.createElement("div");
  return h;
};

const NO_STORY = "external message(x)\nscene other\n  Other.\nend\n";

const within = <T>(promise: Promise<T>, ms = 10000) =>
  Promise.race([
    promise,
    new Promise<string>((resolve) => setTimeout(() => resolve(`still waiting after ${ms} ms`), ms)),
  ]);

const coldHarness = async () => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: NO_STORY }],
    startFrom: { file: MAIN_URI, line: 1 },
  });
  h.refs.playButton = h.overlay.ownerDocument.createElement("div");
  return h;
};

const button = (h: Awaited<ReturnType<typeof harness>>) => ({
  title: h.refs.playButton.getAttribute("title"),
  disabled: h.refs.playButton.getAttribute("aria-disabled"),
});

describe("PLAY in the player while the story has no start scene", { timeout: 120000 }, () => {
  it("is refused, and the play button says why, while no scene is named start", async () => {
    const h = await harness();
    try {
      await h.compile();
      await h.edit([{ text: "scene other\n  Other.\nend\n" }]);
      const result = await h.compile();
      expect(result.program.playRefusal).toBe(NO_START_SCENE_MESSAGE);
      expect(button(h)).toEqual({ title: NO_START_SCENE_MESSAGE, disabled: "true" });
      expect(await h.controller.startGameAndApp()).toBe(false);
    } finally {
      h.dispose();
    }
  });

  it("is refused after a compile that produced no story, rather than playing the story before it", async () => {
    const h = await harness();
    try {
      await h.compile();
      await h.edit([{ text: "external message(x)\nscene other\n  Other.\nend\n" }]);
      const result = await h.compile();
      expect(result.program.runnable).toBe(false);
      expect(result.program.playRefusal).toBe(NO_START_SCENE_MESSAGE);
      expect(button(h)).toEqual({ title: NO_START_SCENE_MESSAGE, disabled: "true" });
      expect(await h.controller.startGameAndApp()).toBe(false);
    } finally {
      h.dispose();
    }
  });

  it("is refused, not left waiting, when the first compile produced no story", async () => {
    const h = await coldHarness();
    try {
      const result = await h.compile();
      expect(result.program.runnable).toBe(false);
      expect(result.program.playRefusal).toBe(NO_START_SCENE_MESSAGE);
      expect(await within(h.controller.startGameAndApp())).toBe(false);
      expect(
        await within(h.controller.handleStartGame({ id: 1, params: {} })),
      ).toMatchObject({ error: { message: NO_START_SCENE_MESSAGE } });
    } finally {
      h.dispose();
    }
  });

  it("is refused when PLAY was asked for before the first compile arrived", async () => {
    const h = await coldHarness();
    try {
      const started = within(h.controller.startGameAndApp());
      await h.compile();
      expect(await started).toBe(false);
    } finally {
      h.dispose();
    }
  });

  it("plays again once a start scene compiles", async () => {
    const h = await harness();
    try {
      await h.edit([{ text: "scene other\n  Other.\nend\n" }]);
      await h.compile();
      await h.edit([{ text: START }]);
      await h.compile();
      expect(button(h)).toEqual({ title: null, disabled: null });
      expect(await h.controller.startGameAndApp()).toBe(true);
    } finally {
      h.dispose();
    }
  });
});
