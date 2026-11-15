import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import { compile } from "@tailwindcss/node";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { h, render, type VNode } from "preact";
import { act } from "preact/test-utils";
import { beforeAll, describe, expect, it } from "vitest";

let mediaMatches: (query: string) => boolean = () => false;
const mediaListeners = new Set<() => void>();

const setMedia = async (matches: (query: string) => boolean) => {
  mediaMatches = matches;
  await act(async () => mediaListeners.forEach((listener) => listener()));
};

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    get matches() {
      return mediaMatches(query);
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
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

const ui = await import("@impower/impower-ui/components");
const { default: Trail } = await import("../../src/modules/spark-editor/components/library-page/Trail");
const { default: AssetRowMenu } = await import("../../src/modules/spark-editor/components/assets/AssetRowMenu");
const { default: TopBar } = await import("../../src/modules/spark-editor/components/desktop-shell/TopBar");
const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { stateForRoute } = await import("../../src/modules/spark-editor/workspace/routes");

const UI_PACKAGE = resolve(process.cwd(), "../packages/impower-ui");

type Theme = "charcoal" | "chalk";
type Layout = "phone" | "compact" | "desktop";

const markupOf = async (node: VNode) => {
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host));
  for (const field of host.querySelectorAll("input")) {
    field.setAttribute("value", field.value);
  }
  const markup = document.body.innerHTML;
  await act(async () => render(null, host));
  host.remove();
  document.body.innerHTML = "";
  return markup;
};

const stylesFor = async (markup: string) => {
  const compiler = await compile('@import "./src/style.css";', { base: UI_PACKAGE, onDependency: () => {} });
  const candidates = [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
    match[1]!.replace(/&amp;/g, "&").split(/\s+/),
  );
  return compiler.build(candidates);
};

const inChromium = async <T>(
  node: VNode,
  { width, theme = "charcoal", layout = "desktop", touch = false }: { width: number; theme?: Theme; layout?: Layout; touch?: boolean },
  read: () => T,
): Promise<T> => {
  const markup = await markupOf(node);
  const css = await stylesFor(markup);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: touch, hasTouch: touch });
    await page.setContent(
      `<!doctype html><html data-theme="${theme}" data-layout="${layout}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0">${markup}</body></html>`,
    );
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    return (await page.evaluate(read)) as T;
  } finally {
    await browser.close();
  }
};

const THEMES: Theme[] = ["charcoal", "chalk"];

