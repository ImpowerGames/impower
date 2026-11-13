import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { PauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/PauseGameMessage";
import { SetStartingDisplayModeMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetStartingDisplayModeMessage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayMessage } from "../../main/workers/messages/PlayMessage";
import {
  createPlayerHarness,
  MAIN_URI,
  runButton,
  settle,
  writtenText,
} from "./playerHarness";

const RAN_OUT = "scene start\n  First.\n  Hello.\n  done\nend\n";
const FIN = "scene start\n  First.\n  Hello.\n  fin\nend\n";
const ERROR = 'scene start\n  First.\n  Hello.\n  & error("boom")\n  Goodbye.\nend\n';
const HELLO = 2;
const OPEN_TEXTSTREAM = 'define ui as config with\n  layouts_initial = { "textstream" }\nend\n\n';

type Host = "editor" | "standalone";

const start = async (source: string, line: number, host: Host = "editor") => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: source }],
    startFrom: { file: MAIN_URI, line },
    manualClock: true,
  });
  const doc = h.overlay.ownerDocument;
  const win = doc.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  if (host === "editor") {
    h.refs.toolbar = doc.createElement("div");
  }
  const plays: unknown[] = [];
  const request = h.link.request.bind(h.link);
  h.link.request = ((type: any, params: any) => {
    if (type.method === PlayMessage.method) {
      plays.push(params.startFrom);
    }
    return request(type, params);
  }) as typeof h.link.request;
  await h.compile();
  await h.select(line);
  await settle(40);
  expect(await h.controller.startGameAndApp()).toBe(true);
  await settle(40);
  await h.tick(1000 / 60, 60);
  return { h, plays };
};

const click = async (h: any) => {
  h.controller._app.emit(
    EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
  );
  await settle(10);
  await h.tick(1000 / 60, 60);
  await settle(20);
};

const sent = (h: any, method: string) =>
  h.toEditor.filter((m: any) => m.method === method).map((m: any) => m.params);

const launchStates = (h: any) =>
  sent(h, "preview/didChangeGameState").map((s: any) => s.launchState);

