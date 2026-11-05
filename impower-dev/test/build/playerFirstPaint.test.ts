import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { withThemeVariables } from "../../../sparkdown-player-app/src/build/withThemeVariables";

const PLAYER_HTML = resolve("../sparkdown-player-app/index.html");
const THEME_CSS = resolve("../packages/impower-ui/src/theme.css");

const servedPlayerHtml = () =>
  withThemeVariables(
    readFileSync(PLAYER_HTML, "utf8"),
    readFileSync(THEME_CSS, "utf8"),
  );

const rgba = (color: string, win: Window) => {
  const probe = win.document.createElement("div");
  probe.style.color = color;
  win.document.body.append(probe);
  const resolved = win.getComputedStyle(probe).color;
  probe.remove();
  const parts = resolved.match(/[\d.]+/g)?.map(Number) ?? [];
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1, resolved };
};

const substituteVariable = (value: string, element: Element, win: Window) => {
  const reference = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  return reference
    ? win.getComputedStyle(element).getPropertyValue(reference[1]!).trim()
    : value;
};

describe("the player's document before its stylesheet and script run", () => {
  it("paints an opaque dark background on its root", () => {
    const dom = new JSDOM(servedPlayerHtml());
    const win = dom.window as unknown as Window;
    const root = win.document.documentElement;
    const background = substituteVariable(
      win.getComputedStyle(root).backgroundColor,
      root,
      win,
    );
    expect(background).not.toBe("");
    const { r, g, b, a, resolved } = rgba(background, win);
    expect(resolved).toMatch(/^rgba?\(/);
    expect(a).toBe(1);
    expect((0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255).toBeLessThan(0.2);
  });
});
