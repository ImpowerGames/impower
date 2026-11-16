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
const { default: AppMenu } = await import("../../src/modules/spark-editor/components/desktop-shell/AppMenu");
const { default: ShellRail } = await import("../../src/modules/spark-editor/components/desktop-shell/ShellRail");
const { default: LibraryPage } = await import("../../src/modules/spark-editor/components/library-page/LibraryPage");
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

  it.each(THEMES)("A6: at 1440 in %s the status starts 6px after the project name's box, as the prototype's project-status padding", async (theme) => {
    await setMedia((query) => query.includes("701px") || query.includes("1101px"));
    try {
      const desktop = await inChromium(await topBarAt(false), { width: 1440, theme, layout: "desktop" }, readTopBar);
      expect(desktop.status - desktop.name).toBe(6);
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

describe("Shared parts the Assets page shows against the Folio prototype (I-2441)", () => {
  const tabRow = (variant: "inline" | "page") =>
    h(
      "div",
      { style: "border-bottom:1px solid #d3d3d7;width:398px" },
      h(ui.Tabs, { variant, iconLayout: "beside", scroll: variant === "inline", value: "images", onChange: () => {} }, [
        h(ui.Tab, { key: "images", value: "images" }, "Images"),
        h(ui.Tab, { key: "audio", value: "audio" }, "Audio"),
      ]),
    );

  const underline = () => {
    const list = document.querySelector('[role="tablist"]')!.getBoundingClientRect();
    const bar = document.querySelector('[role="tablist"] > [aria-hidden="true"]')!.getBoundingClientRect();
    return { height: bar.height, belowList: +(bar.bottom - list.bottom).toFixed(2) };
  };

  it.each([
    ["inline", 430, "chalk", true],
    ["inline", 1440, "charcoal", false],
    ["page", 430, "charcoal", true],
    ["page", 1440, "chalk", false],
  ] as const)("N9: the %s row's underline at %i in %s is 2px and sits 1px below the row, over its divider", async (variant, width, theme, touch) => {
    const measured = await inChromium(tabRow(variant), { width, theme, touch, layout: touch ? "phone" : "desktop" }, underline);
    expect(measured).toEqual({ height: 2, belowList: 1 });
  });

  const addMenu = () =>
    h(
      ui.DropdownRoot,
      { open: true, onOpenChange: () => {}, sheet: false },
      h(ui.DropdownTrigger, { asChild: true }, h("button", { type: "button" }, "Add")),
      h(
        ui.DropdownContent,
        { align: "end" },
        h(ui.DropdownItem, {}, h(ui.UploadIcon, {}), h(ui.DropdownItemText, { hint: "Into Images" }, "Upload files")),
        h(ui.DropdownItem, {}, h(ui.PencilIcon, {}), "Rename"),
      ),
    );

  it.each(THEMES)("A1(d): in %s a menu item is 13px text 12px after its 18px glyph, padded 10px 12px, with an 11px hint", async (theme) => {
    const measured = await inChromium(addMenu(), { width: 1440, theme }, () => {
      const [hinted, plain] = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      const style = getComputedStyle(hinted!);
      const glyph = hinted!.querySelector("svg")!.getBoundingClientRect();
      const label = hinted!.querySelector("[data-dropdown-item-text]")!.getBoundingClientRect();
      return {
        size: style.fontSize,
        padding: style.padding,
        glyph: glyph.width,
        gap: label.x - glyph.right,
        hint: getComputedStyle(hinted!.querySelector("small")!).fontSize,
        plainHeight: plain!.getBoundingClientRect().height,
      };
    });
    expect(measured).toEqual({ size: "13px", padding: "10px 12px", glyph: 18, gap: 12, hint: "11px", plainHeight: 44 });
  });

  it.each(THEMES)("A2: at 430 under touch in %s the wheel sheet has 16px top corners and the prototype's shadow above it", async (theme) => {
    const measured = await inChromium(h("div", { class: ui.wheelSheetVariants({}) }, "Face"), { width: 430, theme, touch: true, layout: "phone" }, () => {
      const style = getComputedStyle([...document.querySelectorAll("div")].pop()!);
      return { radius: style.borderRadius, shadow: style.boxShadow.split(", rgba").pop() };
    });
    expect(measured).toEqual({ radius: "16px 16px 0px 0px", shadow: "(0, 0, 0, 0.333) 0px -8px 24px 0px" });
  });

  const navItems = (variant: "rail" | "bar", width: string) =>
    h(
      "div",
      { style: `width:${width}` },
      h(ui.Tabs, { variant, vertical: variant === "rail", iconLayout: variant === "rail" ? "beside" : "above", indicator: "none", value: "logic", onChange: () => {} }, [
        h(ui.Tab, { key: "logic", value: "logic", icon: ui.BookIcon }, "Story"),
        h(ui.Tab, { key: "assets", value: "assets", icon: ui.ArtIcon }, "Assets"),
      ]),
    );

  const navOffsets = () => {
    const tab = document.querySelector('[role="tab"]')!;
    const box = tab.getBoundingClientRect();
    const glyph = tab.querySelector("svg")!.getBoundingClientRect();
    const label = tab.querySelector(":scope > span:last-child")!.getBoundingClientRect();
    return { glyphTop: +(glyph.y - box.y).toFixed(2), glyph: glyph.width, labelTop: +(label.y - box.y).toFixed(2), labelLeft: +(label.x - box.x).toFixed(2) };
  };

  it.each(THEMES)("A3: at 768 in %s the compact rail centres a 20px glyph, 6px gap and 1.35 label as the prototype's", async (theme) => {
    const measured = await inChromium(navItems("rail", "65px"), { width: 768, theme, layout: "compact" }, navOffsets);
    expect({ glyphTop: measured.glyphTop, glyph: measured.glyph, labelTop: measured.labelTop }).toEqual({ glyphTop: 12.58, glyph: 20, labelTop: 38.58 });
  });

  it.each(THEMES)("A3: at 1440 in %s the rail's 20px glyph sits 13px in and its label 11px after it", async (theme) => {
    const measured = await inChromium(navItems("rail", "203px"), { width: 1440, theme }, navOffsets);
    expect({ glyph: measured.glyph, labelLeft: measured.labelLeft }).toEqual({ glyph: 20, labelLeft: 44 });
  });

  it.each(THEMES)("A4: at 430 under touch in %s the bottom navigation centres a 19px glyph over a 1.4 label as the prototype's", async (theme) => {
    const measured = await inChromium(navItems("bar", "430px"), { width: 430, theme, touch: true, layout: "phone" }, navOffsets);
    expect({ glyphTop: measured.glyphTop, glyph: measured.glyph, labelTop: measured.labelTop }).toEqual({ glyphTop: 12.09, glyph: 19, labelTop: 35.09 });
  });

  const page = () =>
    h(ui.TabbedPage, {
      title: "Assets",
      icon: h(ui.ArtIcon, { class: "flex-none text-accent" }),
      tabs: [{ value: "images", label: "Images", content: h("div", {}) }],
      value: "images",
      onValueChange: () => {},
      onBack: () => {},
    });

  const titleBox = () => {
    const header = document.querySelector("header")!;
    const title = header.querySelector("h1")!;
    return {
      lineHeight: getComputedStyle(title).lineHeight,
      glyph: header.querySelector(":scope > svg")!.getBoundingClientRect().width,
      titleLeft: title.getBoundingClientRect().x - header.getBoundingClientRect().x,
    };
  };

  it.each([
    [1440, "desktop", "charcoal", { lineHeight: "22.1px", glyph: 20, titleLeft: 54 }],
    [1440, "desktop", "chalk", { lineHeight: "22.1px", glyph: 20, titleLeft: 54 }],
    [768, "compact", "charcoal", { lineHeight: "18.9px", glyph: 19, titleLeft: 45 }],
    [430, "phone", "chalk", { lineHeight: "18.9px", glyph: 19, titleLeft: 45 }],
  ] as const)("A5: at %i (%s, %s) the page title stands on the prototype's line beside its glyph", async (width, layout, theme, expected) => {
    const measured = await inChromium(page(), { width, theme, layout, touch: layout === "phone" }, titleBox);
    expect(measured).toEqual(expected);
  });

  it.each(THEMES)("A6: at 1440 in %s the rail's Saved locally starts 45px into its trigger, as the prototype's account trigger", async (theme) => {
    const measured = await inChromium(h("div", { style: "width:203px" }, h(AppMenu, {})), { width: 1440, theme }, () => {
      const trigger = document.querySelector("button")!;
      const walker = document.createTreeWalker(trigger, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.textContent?.trim()) break;
      }
      const range = document.createRange();
      range.selectNodeContents(node!);
      return range.getBoundingClientRect().x - trigger.getBoundingClientRect().x;
    });
    expect(measured).toBe(45);
  });
});

describe("The Assets page's and app frame's last differences from the Folio prototype (I-2448)", () => {

  const menuBelow = (elevation?: "menu") =>
    h(
      "div",
      { style: "padding:100px 400px" },
      h(
        ui.DropdownRoot,
        { open: true, onOpenChange: () => {}, sheet: false },
        h(ui.DropdownTrigger, { asChild: true }, h("button", { type: "button", style: "height:44px" }, "Add")),
        h(ui.DropdownContent, { align: "end", elevation }, h(ui.DropdownItem, {}, "Upload files")),
      ),
    );

  const menuShadow = () => getComputedStyle(document.querySelector('[role="menu"]')!).boxShadow.split(", rgba").pop();

  it.each(THEMES)("G1: in %s a library menu casts the prototype's 0 8px 24px shadow at 0.267", async (theme) => {
    expect(await inChromium(menuBelow("menu"), { width: 1440, theme }, menuShadow)).toBe("(0, 0, 0, 0.267) 0px 8px 24px 0px");
  });

  it.each(THEMES)("G1: in %s a dropdown that is not a library menu, such as the app menu, keeps the floating shadow", async (theme) => {
    expect(await inChromium(menuBelow(), { width: 1440, theme }, menuShadow)).toBe("(0, 0, 0, 0.4) 0px 12px 40px 0px");
  });

  it.each(THEMES)("G3: at 430 in %s a menu shown as a sheet has 16px top corners and the sheet's shadow", async (theme) => {
    const measured = await inChromium(h("div", { class: ui.sheetVariants({ size: "auto" }) }, "Add"), { width: 430, theme, touch: true, layout: "phone" }, () => {
      const style = getComputedStyle([...document.querySelectorAll("div")].pop()!);
      return { radius: style.borderRadius, shadow: style.boxShadow.split(", rgba").pop() };
    });
    expect(measured).toEqual({ radius: "16px 16px 0px 0px", shadow: "(0, 0, 0, 0.333) 0px -8px 24px 0px" });
  });

  const account = () => {
    const trigger = document.querySelector<HTMLElement>("aside > div:last-child button")!;
    const box = trigger.querySelector("span")!;
    const glyph = box.querySelector("svg")!.getBoundingClientRect();
    const footer = trigger.parentElement!.getBoundingClientRect();
    return {
      triggerHeight: trigger.getBoundingClientRect().height,
      footerHeight: footer.height,
      glyph: [glyph.width, glyph.height],
      fill: getComputedStyle(box).backgroundColor,
    };
  };

  const rail = (collapsed: boolean) =>
    h(
      "div",
      { class: "group/sidebar", "data-sidebar": collapsed ? "collapsed" : "expanded", style: `width:${collapsed ? 76 : 232}px;height:900px` },
      h(ShellRail, {}),
    );

  it.each([
    ["charcoal", "rgb(40, 42, 45)"],
    ["chalk", "rgb(245, 245, 246)"],
  ] as const)("G4-G6: at 1440 in %s the account trigger is 44 tall in a 62px footer, its box filled and its glyph 17px", async (theme, fill) => {
    await setMedia((query) => query.includes("701px") || query.includes("1101px"));
    try {
      const measured = await inChromium(rail(false), { width: 1440, theme }, account);
      expect(measured).toEqual({ triggerHeight: 44, footerHeight: 62, glyph: [17, 17], fill });
    } finally {
      await setMedia(() => false);
    }
  });

  it.each(THEMES)("G6, G10: at 768 in %s the footer is 52 tall and the collapsed rail's pills are 65 wide at x 5", async (theme) => {
    await setMedia((query) => query.includes("701px"));
    try {
      const measured = await inChromium(rail(true), { width: 768, theme, layout: "compact" }, () => ({
        footerHeight: document.querySelector("aside > div:last-child")!.getBoundingClientRect().height,
        triggerHeight: document.querySelector("aside > div:last-child button")!.getBoundingClientRect().height,
        pills: [...document.querySelectorAll('[role="tab"]')].map((tab) => {
          const box = tab.getBoundingClientRect();
          return [box.x, box.width];
        }),
      }));
      expect({ footerHeight: measured.footerHeight, triggerHeight: measured.triggerHeight, pills: measured.pills }).toEqual({
        footerHeight: 52,
        triggerHeight: 44,
        pills: [
          [5, 65],
          [5, 65],
          [5, 65],
        ],
      });
    } finally {
      await setMedia(() => false);
    }
  });

  it.each(THEMES)("G7: at 1440 in %s the search glyph sits 13px inside the field and the Add button's glyph is 7px from its label", async (theme) => {
    await setMedia((query) => query.includes("701px") || query.includes("1101px"));
    try {
      const page = h(
        "div",
        { style: "width:1000px;height:600px;display:flex" },
        h(LibraryPage, { searchLabel: "Search images", query: "", onQueryChange: () => {}, newLabel: "Add", newMenu: null, bar: null, list: null }),
      );
      const measured = await inChromium(page, { width: 1440, theme }, () => {
        const field = document.querySelector("label")!;
        const add = [...document.querySelectorAll("button")].find((button) => button.textContent === "Add")!;
        const walker = document.createTreeWalker(add, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        range.selectNodeContents(walker.nextNode()!);
        return {
          searchInset: field.querySelector("svg")!.getBoundingClientRect().x - field.getBoundingClientRect().x,
          addGap: +(range.getBoundingClientRect().x - add.querySelector("svg")!.getBoundingClientRect().right).toFixed(2),
        };
      });
      expect(measured).toEqual({ searchInset: 14, addGap: 7 });
    } finally {
      await setMedia(() => false);
    }
  });

  it.each(THEMES)("G9: in %s the folder badge is filled at the prototype's 0.6", async (theme) => {
    const fill = await inChromium(h("div", { style: "width:192px;height:108px;position:relative" }, h(ui.FolderCover, { sources: ["cover.png"] })), { width: 1440, theme }, () =>
      getComputedStyle(document.querySelector("[data-folder-cover] > :last-child")!).backgroundColor,
    );
    expect(fill).toBe("rgba(0, 0, 0, 0.6)");
  });

  it.each([
    [768, "compact", false],
    [430, "phone", true],
  ] as const)("G11: at %i the page header glyph is 19 wide and 20 tall", async (width, layout, touch) => {
    const size = await inChromium(h(ui.TabbedPage, { title: "Assets", icon: h(ui.ArtIcon, {}), onBack: () => {}, tabs: [], value: "", onValueChange: () => {} }), { width, layout, touch }, () => {
      const glyph = document.querySelector("section svg")!.getBoundingClientRect();
      return [glyph.width, glyph.height];
    });
    expect(size).toEqual([19, 20]);
  });

  it.each(THEMES)("G18: in %s the row's play glyph is an 18px svg filled with its colour and not stroked", async (theme) => {
    const measured = await inChromium(h(ui.PlayButton, { name: "amb_rain" }), { width: 1440, theme }, () => {
      const glyph = document.querySelector("button svg")!;
      const style = getComputedStyle(glyph);
      return { size: glyph.getBoundingClientRect().width, fill: style.fill === style.color, stroke: style.stroke };
    });
    expect(measured).toEqual({ size: 18, fill: true, stroke: "none" });
  });
});
