import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import { compile } from "@tailwindcss/node";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const { default: PhoneTitleBar } =
  await import("../../src/modules/spark-editor/components/desktop-shell/PhoneTitleBar");
const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { stateForRoute } =
  await import("../../src/modules/spark-editor/workspace/routes");

const UI_PACKAGE = resolve(process.cwd(), "../packages/impower-ui");

const browserAvailable = existsSync(chromium.executablePath());

const markupOn = async (route: "write" | "collection") => {
  const state = stateForRoute(workspace.state.value as WorkspaceCache, route);
  workspace.state.value = {
    ...state,
    project: { ...state.project, name: "The Midnight Jukebox" },
    sync: { ...state.sync, status: "cached" },
  } as WorkspaceCache;
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(PhoneTitleBar, { scrolled: false }), host));
  const markup = host.innerHTML;
  await act(async () => render(null, host));
  host.remove();
  return markup;
};

const stylesFor = async (markup: string) => {
  const compiler = await compile('@import "./src/style.css";', {
    base: UI_PACKAGE,
    onDependency: () => {},
  });
  const candidates = [...markup.matchAll(/class="([^"]*)"/g)].flatMap(
    (match) => match[1]!.replace(/&amp;/g, "&").split(/\s+/),
  );
  return compiler.build(candidates);
};

const measure = async (markup: string, width: number) => {
  const css = await stylesFor(markup);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height: 780 },
      isMobile: true,
      hasTouch: true,
    });
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="phone"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0">${markup}</body></html>`,
    );
    return await page.evaluate(() => {
      const bar = document.querySelector("[data-phone-title-bar]")!;
      const box = (selector: string) =>
        bar.querySelector(selector)!.getBoundingClientRect();
      const centre = (label: string) => {
        const r = box(`button[aria-label="${label}"]`);
        return r.x + r.width / 2;
      };
      const name = box('input[aria-label="Project name"]');
      const status = box(".fade-edge-over");
      const logo = box('[aria-label="Spark Engine"] svg');
      const logoBox = bar
        .querySelector('[aria-label="Spark Engine"]')!
        .parentElement!.getBoundingClientRect();
      return {
        logo: { x: logo.x, width: logo.width, height: logo.height },
        logoBox: { width: logoBox.width, height: logoBox.height },
        name: { x: name.x, top: name.top, height: name.height },
        statusX: status.x,
        search: centre("Search"),
        menu: centre("App menu"),
      };
    });
  } finally {
    await browser.close();
  }
};

const rounded = (value: number) => Math.round(value * 10) / 10;

describe.skipIf(!browserAvailable)(
  "the phone title bar against the Folio prototype",
  () => {
    it.each([
      [430, 347, 398],
      [360, 277, 328],
    ])(
      "at %ipx on a page other than the Story, sits on the prototype's 10px inset with 7px gaps",
      async (width, search, menu) => {
        const bar = await measure(await markupOn("collection"), width);
        expect(bar.logoBox).toEqual({ width: 44, height: 44 });
        expect(bar.logo).toEqual({ x: 20, width: 24, height: 30 });
        expect(bar.name.x).toBe(61);
        expect(rounded(bar.name.height)).toBe(15.6);
        expect(bar.statusX).toBe(61);
        expect([bar.search, bar.menu]).toEqual([search, menu]);
      },
      60000,
    );

    it.each([
      [430, 360, 404],
      [360, 290, 334],
    ])(
      "at %ipx on the Story, the bar that carries the edit history, sits on the prototype's 8px and 4px inset with no gap",
      async (width, search, menu) => {
        const bar = await measure(await markupOn("write"), width);
        expect(bar.logo.x).toBe(18);
        expect(bar.name.x).toBe(56);
        expect(bar.statusX).toBe(56);
        expect([bar.search, bar.menu]).toEqual([search, menu]);
      },
      60000,
    );
  },
);