describe("PLAY in the worker reaching the end of the story", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const [name, source, kind, badge] of [
    ["running out", RAN_OUT, "out", "Story ran out"],
    ["fin", FIN, "fin", "End of story"],
    ["a runtime error", ERROR, "error", "Stopped by an error"],
  ] as const) {
    it(`holds the game on the ended frame at ${name}, with no game/exited until STOP`, async () => {
      const { h } = await start(source, HELLO);
      try {
        await click(h);
        expect(sent(h, "game/ended")).toEqual([
          expect.objectContaining({ kind }),
        ]);
        expect(launchStates(h).at(-1)).toBe("ended");
        expect(sent(h, "game/exited")).toEqual([]);
        expect(h.controller.playing).toBe(true);
        expect(h.workerState.gameState.running).toBeTruthy();
        expect(h.bar("#ending-status").hidden).toBe(false);
        expect(h.bar("#ending-status").textContent).toBe(badge);
        expect(h.bar("#ending-status").getAttribute("data-kind")).toBe(kind);
        if (kind === "out") {
          expect(h.bar("#ending-status").title).toMatch(
            /^Nothing runs after line \d+\. End the story with fin to show the ending screen\.$/,
          );
        }
        if (kind === "error") {
          expect(h.bar("#ending-status").title).toMatch(/boom.*\(line 4\)$/);
        }
        await click(h);
        expect(sent(h, "game/ended")).toHaveLength(1);
        expect(launchStates(h).at(-1)).toBe("ended");
      } finally {
        await h.controller.destroyGameAndApp();
        h.dispose();
      }
    }, 120_000);
  }

  for (const [name, source, kind, badge] of [
    ["running out", RAN_OUT, "out", "Story ran out"],
    ["fin", FIN, "fin", "End of story"],
    ["a runtime error", ERROR, "error", "Stopped by an error"],
  ] as const) {
    it(`ends the Interactive Fiction page with the status line at ${name} (#2189)`, async () => {
      const { h } = await start(`${OPEN_TEXTSTREAM}${source}`, HELLO + 4);
      try {
        const lines = () => [...h.overlay.querySelectorAll(".textstream_end")];
        expect(lines()).toEqual([]);
        await click(h);
        expect(sent(h, "game/ended")).toEqual([
          expect.objectContaining({ kind }),
        ]);
        const statuses = sent(h, "preview/didChangeGameState").at(-1).statuses;
        expect(statuses.ending.text).toBe(badge);
        expect(lines()).toHaveLength(1);
        const line = lines()[0]!;
        expect(line.textContent).toBe(statuses.ending.text);
        expect(line.getAttribute("role")).toBe("status");
        expect(line.classList.contains("alert")).toBe(kind === "error");
        expect(line.classList.contains("muted")).toBe(kind !== "error");
        expect(line.parentElement!.lastElementChild).toBe(line);
        expect(line.parentElement!.classList.contains("textstream_column")).toBe(true);
        await click(h);
        expect(lines()).toHaveLength(1);
      } finally {
        await h.controller.destroyGameAndApp();
        h.dispose();
      }
    }, 120_000);
  }

  it("ends a page that opens on fin with the status line alone (#2189)", async () => {
    const { h } = await start(`${OPEN_TEXTSTREAM}scene start\n  fin\nend\n`, 5);
    try {
      await settle(20);
      expect(sent(h, "game/ended")).toEqual([
        expect.objectContaining({ kind: "fin" }),
      ]);
      const column = h.overlay.querySelector(".textstream_column")!;
      expect(column).not.toBeNull();
      expect([...column.children].map((el) => el.className)).toEqual([
        "textstream_end muted",
      ]);
      expect(column.textContent).toBe("End of story");
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);

  it("puts the status line on the page when the host switches to Interactive Fiction after the story ended (#2189)", async () => {
    const { h } = await start(FIN, HELLO);
    try {
      await click(h);
      expect(launchStates(h).at(-1)).toBe("ended");
      expect(h.overlay.querySelectorAll(".textstream_end")).toHaveLength(0);
      await (h.controller as any).handleSetStartingDisplayMode(
        SetStartingDisplayModeMessage.type.request({ mode: "textstream" }),
      );
      await settle(40);
      await h.tick(1000 / 60, 60);
      const lines = [...h.overlay.querySelectorAll(".textstream_end")];
      expect(lines.map((el) => el.textContent)).toEqual(["End of story"]);
      expect(lines[0]!.parentElement!.lastElementChild).toBe(lines[0]);
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);

  for (const line of [0, 1]) {
    it(`ends by fin when PLAY starts on line ${line} of a story whose first statement is fin`, async () => {
      const { h } = await start("scene start\n  fin\nend\n", line);
      try {
        await settle(20);
        expect(sent(h, "game/ended")).toEqual([
          expect.objectContaining({ kind: "fin" }),
        ]);
        expect(launchStates(h).at(-1)).toBe("ended");
        expect(h.bar("#ending-status").textContent).toBe("End of story");
        expect(sent(h, "game/exited")).toEqual([]);
      } finally {
        await h.controller.destroyGameAndApp();
        h.dispose();
      }
    }, 120_000);
  }

  it("answers a pause on the ended frame without pausing it", async () => {
    const { h } = await start(FIN, HELLO);
    try {
      await click(h);
      expect(launchStates(h).at(-1)).toBe("ended");
      const answer = await h.controller.handlePauseGame(
        PauseGameMessage.type.request({}),
      );
      expect(answer).not.toHaveProperty("error");
      await settle(20);
      expect(h.controller._app.paused).toBe(false);
      expect(h.workerState.gameState.running!.paused).toBe(false);
      expect(launchStates(h).at(-1)).toBe("ended");
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);

  it("undoes a pause that reached the game just before the run ended", async () => {
    const { h } = await start(FIN, HELLO);
    try {
      await h.controller.handlePauseGame(PauseGameMessage.type.request({}));
      await settle(20);
      expect(h.controller._app.paused).toBe(true);
      expect(h.workerState.gameState.running!.paused).toBe(true);
      h.controller.holdEndedPlay(h.controller._workerPlay, {
        kind: "fin",
        location: null,
      });
      await settle(20);
      expect(launchStates(h).at(-1)).toBe("ended");
      expect(h.controller._app.paused).toBe(false);
      expect(h.workerState.gameState.running!.paused).toBe(false);
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);

  it("clears the ended run's badge when a newer PLAY takes over", async () => {
    const { h } = await start(RAN_OUT, HELLO);
    try {
      await click(h);
      expect(h.bar("#ending-status").hidden).toBe(false);
      await h.select(1);
      await settle(20);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(40);
      expect(launchStates(h).at(-1)).toBe("play");
      expect(h.bar("#ending-status").hidden).toBe(true);
      expect(h.bar("#ending-status").textContent).toBe("");
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);

  it("replays from the line PLAY started on after the selection has moved", async () => {
    const { h, plays } = await start(RAN_OUT, HELLO);
    try {
      await click(h);
      expect(launchStates(h).at(-1)).toBe("ended");
      await h.select(1);
      await settle(20);
      const before = h.toRouter.length;
      await h.controller.handleRestartGame({ id: 1, params: {} });
      await settle(40);
      await h.tick(1000 / 60, 60);
      expect(plays).toEqual([
        { file: MAIN_URI, line: HELLO },
        { file: MAIN_URI, line: HELLO },
      ]);
      expect(launchStates(h).at(-1)).toBe("play");
      expect(h.bar("#ending-status").hidden).toBe(true);
      const text = writtenText(h.toRouter.slice(before));
      expect(text).toContain("Hello.");
      expect(text).not.toContain("First.");
      expect(sent(h, "game/exited")).toEqual([]);
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);

  for (const caller of ["handleStopGame", "stop"] as const) {
    it(`STOP through ${caller} from the ended frame sends game/exited and selects the line the run ended on`, async () => {
      const { h } = await start(RAN_OUT, HELLO);
      try {
        await click(h);
        const [ended] = sent(h, "game/ended");
        h.workspace.selections.length = 0;
        if (caller === "stop") {
          await h.controller.stop();
        } else {
          await h.controller.handleStopGame({ id: 1, params: {} });
        }
        await settle(20);
        expect(sent(h, "game/exited")).toEqual([
          expect.objectContaining({
            reason: "finished",
            run: expect.any(Number),
          }),
        ]);
        expect(launchStates(h).at(-1)).toBe("preview");
        expect(h.controller.playing).toBe(false);
        expect(h.bar("#ending-status").hidden).toBe(false);
        expect(h.bar("#ending-status").textContent).toBe("Story ran out");
        expect(h.workspace.selections.map((s: any) => s.selectedRange.start.line)).toEqual([
          ended.location.range.start.line,
        ]);
        expect(ended.location.range.start.line).toBe(3);
      } finally {
        h.dispose();
      }
    }, 120_000);
  }

  it("STOP after an error selects the error's line", async () => {
    const { h } = await start(ERROR, HELLO);
    try {
      await click(h);
      const [ended] = sent(h, "game/ended");
      expect(ended.error.location.range.start.line).toBe(3);
      h.workspace.selections.length = 0;
      await h.controller.handleStopGame({ id: 1, params: {} });
      await settle(20);
      expect(sent(h, "game/exited")).toEqual([
        expect.objectContaining({
          reason: "error",
          run: expect.any(Number),
        }),
      ]);
      expect(h.workspace.selections.map((s: any) => s.selectedRange)).toEqual([
        ended.error.location.range,
      ]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("restarts PLAY when an edit compiles while it is ended", async () => {
    const { h, plays } = await start(RAN_OUT, HELLO);
    try {
      await click(h);
      expect(launchStates(h).at(-1)).toBe("ended");
      await h.edit([
        {
          range: { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } },
          text: "Edited.",
        },
      ]);
      await h.compile();
      for (let i = 0; i < 40 && plays.length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await settle(40);
      expect(plays).toHaveLength(2);
      expect(sent(h, "game/reloaded")).toHaveLength(1);
      expect(launchStates(h).at(-1)).toBe("play");
      expect(sent(h, "game/exited")).toEqual([]);
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);

  it("without an editor host, keeps the frame and offers Run again, which replays the run", async () => {
    const { h, plays } = await start(RAN_OUT, HELLO, "standalone");
    try {
      await click(h);
      expect(sent(h, "game/exited")).toEqual([]);
      expect(h.workerState.gameState.running).toBeTruthy();
      expect(runButton(h).mode).toBe("run-again");
      await h.controller.run();
      await settle(40);
      await h.tick(1000 / 60, 10);
      expect(plays).toHaveLength(2);
      expect(plays[1]).toEqual(plays[0]);
      expect(launchStates(h).at(-1)).toBe("play");
      expect(runButton(h).mode).toBe("stop");
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);
});

const standalone = async (source: string) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: source }],
    startFrom: { file: MAIN_URI, line: 0 },
    manualClock: true,
  });
  const doc = h.overlay.ownerDocument;
  const win = doc.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  await h.compile();
  await h.select(0);
  await settle(40);
  return h;
};

describe("PLAY in the worker ending as it starts, or failing to replay an ending", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const [last, kind] of [
    ["fin", "fin"],
    ["done", "out"],
  ] as const) {
    it(`without an editor host, offers Run again for a story that ends by ${last} as the first click starts it`, async () => {
      const h = await standalone(`scene start\n  ${last}\nend\n`);
      try {
        await h.controller.run();
        await settle(40);
        await h.tick(1000 / 60, 10);
        expect(sent(h, "game/ended").at(-1)).toEqual(
          expect.objectContaining({ kind }),
        );
        expect(launchStates(h).at(-1)).toBe("ended");
        expect(runButton(h).mode).toBe("run-again");
      } finally {
        await h.controller.destroyGameAndApp();
        h.dispose();
      }
    }, 120_000);
  }

  for (const caller of [
    "handleRestartGame",
    "run",
    "scheduleRestartGame",
    "restartGame",
  ] as const) {
    it(`returns to editing through ${caller} when the replay of an ended run cannot start`, async () => {
      const h = await standalone("scene start\n  fin\nend\n");
      try {
        expect(await h.controller.startGameAndApp()).toBe(true);
        await settle(40);
        expect(launchStates(h).at(-1)).toBe("ended");
        const request = h.link.request.bind(h.link);
        let attempted!: () => void;
        const attempt = new Promise<void>((resolve) => (attempted = resolve));
        h.link.request = ((type: any, params: any) => {
          if (type.method === PlayMessage.method) {
            attempted();
            return Promise.resolve({ built: false });
          }
          return request(type, params);
        }) as typeof h.link.request;
        if (caller === "handleRestartGame") {
          await h.controller.handleRestartGame({ id: 1, params: {} });
        } else if (caller === "run") {
          await h.controller.run();
        } else if (caller === "scheduleRestartGame") {
          h.controller.scheduleRestartGame();
          await attempt;
        } else {
          expect(await h.controller.restartGame()).toBe(false);
        }
        await settle(40);
        expect(h.controller.playing).toBe(false);
        expect(sent(h, "game/exited").map((p: any) => p.reason)).toEqual([
          "invalidated",
        ]);
        expect(runButton(h).mode).toBe("run");
      } finally {
        await h.controller.destroyGameAndApp();
        h.dispose();
      }
    }, 120_000);
  }
});
