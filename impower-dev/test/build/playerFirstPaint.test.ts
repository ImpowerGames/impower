import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const PLAYER_HTML = resolve("../sparkdown-player-app/index.html");

const rgba = (color: string, win: Window) => {
  const probe = win.document.createElement("div");
  probe.style.color = color;
  win.document.body.append(probe);
  const resolved = win.getComputedStyle(probe).color;
  probe.remove();
  const parts = resolved.match(/[\d.]+/g)?.map(Number) ?? [];
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1, resolved };
};

describe("the player's document before its stylesheet and script run", () => {
  it("paints an opaque dark background on its root", () => {
    const dom = new JSDOM(readFileSync(PLAYER_HTML, "utf8"));
    const win = dom.window as unknown as Window;
    const background = win.getComputedStyle(
      win.document.documentElement,
    ).backgroundColor;
    expect(background).not.toBe("");
    const { r, g, b, a, resolved } = rgba(background, win);
    expect(resolved).toMatch(/^rgba?\(/);
    expect(a).toBe(1);
    expect((0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255).toBeLessThan(0.2);
  });
});
