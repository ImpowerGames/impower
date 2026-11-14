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

const LONG_NAME =
  "The Extraordinarily Long Midnight Jukebox Story of Raffles X";

const markupOn = async (
  route: "write" | "collection",
  name = "The Midnight Jukebox",
) => {
  const state = stateForRoute(workspace.state.value as WorkspaceCache, route);
  workspace.state.value = {
    ...state,
    project: { ...state.project, name },
    sync: { ...state.sync, status: "cached" },
  } as WorkspaceCache;
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(PhoneTitleBar, { scrolled: false }), host));
  const field = host.querySelector<HTMLInputElement>(
    'input[aria-label="Project name"]',
  )!;
  field.setAttribute("value", field.value);
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
      const input = bar.querySelector<HTMLInputElement>(
        'input[aria-label="Project name"]',
      )!;
      const name = input.getBoundingClientRect();
      const nameStyle = getComputedStyle(input);
      const status = box(".fade-edge-over");
      const statusStyle = getComputedStyle(
        bar.querySelector('[role="status"] button')!,
      );
      const statusRow = box('[role="status"]');
      const logo = box('[aria-label="Spark Engine"] svg');
      const logoBox = bar
        .querySelector('[aria-label="Spark Engine"]')!
        .parentElement!.getBoundingClientRect();
      return {
        logo: { x: logo.x, width: logo.width, height: logo.height },
        logoBox: { width: logoBox.width, height: logoBox.height },
        name: {
          x: name.x,
          right: name.right,
          height: name.height,
          font: `${nameStyle.fontSize}/${nameStyle.lineHeight}`,
          mask: nameStyle.maskImage,
          overflows: input.scrollWidth > input.clientWidth,
        },
        statusX: status.x,
        status: {
          font: `${statusStyle.fontSize}/${statusStyle.lineHeight}`,
          height: statusRow.height,
        },
        searchLeft: box('button[aria-label="Search"]').x,
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
        expect(bar.name.font).toBe("12px/15.6px");
        expect(bar.statusX).toBe(61);
        expect(bar.status.font).toBe("11px/15.4px");
        expect(rounded(bar.status.height)).toBe(15.4);
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

    it.each([
      [430, "collection", 61, 347, 398],
      [360, "collection", 61, 277, 328],
      [430, "write", 56, 360, 404],
      [360, "write", 56, 290, 334],
    ] as const)(
      "at %ipx on %s, a 60-character name fades on one line and leaves the buttons where they were",
      async (width, route, x, search, menu) => {
        const bar = await measure(await markupOn(route, LONG_NAME), width);
        expect(bar.name.x).toBe(x);
        expect(rounded(bar.name.height)).toBe(15.6);
        expect(bar.name.overflows).toBe(true);
        expect(bar.name.mask).toBe(
          "linear-gradient(to right, rgb(0, 0, 0) calc(100% - 24px), rgba(0, 0, 0, 0))",
        );
        expect(bar.name.right).toBeLessThanOrEqual(bar.searchLeft);
        expect([bar.search, bar.menu]).toEqual([search, menu]);
      },
      60000,
    );
  },
);