describe("Assets page parts against the Folio prototype (I-2415)", () => {
  it.each(THEMES)("N6: the Show as control in %s has no fill and no gap, so its second pill follows the first directly", async (theme) => {
    const measured = await inChromium(
      h(ui.ChoiceGroup, {
        size: "small",
        fill: "tint",
        name: "form",
        "aria-label": "Show as",
        options: [
          { value: "portrait", label: "Portrait" },
          { value: "image", label: "Image path" },
        ],
        value: "portrait",
        onValueChange: () => {},
      }),
      { width: 1440, theme },
      () => {
        const group = document.querySelector('[role="radiogroup"]')!;
        const pills = [...group.querySelectorAll("label")].map((label) => label.getBoundingClientRect());
        const box = group.getBoundingClientRect();
        return {
          fill: getComputedStyle(group).backgroundColor,
          firstInset: pills[0]!.x - box.x,
          between: pills[1]!.x - pills[0]!.right,
        };
      },
    );
    expect(measured).toEqual({ fill: "rgba(0, 0, 0, 0)", firstInset: 3, between: 0 });
  });

  it("21: the Face menu is 196 wide with a 1px border, 182px items and the check 12px from the item's end", async () => {
    const measured = await inChromium(
      h(
        ui.DropdownRoot,
        { open: true, onOpenChange: () => {}, sheet: false },
        h(ui.DropdownTrigger, { asChild: true }, h("button", { type: "button" }, "Face")),
        h(
          ui.DropdownContent,
          { class: "min-w-[196px]", align: "start" },
          h(
            ui.DropdownRadioGroup,
            { value: "happy", onValueChange: () => {}, label: "Face" },
            ["happy", "sad", "angry"].map((value) =>
              h(ui.DropdownRadioItem, { key: value, value, indicator: "end", size: "small" }, h(ui.DropdownItemText, {}, value)),
            ),
          ),
        ),
      ),
      { width: 1440 },
      () => {
        const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
        const box = menu.getBoundingClientRect();
        const item = menu.querySelector('[role="menuitemradio"]')!.getBoundingClientRect();
        const check = menu.querySelector('[role="menuitemradio"][aria-checked="true"] svg')!.getBoundingClientRect();
        return {
          width: box.width,
          border: getComputedStyle(menu).borderTopWidth,
          gutter: getComputedStyle(menu).scrollbarGutter,
          itemInset: item.x - box.x,
          itemWidth: item.width,
          checkFromEnd: item.right - check.right,
        };
      },
    );
    expect(measured).toEqual({ width: 196, border: "1px", gutter: "auto", itemInset: 7, itemWidth: 182, checkFromEnd: 12 });
  });

  it("21: a menu too long for its room still scrolls, and its items keep one width while it does", async () => {
    const measured = await inChromium(
      h(
        ui.DropdownRoot,
        { open: true, onOpenChange: () => {}, sheet: false },
        h(ui.DropdownTrigger, { asChild: true }, h("button", { type: "button" }, "Many")),
        h(
          ui.DropdownContent,
          { class: "max-h-[160px] min-w-[196px]", align: "start" },
          Array.from({ length: 12 }, (_, index) => h(ui.DropdownItem, { key: index }, `Item ${index + 1}`)),
        ),
      ),
      { width: 1440 },
      async () => {
        const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
        const widths = () => [...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.getBoundingClientRect().width);
        const before = widths();
        menu.scrollTop = 200;
        await new Promise((done) => requestAnimationFrame(() => done(null)));
        return {
          scrolls: menu.scrollHeight > menu.clientHeight && menu.scrollTop > 0,
          steady: JSON.stringify(widths()) === JSON.stringify(before),
          sameWidth: new Set(before).size === 1,
        };
      },
    );
    expect(measured).toEqual({ scrolls: true, steady: true, sameWidth: true });
  });

  it("N11: the variant trigger's label starts 13px in and stands on a 19.2px line", async () => {
    const measured = await inChromium(
      h(ui.Button, { variant: "field", size: "field", class: "w-[169px]" }, h("span", { class: "[--fade:20px] fade-edge" }, "Happy"), h(ui.ChevronDownIcon, {})),
      { width: 1440 },
      () => {
        const button = document.querySelector("button")!.getBoundingClientRect();
        const label = document.querySelector("button span")!.getBoundingClientRect();
        return { x: label.x - button.x, top: +(label.y - button.y).toFixed(1), height: +label.height.toFixed(1) };
      },
    );
    expect(measured).toEqual({ x: 13, top: 9.4, height: 19.2 });
  });

  it("N7: the inspector subtitle stands on the prototype's 17.6px line, so the 68px head centres its title at 14.4px", async () => {
    const measured = await inChromium(
      h(ui.PanelHead, { size: "tall", titleSize: "sm", class: "px-2 py-0", title: "imani", subtitle: "Image Â· 3 variants" }),
      { width: 1440 },
      () => {
        const head = document.querySelector("[data-panel-head]")!.getBoundingClientRect();
        const title = document.querySelector("[data-panel-head] h2")!.getBoundingClientRect();
        const subtitle = document.querySelector("[data-panel-head] small")!.getBoundingClientRect();
        return { titleTop: +(title.y - head.y).toFixed(1), subtitle: +subtitle.height.toFixed(1) };
      },
    );
    expect(measured).toEqual({ titleTop: 14.4, subtitle: 17.6 });
  });

  it.each([
    ["inset", "the writing tools head", { size: "default", titleSize: "md" }, true, 62],
    ["open", "the inspector head", { size: "tall", titleSize: "sm", class: "px-2 py-0" }, true, 58],
    ["flush", "the search rail head", { size: "compact", edge: false, titleSize: "sm", class: "pr-1 pl-3.5" }, false, 14],
  ] as const)("N7: PanelHead spacing %s puts %s's title where the prototype's is", async (spacing, _head, props, start, titleX) => {
    const measured = await inChromium(
      h(ui.PanelHead, {
        ...props,
        spacing,
        title: "Search",
        start: start ? h(ui.Button, { variant: "quiet", size: "icon", "aria-label": "Close" }, h(ui.CloseIcon, {})) : undefined,
      }),
      { width: 1440 },
      () => {
        const head = document.querySelector("[data-panel-head]")!.getBoundingClientRect();
        return document.querySelector("[data-panel-head] h2")!.getBoundingClientRect().x - head.x;
      },
    );
    expect(measured).toBe(titleX);
  });

  it.each([
    ["mouse", false, 7, 33, 40],
    ["touch", true, 13.5, 46, 48],
  ] as const)("7: under a %s the trail's root glyph and summary sit where the rule puts them", async (_pointer, touch, glyph, summary, text) => {
    const measured = await inChromium(
      h(Trail, {
        label: "Images",
        icon: h(ui.ImageIcon, {}),
        summary: "99 files",
        crumbs: [],
        root: "images",
        parent: "images",
        onOpen: () => {},
      }),
      { width: touch ? 430 : 1440, layout: touch ? "phone" : "desktop", touch },
      () => {
        const nav = document.querySelector('nav[aria-label="Folder path"]')!.getBoundingClientRect();
        const svg = document.querySelector('nav[aria-label="Folder path"] button svg')!.getBoundingClientRect();
        const span = document.querySelector('nav[aria-label="Folder path"] [aria-current="location"]')!;
        const range = document.createRange();
        range.selectNodeContents(span);
        return {
          glyph: svg.x - nav.x,
          summary: span.getBoundingClientRect().x - nav.x,
          text: range.getBoundingClientRect().x - nav.x,
        };
      },
    );
    expect(measured).toEqual({ glyph, summary, text });
  });

  it.each([
    ["charcoal", "rgb(240, 239, 235)"],
    ["chalk", "rgb(32, 33, 35)"],
  ] as const)("N5: a tile's options dots are ink in %s while a row's stay muted", async (theme, ink) => {
    const measured = await inChromium(
      h(
        "div",
        {},
        h("div", { id: "tile" }, h(AssetRowMenu, { name: "imani", glyph: "sm", tone: "ink", onAction: () => {} })),
        h("div", { id: "row" }, h(AssetRowMenu, { name: "imani", onAction: () => {} })),
      ),
      { width: 1440, theme },
      () => ({
        tile: getComputedStyle(document.querySelector("#tile button svg")!).color,
        row: getComputedStyle(document.querySelector("#row button svg")!).color,
        muted: getComputedStyle(document.documentElement).getPropertyValue("--muted").trim(),
      }),
    );
    expect(measured.tile).toBe(ink);
    expect(measured.row).not.toBe(ink);
  });

  const topBarAt = async (collapsed: boolean) => {
    const state = stateForRoute(workspace.state.value as WorkspaceCache, "collection");
    workspace.state.value = {
      ...state,
      project: { ...state.project, name: "The Midnight Jukebox" },
      sync: { ...state.sync, status: "cached" },
    } as WorkspaceCache;
    return h(
      ui.SidebarLayout,
      {
        width: collapsed ? 76 : 190,
        defaultWidth: 76,
        minWidth: 190,
        maxWidth: 190,
        collapsedWidth: 76,
        onWidthChange: () => {},
        resizeLabel: "Resize sidebar",
        header: h(TopBar, {}),
        sidebar: h("nav", {}),
      },
      h("main", {}),
    );
  };

  const readTopBar = () => {
    const bar = document.querySelector("header")!;
    const box = (selector: string) => bar.querySelector(selector)?.getBoundingClientRect() ?? null;
    const status = bar.querySelector('[role="status"] button')!;
    return {
      mark: box('[aria-label="Spark Engine"] svg')?.x ?? null,
      name: box('input[aria-label="Project name"]')!.x,
      nameSize: getComputedStyle(bar.querySelector('input[aria-label="Project name"]')!).fontSize,
      status: status.getBoundingClientRect().x,
      statusSize: getComputedStyle(status).fontSize,
      search: box('button[aria-label="Search"]')?.x ?? null,
    };
  };

  it.each(THEMES)("N10: at 768 in %s the compact title bar keeps the name and status at 61 and shows Search only with the rail collapsed", async (theme) => {
    await setMedia((query) => query.includes("701px"));
    try {
      const collapsed = await inChromium(await topBarAt(true), { width: 768, theme, layout: "compact" }, readTopBar);
      const expanded = await inChromium(await topBarAt(false), { width: 768, theme, layout: "compact" }, readTopBar);
      expect(collapsed).toEqual({ mark: 31, name: 61, nameSize: "12px", status: 61, statusSize: "11px", search: 714 });
      expect(expanded).toEqual({ mark: 20, name: 61, nameSize: "12px", status: 61, statusSize: "11px", search: null });
    } finally {
      await setMedia(() => false);
    }
  });

  it("N10: at 1440 the desktop title bar has no Search and keeps its 14px name", async () => {
    await setMedia((query) => query.includes("701px") || query.includes("1101px"));
    try {
      const desktop = await inChromium(await topBarAt(true), { width: 1440, layout: "desktop" }, readTopBar);
      expect(desktop.search).toBeNull();
      expect(desktop.nameSize).toBe("14px");
    } finally {
      await setMedia(() => false);
    }
  });
});
