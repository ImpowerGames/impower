// With the switch on, PLAY's game sends the page its stream on a
// `BroadcastChannel` of the page's sink rather than on the connection the
// workspace compiles through. After input, Chromium holds a message from a
// worker or a port until the page has rendered its next frame, which put a
// median of 8 ms between a click and the game's answer; a broadcast
// channel's messages are not held (#811).
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `-> start

scene start
  HERO:
    The first line.

  HERO:
    The second line.
end
`;

const FIRST = SOURCE.split("\n").findIndex((l) => l.includes("The first line."));

/** STOP waits a frame between its steps, which this page does not draw. */
const framesForStop = (h: { overlay: HTMLElement }) => {
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
};

describe("PLAY's stream from the worker", () => {
  it("reaches the page on the sink's channel, and never on the connection", async () => {
    const h = await createPlayerHarness({
      workerDisplays: true,
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
      manualClock: true,
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(FIRST);
      await settle(40);
      const before = h.toPage.length;

      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(40);
      await h.tick(1000 / 60, 60);

      const fromGame = h.toPage.slice(before).filter((m) => typeof m.epoch === "number");
      const onChannel = new Set(h.onChannel);
      // The game showed its line, and all it sent for that came on the
      // channel.
      expect(h.overlay.textContent).toContain("The first line.");
      expect(fromGame.length).toBeGreaterThan(0);
      expect(fromGame.filter((m) => !onChannel.has(m))).toEqual([]);
    } finally {
      h.dispose();
    }
  }, 60_000);

  it("gives each run a channel of its own, which STOP closes", async () => {
    const h = await createPlayerHarness({
      workerDisplays: true,
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
      manualClock: true,
    });
    framesForStop(h);
    const names: string[] = [];
    const request = h.link.request.bind(h.link);
    (h.link as any).request = (type: any, params: any) => {
      if (params?.channel) names.push(params.channel);
      return request(type, params);
    };
    try {
      await h.compile();
      await h.select(FIRST);
      await settle(40);

      for (let run = 0; run < 2; run++) {
        expect(await h.controller.startGameAndApp()).toBe(true);
        await settle(40);
        await h.tick(1000 / 60, 10);
        await h.controller.stopGame("quit");
        await settle(40);
      }
      expect(names).toHaveLength(2);
      expect(names[0]).not.toBe(names[1]);

      // A message on a stopped run's channel reaches nothing on the page.
      const heard: unknown[] = [];
      h.link.addListener("ui/update", (m) => heard.push(m));
      const stale = new BroadcastChannel(names[0]!);
      stale.postMessage({ jsonrpc: "2.0", method: "ui/update", params: {}, epoch: 1 });
      stale.close();
      await settle(10);
      expect(heard).toEqual([]);
    } finally {
      h.dispose();
    }
  }, 60_000);
});
