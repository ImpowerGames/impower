import { compile } from "@tailwindcss/node";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeAll, describe, expect, it, vi } from "vitest";

let phone = false;
const mediaListeners = new Set<() => void>();

const setPhone = async (next: boolean) => {
  phone = next;
  await act(async () => mediaListeners.forEach((listener) => listener()));
};

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes("min-width") && !phone;
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

const { default: PreviewTopBar } = await import("../../src/modules/spark-editor/components/preview-top-bar/PreviewTopBar");
const { default: workspaceSettings } = await import("../../src/modules/spark-editor/workspace/settings/WorkspaceSettings");
const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");

const initial = structuredClone(workspace.current);

const runningInNarrowBar = () => {
  const next = structuredClone(workspace.current);
  next.preview.modes.game = { ...next.preview.modes.game, running: true };
  workspace.current = next;
  const isBar = (element: Element) => element.getAttribute("aria-label") === "Playback controls";
  return [
    vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(function (this: Element) {
      return isBar(this) ? 300 : 0;
    }),
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const width = this.tagName === "BUTTON" && this.closest('[aria-label="Playback controls"]') ? 44 : 0;
      return { x: 0, y: 0, top: 0, left: 0, bottom: 44, right: width, width, height: width ? 44 : 0, toJSON: () => ({}) } as DOMRect;
    }),
  ];
};

const UI_PACKAGE = resolve(process.cwd(), "../packages/impower-ui");

type Theme = "chalk" | "charcoal";

const settle = (ms: number) =>
  act(async () => {
    await new Promise((done) => setTimeout(done, ms));
  });

const openMenuMarkup = async (triggerSelector = '[aria-label="Preview settings"]') => {
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(PreviewTopBar, {}), host));
  const trigger = host.querySelector<HTMLButtonElement>(triggerSelector)!;
  trigger.focus();
  if (phone) {
    await act(async () => {
      trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", button: 0 }));
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    });
    await settle(300);
  } else {
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    await settle(50);
  }
  const markup = document.body.innerHTML;
  await act(async () => render(null, host));
  document.body.innerHTML = "";
  return markup;
};

type Row = { role: string; name: string; glyph: number; text: number };

const inBrowser = async <T,>(markup: string, width: number, theme: Theme, layout: string, read: () => T): Promise<T> => {
  const compiler = await compile('@import "./src/style.css";', { base: UI_PACKAGE, onDependency: () => {} });
  const css = compiler.build([...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1]!.replace(/&amp;/g, "&").split(/\s+/)));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    await page.setContent(
      `<!doctype html><html data-theme="${theme}" data-layout="${layout}"><head><style>${css}*{animation:none!important;transition:none!important}</style></head><body style="margin:0;height:100vh">${markup}</body></html>`,
    );
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    return (await page.evaluate(read)) as T;
  } finally {
    await browser.close();
  }
};

const measure = (markup: string, width: number, theme: Theme, layout: string) =>
  inBrowser(markup, width, theme, layout, () => {
      const menu = document.querySelector('[role="menu"], [role="dialog"]')!;
      const textLeft = (node: Element): number | undefined => {
        for (const child of node.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && child.textContent!.trim()) {
            const range = document.createRange();
            range.selectNodeContents(child);
            return range.getBoundingClientRect().left;
          }
          if (child instanceof Element && child.tagName.toLowerCase() !== "svg" && child.textContent!.trim()) {
            return child.getBoundingClientRect().left;
          }
        }
        return undefined;
      };
      return [...menu.querySelectorAll('[role^="menuitem"]')]
        .concat([...menu.querySelectorAll("div")].filter((div) => div.matches('[class*="uppercase"], [class*="text-muted"]') && !div.closest('[role^="menuitem"]')))
        .filter((row, index, rows) => rows.indexOf(row) === index)
        .map((row) => {
          const left = row.getBoundingClientRect().left;
          const svg = row.querySelector("svg");
          return {
            role: row.getAttribute("role") ?? "label",
            name: row.textContent!.trim().slice(0, 24),
            glyph: svg ? Math.round(svg.getBoundingClientRect().left - left) : -1,
            text: Math.round(textLeft(row)! - left),
          };
        });
    });

type Box = { role: string; name: string; top: number; bottom: number };

const readBoxes = () => {
  const menu = document.querySelector('[role="menu"]')!;
  return [...menu.querySelectorAll('[role^="menuitem"], [role="separator"], div')]
    .filter((row) => row.matches('[role^="menuitem"], [role="separator"]') || (row.matches('[class*="uppercase"], [class*="text-muted"]') && !row.closest('[role^="menuitem"]')))
    .map((row) => {
      const box = row.getBoundingClientRect();
      return { role: row.getAttribute("role") ?? "label", name: row.textContent!.trim().slice(0, 24), top: box.top, bottom: box.bottom };
    });
};

const spaces = (boxes: Box[]) =>
  boxes.slice(1).map((box, index) => ({
    from: boxes[index]!.name || boxes[index]!.role,
    to: box.name || box.role,
    space: Math.round((box.top - boxes[index]!.bottom) * 100) / 100,
  }));

const expectSettingsRhythm = (boxes: Box[]) => {
  expect(boxes.filter((box) => box.role === "separator").length).toBeGreaterThan(0);
  const expected = spaces(boxes).map((pair) => ({
    ...pair,
    space: pair.to.startsWith("More preview settings") || pair.from === "separator" || pair.to === "separator" ? 6 : 2,
  }));
  expect(spaces(boxes)).toEqual(expected);
};

const VIEWING_MODE_SPACES_ON_MAIN = [0, 0];

