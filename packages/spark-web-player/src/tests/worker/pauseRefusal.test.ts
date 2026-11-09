import { describe, expect, it, vi } from "vitest";
import { PauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/PauseGameMessage";
import { UnpauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/UnpauseGameMessage";
import { GamePlayerController } from "../../GamePlayerController";

const controllerWith = (paused: boolean, ask: () => Promise<unknown>) => {
  const host = document.createElement("div");
  const controller = new GamePlayerController(host, {} as never) as any;
  const play = { state: "running", run: 7 };
  const app = {
    paused,
    pause() {
      this.paused = true;
    },
    unpause() {
      this.paused = false;
    },
  };
  controller._workerPlay = play;
  controller._appPlay = play;
  controller._app = app;
  controller.askWorkerGame = ask;
  const published: boolean[] = [];
  host.addEventListener("jsonrpc", (event) => {
    const message = (event as CustomEvent).detail;
    if (message.method === "preview/didChangeGameState") {
      published.push(message.params.paused);
    }
  });
  return { controller, app, published };
};

const refused = () => Promise.reject(new Error("worker refused"));

describe("a pause the worker refuses", () => {
  it("leaves a playing app playing and says so", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { controller, app, published } = controllerWith(false, refused);
      const answer = await controller.handlePauseGame(PauseGameMessage.type.request({}));
      expect(answer.error?.message).toBe("no game loaded");
      expect(app.paused).toBe(false);
      expect(published).toEqual([false]);
    } finally {
      errors.mockRestore();
    }
  });

  it("leaves an app that was already paused paused", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { controller, app } = controllerWith(true, refused);
      await controller.handlePauseGame(PauseGameMessage.type.request({}));
      expect(app.paused).toBe(true);
    } finally {
      errors.mockRestore();
    }
  });

  it("leaves a paused app paused when Unpause is refused", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { controller, app, published } = controllerWith(true, refused);
      const answer = await controller.handleUnpauseGame(UnpauseGameMessage.type.request({}));
      expect(answer.error?.message).toBe("no game loaded");
      expect(app.paused).toBe(true);
      expect(published).toEqual([true]);
    } finally {
      errors.mockRestore();
    }
  });

  it("changes the app when the worker accepts", async () => {
    const pausing = controllerWith(false, async () => ({}));
    await pausing.controller.handlePauseGame(PauseGameMessage.type.request({}));
    expect(pausing.app.paused).toBe(true);
    const resuming = controllerWith(true, async () => ({}));
    await resuming.controller.handleUnpauseGame(UnpauseGameMessage.type.request({}));
    expect(resuming.app.paused).toBe(false);
  });
});
