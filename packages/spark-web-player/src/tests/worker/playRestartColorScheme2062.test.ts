import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `define a as image with
  src = "https://example.com/a.png"
end

scene start
  HERO:
    [[a]]
    The first line.

  HERO:
    [[a]]
    The second line.

  HERO:
    The third line.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));

const scheme = (overlay: HTMLElement) => overlay.getAttribute("data-color-scheme");

const watchSchemes = (overlay: HTMLElement) => {
  const win = overlay.ownerDocument.defaultView as any;
  const seen: (string | null)[] = [scheme(overlay)];
  const observer = new win.MutationObserver(() => seen.push(scheme(overlay)));
  observer.observe(overlay, { subtree: true, childList: true, attributes: true, characterData: true });
  return { seen, stop: () => observer.disconnect() };
};

const simulate = (h: any, colorScheme: "light" | "dark", id: number) =>
  h.controller.handleSetSimulatedColorScheme({
    jsonrpc: "2.0",
    id,
    method: "game/setSimulatedColorScheme",
    params: { color_scheme: colorScheme },
  });

const playing = async () => {
  const second = lineOf("The second line.");
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: second },
    manualClock: true,
  });
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  await h.compile();
  await h.select(second);
  await settle(40);
  await simulate(h, "dark", 1);
  expect(await h.controller.startGameAndApp()).toBe(true);
  await settle(40);
  await h.tick(1000 / 60, 120);
  const reloads = () => h.toEditor.filter((m: any) => m.method === "game/reloaded").length;
  const edit = async (text: string, from: string, to: string, during?: () => Promise<void>) => {
    const line = lineOf(text);
    const character = SOURCE.split("\n")[line]!.indexOf(from);
    const before = reloads();
    await h.edit([
      {
        range: { start: { line, character }, end: { line, character: character + from.length } },
        text: to,
      },
    ]);
    await h.compile();
    await during?.();
    for (let i = 0; i < 200 && reloads() <= before; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(reloads()).toBeGreaterThan(before);
    await settle(40);
    await h.tick(1000 / 60, 120);
  };
  return { h, edit };
};

describe("an edit restart during PLAY and the preview's colour scheme together (#2062, #2117)", () => {
  it("keeps the simulated dark scheme on every frame of an edit restart", async () => {
    const { h, edit } = await playing();
    try {
      expect(scheme(h.overlay)).toBe("dark");
      const frames = watchSchemes(h.overlay);
      await edit("The third line.", "third", "last");
      frames.stop();
      expect(frames.seen.length).toBeGreaterThan(1);
      expect(frames.seen.filter((s) => s !== "dark")).toEqual([]);
      expect(h.overlay.querySelectorAll(".dialogue .text_letter").length).toBeGreaterThan(0);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("applies a scheme message that arrives while the restart's composition is held, and keeps it after the first beat", async () => {
    const { h, edit } = await playing();
    try {
      await simulate(h, "light", 2);
      expect(scheme(h.overlay)).toBe("light");
      await edit("The third line.", "third", "last", async () => {
        await simulate(h, "dark", 3);
        expect(scheme(h.overlay)).toBe("dark");
      });
      expect(scheme(h.overlay)).toBe("dark");
      expect(h.overlay.querySelectorAll(".dialogue .text_letter").length).toBeGreaterThan(0);
    } finally {
      h.dispose();
    }
  }, 120_000);
});
