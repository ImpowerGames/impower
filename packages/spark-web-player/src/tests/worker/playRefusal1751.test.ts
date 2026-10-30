import { GameExitedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage";
import { NO_START_SCENE_MESSAGE } from "@impower/sparkdown/src/compiler/utils/startScene";
import { describe, expect, it, vi } from "vitest";
import { createPlayerHarness, holdFirstInit, MAIN_URI, settle } from "./playerHarness";

const START = "scene start\n  Hello.\nend\n";

const harness = async () => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: START }],
    startFrom: { file: MAIN_URI, line: 1 },
  });
  h.refs.playButton = Object.assign(h.overlay.ownerDocument.createElement("div"), {
    getAnimations: () => [],
  });
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
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

describe("the player's start and restart gate while the story has no start scene", { timeout: 120000 }, () => {
  const NO_START = "scene other\n  Other.\nend\n";

  const exits = (h: Awaited<ReturnType<typeof harness>>) =>
    h.toEditor.filter((m: unknown) => GameExitedMessage.type.isNotification(m));

  const playing = async () => {
    const h = await harness();
    await h.compile();
    expect(await h.controller.startGameAndApp()).toBe(true);
    expect(h.controller.playing).toBe(true);
    return h;
  };

  it("ends the running game and tells the host when the story's automatic restart is refused", async () => {
    const h = await playing();
    try {
      await h.edit([{ text: NO_START }]);
      const result = await h.compile();
      expect(result.program.playRefusal).toBe(NO_START_SCENE_MESSAGE);
      await vi.waitFor(() => expect(exits(h)).toHaveLength(1), { timeout: 15000 });
      expect(exits(h)[0]?.params.reason).toBe("invalidated");
      expect(h.controller.playing).toBe(false);
    } finally {
      h.dispose();
    }
  });

  it("answers RestartGame with the refusal and tells the host the game ended", async () => {
    const h = await playing();
    try {
      h.controller.scheduleRestartGame = () => {};
      await h.edit([{ text: NO_START }]);
      await h.compile();
      expect(
        await within(h.controller.handleRestartGame({ id: 7, params: {} })),
      ).toMatchObject({ error: { message: NO_START_SCENE_MESSAGE } });
      expect(exits(h)).toHaveLength(1);
      expect(h.controller.playing).toBe(false);
    } finally {
      h.dispose();
    }
  });

  it("refuses a start still under way when the refusal arrives, rather than playing the story before it", async () => {
    const h = await harness();
    try {
      await h.compile();
      await settle(20);
      const { release } = holdFirstInit(h);
      const starting = within(h.controller.handleStartGame({ id: 8, params: {} }));
      await settle(40);
      await h.edit([{ text: NO_STORY }]);
      const result = await h.compile();
      expect(result.program.runnable).toBe(false);
      expect(result.program.playRefusal).toBe(NO_START_SCENE_MESSAGE);
      release();
      expect(await starting).toMatchObject({ error: { message: NO_START_SCENE_MESSAGE } });
      await settle(40);
      expect(h.controller.playing).toBe(false);
    } finally {
      h.dispose();
    }
  });
});

describe("a start the refusal cancels", { timeout: 120000 }, () => {
  const NO_START = "scene other\n  Other.\nend\n";

  const exits = (h: Awaited<ReturnType<typeof harness>>) =>
    h.toEditor.filter((m: unknown) => GameExitedMessage.type.isNotification(m));

  const holdingStart = async () => {
    const h = await harness();
    await h.compile();
    await settle(20);
    const { release } = holdFirstInit(h);
    const starting = within(h.controller.handleStartGame({ id: 9, params: {} }));
    await settle(40);
    return { h, release, starting };
  };

  it("leaves the preview of the story that refused it on screen", async () => {
    const { h, release, starting } = await holdingStart();
    try {
      await h.edit([{ text: NO_START }]);
      await h.compile();
      release();
      expect(await starting).toMatchObject({ error: { message: NO_START_SCENE_MESSAGE } });
      await settle(60);
      await vi.waitFor(() => expect(h.overlay.textContent).toContain("Other."), { timeout: 15000 });
      expect(h.controller.playing).toBe(false);
    } finally {
      h.dispose();
    }
  });

  it("keeps the play button and sends no exit when another PLAY is refused meanwhile", async () => {
    const { h, release, starting } = await holdingStart();
    try {
      await h.edit([{ text: NO_STORY }]);
      await h.compile();
      expect(
        await within(h.controller.handleStartGame({ id: 10, params: {} })),
      ).toMatchObject({ error: { message: NO_START_SCENE_MESSAGE } });
      release();
      await starting;
      await settle(60);
      expect(h.refs.playButton.style.display).not.toBe("none");
      expect(exits(h)).toHaveLength(0);
    } finally {
      h.dispose();
    }
  });

  it("sends one exit when the author stops while the refusal cancels the start", async () => {
    const { h, release, starting } = await holdingStart();
    try {
      await h.edit([{ text: NO_STORY }]);
      await h.compile();
      const stopping = h.controller.stopGame("quit");
      release();
      await starting;
      await stopping;
      await settle(60);
      expect(exits(h)).toHaveLength(1);
      expect(h.controller.playing).toBe(false);
    } finally {
      h.dispose();
    }
  });
});

describe("the start's own check of the refusal", { timeout: 120000 }, () => {
  const exits = (h: Awaited<ReturnType<typeof harness>>) =>
    h.toEditor.filter((m: unknown) => GameExitedMessage.type.isNotification(m));

  it("lets a start go ahead, with its app, when a valid compile clears the refusal before it plays", async () => {
    const h = await harness();
    try {
      await h.compile();
      await settle(20);
      const { apps, release } = holdFirstInit(h);
      const starting = within(h.controller.handleStartGame({ id: 11, params: {} }));
      await settle(40);
      await h.edit([{ text: NO_STORY }]);
      await h.compile();
      await h.edit([{ text: START }]);
      await h.compile();
      expect(h.controller._playRefusal).toBeUndefined();
      release();
      expect(await starting).toMatchObject({ result: { success: true } });
      expect(h.controller.playing).toBe(true);
      expect(apps[0].destroyed).toBeFalsy();
      expect(exits(h)).toHaveLength(0);
    } finally {
      h.dispose();
    }
  });

  it("sends one exit for the one run that began when two restarts overlap the refusal", async () => {
    const h = await harness();
    try {
      await h.compile();
      expect(await h.controller.startGameAndApp()).toBe(true);
      h.controller.scheduleRestartGame = () => {};
      const { release } = holdFirstInit(h);
      const first = h.controller.restartGame();
      await settle(40);
      const second = h.controller.restartGame();
      await settle(40);
      await h.edit([{ text: NO_STORY }]);
      await h.compile();
      release();
      await Promise.all([within(first), within(second)]);
      await settle(60);
      expect(exits(h)).toHaveLength(1);
      expect(exits(h)[0]?.params.reason).toBe("invalidated");
      expect(h.controller.playing).toBe(false);
      expect(h.refs.playButton.style.display).not.toBe("none");
    } finally {
      h.dispose();
    }
  });
});
