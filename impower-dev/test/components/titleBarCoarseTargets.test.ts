import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import { compile } from "@tailwindcss/node";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: {} },
}));

let width = 768;
const lists: (() => void)[] = [];

vi.stubGlobal("matchMedia", (query: string) => {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const list = {
    media: query,
    get matches() {
      const minWidth = /^\(min-width: (\d+)px\)$/.exec(query);
      return minWidth ? width >= Number(minWidth[1]) : false;
    },
    onchange: null,
    addEventListener: (
      _: string,
      listener: (event: { matches: boolean }) => void,
    ) => listeners.add(listener),
    removeEventListener: (
      _: string,
      listener: (event: { matches: boolean }) => void,
    ) => listeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  lists.push(() =>
    listeners.forEach((listener) => listener({ matches: list.matches })),
  );
  return list as unknown as MediaQueryList;
});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { default: TopBar } =
  await import("../../src/modules/spark-editor/components/desktop-shell/TopBar");
const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { stateForRoute } =
  await import("../../src/modules/spark-editor/workspace/routes");
const { default: problems } =
  await import("../../src/modules/spark-editor/workspace/problems/ProblemsStore");
const { auditScan } =
  await import("../../../.agents/skills/drive-web-editor/audit-page.mjs");

const UI_PACKAGE = resolve(process.cwd(), "../packages/impower-ui");

const resize = async (next: number) => {
  width = next;
  await act(async () => {
    lists.forEach((fire) => fire());
  });
};

const markupOn = async (route: "story" | "assets", viewport: number) => {
  await resize(viewport);
  const state = stateForRoute(workspace.state.value as WorkspaceCache, route);
  workspace.state.value = {
    ...state,
    project: { ...state.project, name: "The Midnight Jukebox" },
    sync: { ...state.sync, status: "cached" },
  } as WorkspaceCache;
  const range = {
    start: { line: 1, character: 0 },
    end: { line: 1, character: 4 },
  };
  await act(async () => {
    problems.diagnostics.value = {
      "file:///local/main.sd": [
        { range, severity: 1, message: "Cannot find character" },
        { range, severity: 2, message: "This sound is not in Assets yet" },
      ],
    } as typeof problems.diagnostics.value;
  });
  const host = document.body.appendChild(document.createElement("div"));
  try {
    await act(async () => render(h(TopBar, null), host));
    const field = host.querySelector<HTMLInputElement>(
      'input[aria-label="Project name"]',
    )!;
    field.setAttribute("value", field.value);
    return {
      layout: document.documentElement.dataset["layout"],
      markup: host.innerHTML,
    };
  } finally {
    await act(async () => render(null, host));
    host.remove();
    await act(async () => {
      problems.diagnostics.value = {};
    });
  }
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

const probe = async (
  bar: { layout: string | undefined; markup: string },
  viewport: number,
  touch: boolean,
) => {
  const css = await stylesFor(bar.markup);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: viewport, height: 1024 },
      isMobile: touch,
      hasTouch: touch,
    });
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="${bar.layout}" style="--sidebar-width: 232px"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0">${bar.markup}<main style="height:800px"><button style="width:100%;height:100%">Content</button></main></body></html>`,
    );
    const scan = await page.evaluate(auditScan, {
      parts: ["targets"],
      coarse: true,
      minTarget: 44,
    });
    const header = (
      scan.targets as { where: string; name: string; hit: string }[]
    ).filter((target) => target.where.startsWith("header:"));
    return {
      coarse: await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      height: await page.evaluate(
        () => document.querySelector("header")!.getBoundingClientRect().height,
      ),
      toastTop: await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--toast-top")
          .trim(),
      ),
      toastHeight: await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--toast-height")
          .trim(),
      ),
      hit: Object.fromEntries(header.map((target) => [target.name, target.hit])),
    };
  } finally {
    await browser.close();
  }
};

describe("the title bar's name and status under a coarse pointer", () => {
  it.each([
    ["story", 768, "compact", ["Project name", "Saved in this browser.", "Show problems"]],
    ["assets", 768, "compact", ["Project name", "Saved in this browser.", "Show problems"]],
    ["story", 1366, "desktop", ["Project name", "Saved in this browser."]],
    ["assets", 1366, "desktop", ["Project name", "Saved in this browser."]],
  ] as const)(
    "on %s at %ipx (%s) with touch, the bar is 90px and each text control takes a tap anywhere in 44x44",
    async (route, viewport, layout, names) => {
      const markup = await markupOn(route, viewport);
      expect(markup.layout).toBe(layout);
      const bar = await probe(markup, viewport, true);
      expect(bar.coarse).toBe(true);
      expect(bar.hit).toMatchObject(
        Object.fromEntries(names.map((name) => [name, "44x44"])),
      );
      expect(bar.height).toBe(90);
      expect(bar.toastHeight).toBe("90px");
      expect(bar.toastTop).toBe("0px");
    },
    60000,
  );

  it.each([
    [768, "compact", 54],
    [1366, "desktop", 76],
  ] as const)(
    "with a mouse at %ipx (%s), the bar keeps its %ipx height",
    async (viewport, layout, height) => {
      const markup = await markupOn("story", viewport);
      expect(markup.layout).toBe(layout);
      const bar = await probe(markup, viewport, false);
      expect(bar.coarse).toBe(false);
      expect(bar.height).toBe(height);
      expect(bar.toastHeight).toBe(`${height}px`);
      expect(bar.toastTop).toBe("0px");
    },
    60000,
  );
});