describe("the preview settings menu's rows take the prototype's 2px gap (I-2541)", () => {
  it.each<Theme>(["charcoal", "chalk"])("spaces rows 2px apart, separators and More preview settings 6px, at 1440 in %s", async (theme) => {
    await setPhone(false);
    workspaceSettings.setPreference("previewMode", "game");
    const spies = runningInNarrowBar();
    let markup: string;
    try {
      markup = await openMenuMarkup();
    } finally {
      spies.forEach((spy) => spy.mockRestore());
      workspace.current = structuredClone(initial);
    }
    const boxes = await inBrowser(markup, 1440, theme, "desktop", readBoxes);
    expect(boxes.some((box) => box.name === "Step")).toBe(true);
    expect(boxes.some((box) => box.name === "Device color scheme")).toBe(true);
    expectSettingsRhythm(boxes);
  }, 60_000);

  it("spaces the sheet form's rows, the folded Step and aspect-ratio groups included, the same way at 430", async () => {
    await setPhone(true);
    workspaceSettings.setPreference("previewMode", "game");
    const spies = runningInNarrowBar();
    let markup: string;
    try {
      markup = await openMenuMarkup();
    } finally {
      spies.forEach((spy) => spy.mockRestore());
      workspace.current = structuredClone(initial);
    }
    const boxes = await inBrowser(markup, 430, "charcoal", "phone", readBoxes);
    expect(boxes.some((box) => box.name === "Step")).toBe(true);
    expect(boxes.filter((box) => box.role === "menuitem").length).toBeGreaterThan(1);
    expect(boxes.some((box) => box.name === "Game aspect ratio")).toBe(true);
    expectSettingsRhythm(boxes);
    await setPhone(false);
  }, 60_000);

  it("leaves the viewing-mode menu's rows where main has them", async () => {
    await setPhone(false);
    workspaceSettings.setPreference("previewMode", "game");
    const boxes = await inBrowser(await openMenuMarkup('[aria-label^="Viewing mode"]'), 1440, "charcoal", "desktop", readBoxes);
    expect(boxes.length).toBeGreaterThan(1);
    expect(spaces(boxes).map((pair) => pair.space)).toEqual(VIEWING_MODE_SPACES_ON_MAIN);
  }, 60_000);
});

describe("the preview settings menu's rows take the prototype's 10px side padding (I-2536)", () => {
  it("starts the folded Step group's heading and rows 10px in from the row at 1440", async () => {
    await setPhone(false);
    workspaceSettings.setPreference("previewMode", "game");
    const spies = runningInNarrowBar();
    let markup: string;
    try {
      markup = await openMenuMarkup();
    } finally {
      spies.forEach((spy) => spy.mockRestore());
      workspace.current = structuredClone(initial);
    }
    const rows: Row[] = await measure(markup, 1440, "charcoal", "desktop");
    const steps = rows.filter((row) => row.role === "menuitem" && !row.name.startsWith("More preview settings"));
    expect(rows.some((row) => row.role === "label" && row.name === "Step")).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
    for (const row of rows.filter((row) => row.role === "label")) {
      expect({ name: row.name, text: row.text }).toEqual({ name: row.name, text: 10 });
    }
    for (const row of steps) {
      expect({ name: row.name, glyph: row.glyph, text: row.text }).toEqual({ name: row.name, glyph: 10, text: 40 });
    }
  }, 60_000);

  it.each<Theme>(["charcoal", "chalk"])("starts every row's glyph and text 10px in from the row at 1440 in %s", async (theme) => {
    await setPhone(false);
    workspaceSettings.setPreference("previewMode", "game");
    const rows: Row[] = await measure(await openMenuMarkup(), 1440, theme, "desktop");
    const checkboxes = rows.filter((row) => row.role === "menuitemcheckbox");
    const more = rows.find((row) => row.name.startsWith("More preview settings"))!;
    const radios = rows.filter((row) => row.role === "menuitemradio");
    const labels = rows.filter((row) => row.role === "label");
    expect(checkboxes.length).toBeGreaterThan(0);
    expect(radios.length).toBeGreaterThan(0);
    expect(labels.length).toBeGreaterThan(0);
    for (const row of [...checkboxes, more]) {
      expect({ name: row.name, glyph: row.glyph, text: row.text }).toEqual({ name: row.name, glyph: 10, text: 40 });
    }
    for (const row of radios) {
      expect({ name: row.name, glyph: row.glyph, text: row.text }).toEqual({ name: row.name, glyph: 10, text: 40 });
    }
    for (const row of labels) {
      expect({ name: row.name, text: row.text }).toEqual({ name: row.name, text: 10 });
    }
  }, 60_000);

  it("starts every kind of row in the sheet form, the aspect-ratio group included, on the same edges at 430", async () => {
    await setPhone(true);
    workspaceSettings.setPreference("previewMode", "game");
    const rows: Row[] = await measure(await openMenuMarkup(), 430, "charcoal", "phone");
    const items = rows.filter((row) => row.role !== "label");
    expect(new Set(items.map((row) => row.role))).toEqual(new Set(["menuitemcheckbox", "menuitemradio", "menuitem"]));
    expect(rows.some((row) => row.role === "label" && row.name === "Game aspect ratio")).toBe(true);
    for (const row of items) {
      expect({ name: row.name, glyph: row.glyph, text: row.text }).toEqual({ name: row.name, glyph: 10, text: 40 });
    }
    for (const row of rows.filter((row) => row.role === "label")) {
      expect({ name: row.name, text: row.text }).toEqual({ name: row.name, text: 10 });
    }
    await setPhone(false);
  }, 60_000);
});
