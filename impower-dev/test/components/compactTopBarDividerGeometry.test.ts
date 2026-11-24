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

let coarse = false;

vi.stubGlobal("matchMedia", (query: string) => {
  const list = {
    media: query,
    get matches() {
      if (query.includes("pointer: coarse")) return coarse;
      const minWidth = /^\(min-width: (\d+)px\)$/.exec(query);
      return minWidth ? 768 >= Number(minWidth[1]) : false;
    },
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  return list as unknown as MediaQueryList;
});
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { SidebarLayout } = await import("@impower/impower-ui/components");
const { default: TopBar } =
  await import("../../src/modules/spark-editor/components/desktop-shell/TopBar");
const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { stateForRoute } =
  await import("../../src/modules/spark-editor/workspace/routes");

const UI_PACKAGE = resolve(process.cwd(), "../packages/impower-ui");
const RAIL = 76;
const WIDE_RAIL = 232;

const barMarkup = async (mode: "reading" | "editing", rail: number) => {
  workspace.state.value = stateForRoute(
    workspace.state.value as WorkspaceCache,
    "story",
  );
  workspace.scriptMode.value = mode;
  const host = document.body.appendChild(document.createElement("div"));
  try {
    await act(async () =>
      render(
        h(SidebarLayout, {
          header: h(TopBar, null),
          sidebar: null,
          width: rail,
          defaultWidth: WIDE_RAIL,
          minWidth: 180,
          maxWidth: 400,
          collapsedWidth: RAIL,
          onWidthChange: () => {},
          resizeLabel: "Resize",
        }),
        host,
      ),
    );
    return {
      layout: document.documentElement.dataset["layout"],
      markup: host.querySelector("header")!.outerHTML,
    };
  } finally {
    await act(async () => render(null, host));
    host.remove();
    workspace.scriptMode.value = "reading";
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

const measure = async (
  bar: { layout: string | undefined; markup: string },
  touch: boolean,
) => {
  const css = await stylesFor(bar.markup);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 768, height: 1024 },
      isMobile: touch,
      hasTouch: touch,
    });
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="${bar.layout}"><head><style>${css}</style></head><body style="margin:0">${bar.markup}</body></html>`,
    );
    return await page.evaluate(() => {
      const box = (el: Element | null | undefined) => {
        if (!el) return null;
        const { left, right, top, bottom, width, height } =
          el.getBoundingClientRect();
        return { left, right, top, bottom, width, height };
      };
      const header = document.querySelector("header")!;
      const divider = header.querySelector("[data-title-divider]");
      const folded = header.querySelector("[data-script-header-folded]");
      const status = folded?.querySelector("button");
      return {
        bar: box(header),
        logo: box(header.firstElementChild?.querySelector("svg")),
        divider: box(divider),
        status: box(status),
        glyph: box(status?.querySelector("svg")),
        dividerColor: divider ? getComputedStyle(divider).backgroundColor : null,
        edgeColor: (() => {
          const probe = document.createElement("span");
          probe.className = "bg-edge";
          document.body.appendChild(probe);
          const color = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return color;
        })(),
      };
    });
  } finally {
    await browser.close();
  }
};

describe("the tablet title bar's divider while a script is edited", () => {
  it.each([
    ["the icon rail", RAIL],
    ["the wide rail", WIDE_RAIL],
  ] as const)(
    "with %s, a short 1px edge-coloured divider stands 14px from the app icon and 14px from the script's status icon",
    async (_, rail) => {
      const editing = await barMarkup("editing", rail);
      expect(editing.layout).toBe("compact");
      const bar = await measure(editing, false);
      const { logo, divider, glyph } = bar;
      expect(logo && divider && glyph).toBeTruthy();
      expect(divider!.width).toBe(1);
      expect(divider!.height).toBeLessThan(bar.bar!.height / 2);
      expect(Math.round(divider!.left - logo!.right)).toBe(14);
      expect(Math.round(glyph!.left - divider!.right)).toBe(14);
      expect(bar.dividerColor).toBe(bar.edgeColor);

      const reading = await measure(await barMarkup("reading", rail), false);
      expect(reading.divider).toBeNull();
      expect(reading.logo!.left).toBe(logo!.left);
    },
    60000,
  );

  it("under a coarse pointer the status icon keeps a 44px target clear of the app icon", async () => {
    coarse = true;
    try {
      const bar = await measure(await barMarkup("editing", RAIL), true);
      expect(bar.status!.width).toBeGreaterThanOrEqual(44);
      expect(bar.status!.height).toBeGreaterThanOrEqual(44);
      expect(bar.status!.left).toBeGreaterThanOrEqual(bar.logo!.right);
    } finally {
      coarse = false;
    }
  }, 60000);
});
