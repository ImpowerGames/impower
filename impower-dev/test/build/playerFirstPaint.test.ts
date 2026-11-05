// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { resolveConfig, type IndexHtmlTransformContext } from "vite";
import { describe, expect, it } from "vitest";

const PLAYER_ROOT = resolve("../sparkdown-player-app");
const PLAYER_HTML = resolve(PLAYER_ROOT, "index.html");

const servedPlayerHtml = async (): Promise<string> => {
  const config = await resolveConfig(
    {
      root: PLAYER_ROOT,
      configFile: resolve(PLAYER_ROOT, "vite.config.ts"),
      logLevel: "silent",
    },
    "serve",
    "development",
  );
  const context = {
    path: "/index.html",
    filename: PLAYER_HTML,
  } as IndexHtmlTransformContext;
  let html = readFileSync(PLAYER_HTML, "utf8");
  for (const plugin of config.plugins) {
    const hook = plugin.transformIndexHtml;
    if (!hook || typeof hook === "function" || hook.order !== "pre") {
      continue;
    }
    const result = await hook.handler.call(
      {} as never,
      html,
      context,
    );
    if (typeof result !== "string") {
      throw new Error(`${plugin.name} returned tags; this test reads strings`);
    }
    html = result;
  }
  return html;
};

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
  it("paints an opaque dark background on its root", async () => {
    const dom = new JSDOM(await servedPlayerHtml());
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
