import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle, writtenText } from "./playerHarness";

const SOURCE = `-> start

scene start
  HERO:
    The first line.

  HERO:
    The second line.

  HERO:
    The third line.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const SECOND = lineOf("The second line.");

const replace = (line: number, from: string, to: string) => [
  {
    range: {
      start: { line, character: 4 },
      end: { line, character: 4 + from.length },
    },
    text: to,
  },
];

const playing = async () => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: SECOND },
    manualClock: true,
  });
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  await h.compile();
  await h.select(SECOND);
  await settle(40);
  expect(await h.controller.startGameAndApp()).toBe(true);
  await settle(40);
  await h.tick(1000 / 60, 120);
  return h;
};

const runAfter = async (h: Awaited<ReturnType<typeof playing>>, deliver: () => Promise<unknown>) => {
  const reloadsBefore = h.toEditor.filter((m) => m.method === "game/reloaded").length;
  const app = (h.controller as any)._app;
  const destroysBefore = app.destroys;
  const routerBefore = h.toRouter.length;
  await deliver();
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await settle(40);
  return {
    reloads: h.toEditor.filter((m) => m.method === "game/reloaded").length - reloadsBefore,
    sameApp: (h.controller as any)._app === app,
    destroys: app.destroys - destroysBefore,
    playing: h.controller.playing,
    sent: h.toRouter.slice(routerBefore),
  };
};

describe("a compiled program arriving during PLAY leaves the run where the reader is (#2294)", () => {
  it("keeps the run when the scripts are unchanged", async () => {
    const h = await playing();
    try {
      const { sent, ...run } = await runAfter(h, () => h.compile());
      expect(run).toEqual({ reloads: 0, sameApp: true, destroys: 0, playing: true });
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("keeps the run when the author edited a script, and the next Restart plays the edit", async () => {
    const h = await playing();
    try {
      const { sent, ...run } = await runAfter(h, async () => {
        await h.edit(replace(SECOND, "The second line.", "The second line, edited."));
        await h.compile();
      });
      expect(run).toEqual({ reloads: 0, sameApp: true, destroys: 0, playing: true });
      expect(writtenText(sent)).not.toContain("The second line, edited.");

      const at = h.toRouter.length;
      expect(await h.controller.restartGame()).toBe(true);
      await settle(40);
      await h.tick(1000 / 60, 120);
      expect(writtenText(h.toRouter.slice(at))).toContain("The second line, edited.");
    } finally {
      h.dispose();
    }
  }, 120_000);
});
