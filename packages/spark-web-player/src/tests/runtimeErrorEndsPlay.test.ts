import { GameEncounteredRuntimeErrorMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEncounteredRuntimeError";
import { GameFinishedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameFinishedMessage";
import { ErrorType } from "@impower/spark-engine/src/game/core/enums/ErrorType";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GamePlayerController } from "../GamePlayerController";
import { createPlayerHarness, MAIN_URI, settle } from "./worker/playerHarness";

const LOCATION = {
  uri: "inmemory:///main.sd",
  range: { start: { line: 3, character: 0 }, end: { line: 3, character: 4 } },
};

const report = (type: ErrorType) =>
  GameEncounteredRuntimeErrorMessage.type.notification({
    type,
    message: "Something happened.",
    location: LOCATION,
    state: "running",
  } as any);

const controller = () => {
  const stops: unknown[][] = [];
  const holds: unknown[][] = [];
  const c = Object.create(GamePlayerController.prototype);
  c.stopGame = async (...args: unknown[]) => {
    stops.push(args);
  };
  c.holdEndedPlay = (...args: unknown[]) => {
    holds.push(args);
  };
  c.recordRuntimeError = () => {};
  return { c: c as GamePlayerController, stops, holds };
};

const listeners = () => {
  const byMethod = new Map<string, ((msg: any) => void)[]>();
  const add = (method: string, listener: (msg: any) => void) => {
    byMethod.set(method, [...(byMethod.get(method) ?? []), listener]);
    return () => {};
  };
  const emit = async (msg: any) => {
    await Promise.all((byMethod.get(msg.method) ?? []).map((l) => l(msg)));
  };
  return { add, emit };
};

const deliver = async (message: any) => {
  const { c, stops, holds } = controller();
  const { add, emit } = listeners();
  const owner = {};
  c.listenToWorker({ addListener: add } as any, owner);
  await emit(message);
  return { stops, holds, owner };
};

describe("PLAY's game in the worker", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves a runtime error's ending to the game's game/finished, and does not stop PLAY", async () => {
    expect((await deliver(report(ErrorType.Error))).stops).toEqual([]);
    expect((await deliver(report(ErrorType.Warning))).stops).toEqual([]);
  });

  it("holds PLAY on game/finished, with the ending the game reports", async () => {
    const ending = {
      kind: "error",
      location: LOCATION,
      error: { message: "boom", location: LOCATION },
    } as const;
    const { stops, holds, owner } = await deliver(
      GameFinishedMessage.type.notification(ending),
    );
    expect(stops).toEqual([]);
    expect(holds).toEqual([[owner, ending]]);
  });
});

describe("PLAY in the worker ended by a runtime error", () => {
  const SOURCE = `scene start\n  The first line.\n  The second line.\n  The third line.\nend\n`;

  it("leaves the editor on the line the error names once STOP ends it", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: 1 },
    });
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    const error = console.error;
    console.error = () => {};
    try {
      await h.compile();
      await h.select(1);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(10);
      h.workspace.selections.length = 0;
      const game = h.workerState.gameState.running! as any;
      game.Error("boom", ErrorType.Error, null);
      for (let i = 0; i < 100 && !h.toEditor.some((m) => m.method === "game/ended"); i++) {
        await settle(2);
      }
      const ended = h.toEditor.find((m) => m.method === "game/ended");
      expect(ended?.params?.kind).toBe("error");
      expect(ended?.params?.error?.message).toBe("boom");
      expect(h.toEditor.some((m) => m.method === "game/exited")).toBe(false);
      expect(h.workspace.selections).toEqual([]);
      const errorAt = ended!.params.error.location;
      await h.controller.handleStopGame({ id: 1, params: {} });
      await settle(10);
      const exited = h.toEditor.find((m) => m.method === "game/exited");
      expect(exited?.params).toEqual({ reason: "error" });
      expect(h.workspace.selections.map((s: any) => s.selectedRange)).toEqual([
        errorAt.range,
      ]);
    } finally {
      console.error = error;
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});
