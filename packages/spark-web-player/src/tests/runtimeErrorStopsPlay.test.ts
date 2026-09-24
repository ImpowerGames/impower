// #815 — a runtime warning marks something the runtime recovered from, so it
// leaves PLAY running; a runtime error ends it and leaves the editor on the
// line the error names. PLAY's game runs in the worker, whose reports the
// controller relays through `listenToWorker`.
import { GameEncounteredRuntimeErrorMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEncounteredRuntimeError";
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

/** A controller whose `stopGame` only records how it was asked to stop. */
const controller = () => {
  const stops: unknown[][] = [];
  const c = Object.create(GamePlayerController.prototype);
  c.stopGame = async (...args: unknown[]) => {
    stops.push(args);
  };
  return { c: c as GamePlayerController, stops };
};

/** Listeners by method, as a game's outgoing connection or a worker link
 *  holds them. */
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

/** Wire a running game in the worker to a fresh controller, and deliver one
 *  report of `type`. */
const deliver = async (type: ErrorType) => {
  const { c, stops } = controller();
  const { add, emit } = listeners();
  c.listenToWorker({ addListener: add } as any, () => "running");
  await emit(report(type));
  return stops;
};

describe("PLAY's game in the worker", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stops on a runtime error, with the error's message and location", async () => {
    expect(await deliver(ErrorType.Error)).toEqual([
      ["error", { message: "Something happened.", location: LOCATION }],
    ]);
  });

  it("keeps running through a runtime warning", async () => {
    expect(await deliver(ErrorType.Warning)).toEqual([]);
  });
});

describe("PLAY in the worker stopped by a runtime error", () => {
  const SOURCE = `The first line.\nThe second line.\nThe third line.\n`;

  it("leaves the editor on the line the error names", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: 0 },
    });
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    const error = console.error;
    console.error = () => {};
    // The line a handler's function raised its error on, which is not a line
    // the story has executed.
    const raisedAt = {
      uri: MAIN_URI,
      range: { start: { line: 2, character: 0 }, end: { line: 2, character: 15 } },
    };
    try {
      await h.compile();
      await h.select(0);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(10);
      h.workspace.selections.length = 0;
      await h.workerState.gameState.running!.connection.emit(
        GameEncounteredRuntimeErrorMessage.type.notification({
          type: ErrorType.Error,
          message: "boom",
          location: raisedAt,
          state: "running",
        } as any),
      );
      for (let i = 0; i < 100 && !h.toEditor.some((m) => m.method === "game/exited"); i++) {
        await settle(2);
      }
      await settle(10);
      const exited = h.toEditor.find((m) => m.method === "game/exited");
      expect(exited?.params).toEqual({
        reason: "error",
        error: { message: "boom", location: raisedAt },
      });
      expect(h.workspace.selections.map((s: any) => s.selectedRange)).toEqual([
        raisedAt.range,
      ]);
    } finally {
      console.error = error;
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});
