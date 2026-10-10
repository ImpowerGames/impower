import { describe, expect, it, vi } from "vitest";
import { GamePlayerController } from "../GamePlayerController";
import { createPlayerHarness, MAIN_URI } from "./worker/playerHarness";

describe("preview startup before a webview audio gesture (#1762)", () => {
  it("builds the preview while resume is pending, then adopts audio when it resumes", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: "-> START\nscene START\n  Hello.\nend\n" }],
      startFrom: { file: MAIN_URI, line: 2 },
    });
    let resume!: () => void;
    const pending = new Promise<void>(resolve => { resume = resolve; });
    const context = { state: "suspended", resume: vi.fn(() => pending) };
    h.controller._audioContext = context;
    // ensureAudioContext is a per-instance arrow function, so take the real
    // implementation from a fresh controller instead of the harness override.
    const real = new GamePlayerController(h.overlay, {} as never);
    (real as any)._audioContext = context;
    h.controller.ensureAudioContext = real.ensureAudioContext;
    let app: any;
    const create = h.controller.createApp;
    h.controller.createApp = (...args: any[]) => {
      app = create(...args);
      (real as any)._app = app;
      app.setAudioContext = vi.fn();
      return app;
    };
    const building = h.controller.buildWorkerApp(h.link);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const completed = await Promise.race([
        building.then(() => true),
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 2000); }),
      ]);
      expect(completed, "preview waited for a gesture-gated AudioContext.resume() promise").toBe(true);
      expect(context.resume).toHaveBeenCalled();
      context.state = "running";
      resume();
      await pending;
      await Promise.resolve();
      expect(app.setAudioContext).toHaveBeenCalledWith(context);
    } finally {
      clearTimeout(timer);
      resume();
      await building;
      h.dispose();
    }
  }, 15000);
});
