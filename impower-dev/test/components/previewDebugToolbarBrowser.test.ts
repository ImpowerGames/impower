import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/components/preview-game/PreviewGame", () => ({
  default: () => h("div", { "data-stage": "game", class: "min-h-0 flex-1" }),
}));
vi.mock(
  "../../src/modules/spark-editor/components/preview-screenplay/PreviewScreenplay",
  () => ({ default: () => h("div", { "data-stage": "screenplay" }) }),
);
vi.mock(
  "../../src/modules/spark-editor/components/preview-top-bar/PreviewTopBar",
  () => ({ default: () => h("div", { "data-top-bar": "", class: "h-[60px] shrink-0" }) }),
);
vi.mock("../../src/modules/spark-editor/components/preview-bar", () => ({
  PreviewBar: () => h("div", { "data-preview-bar": "", class: "h-[48px] shrink-0" }),
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: {} },
}));

let phone = false;

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return query.includes("min-width") && !phone;
      },
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: Preview } = await import("../../src/modules/spark-editor/components/preview/Preview");

const initial = structuredClone(workspace.current);

const SRC = resolve("../packages/impower-ui/src");

type Run = "idle" | "playing" | "stopped";

type Theme = "charcoal" | "chalk";

const markupFor = async (run: Run) => {
  const next = structuredClone(initial);
  next.preview.revealed = true;
  next.preview.modes.game = {
    ...next.preview.modes.game,
    running: run !== "idle",
    paused: run === "stopped",
  };
  workspace.current = next;
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(Preview, {}), host));
  const markup = host.innerHTML;
  await act(async () => render(null, host));
  host.remove();
  return markup;
};

afterEach(() => {
  workspace.current = structuredClone(initial);
  phone = false;
});

type Reading = {
  card: number[];
  stage: number[];
  toolbar: number[] | null;
  buttons: { label: string; width: number; height: number; disabled: boolean; contrast: number }[];
  separatorAfter: string | null;
  surfaceAlpha: number | null;
};

const read = (): Reading => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const rgba = (color: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return [r!, g!, b!, a! / 255];
  };
  const luminance = ([r, g, b]: number[]) => {
    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
  };
  const over = (top: number[], bottom: number[]) =>
    [0, 1, 2].map((i) => top[i]! * top[3]! + bottom[i]! * (1 - top[3]!));
  const stage = document.querySelector<HTMLElement>('[data-stage="game"]')!;
  const art = rgba(getComputedStyle(stage).backgroundColor);
  const box = (element: Element) => {
    const r = element.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 100) / 100);
  };
  const toolbar = document.querySelector<HTMLElement>('[role="toolbar"]');
  const surface = toolbar ? rgba(getComputedStyle(toolbar).backgroundColor) : null;
  const behind = surface ? over(surface, art) : null;
  const separator = toolbar?.querySelector('[role="separator"]');
  return {
    card: box(document.querySelector("[data-preview-card]")!),
    stage: box(stage),
    toolbar: toolbar ? box(toolbar) : null,
    buttons: toolbar
      ? [...toolbar.querySelectorAll<HTMLElement>("button")].map((button) => {
          const r = button.getBoundingClientRect();
          const icon = rgba(getComputedStyle(button.querySelector("svg")!).color);
          const ink = over(icon, behind!);
          const [light, dark] = [luminance(ink), luminance(behind!)].sort((a, b) => b - a);
          return {
            label: button.getAttribute("aria-label")!,
            width: r.width,
            height: r.height,
            disabled: button.getAttribute("aria-disabled") === "true",
            contrast: Math.round(((light! + 0.05) / (dark! + 0.05)) * 100) / 100,
          };
        })
      : [],
    separatorAfter: separator?.previousElementSibling?.getAttribute("aria-label") ?? null,
    surfaceAlpha: surface ? surface[3]! : null,
  };
};

const inChromium = async (
  markups: Record<Run, string>,
  { width, touch, theme, art }: { width: number; touch: boolean; theme: Theme; art: string },
) => {
  const compiler = await compile(readFileSync(join(SRC, "style.css"), "utf8"), { base: SRC, onDependency: () => {} });
  const classes = Object.values(markups).flatMap((markup) =>
    [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1]!.replace(/&amp;/g, "&").split(/\s+/)),
  );
  const css = optimize(compiler.build(classes), { minify: false }).code;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height: touch ? 932 : 900 },
      hasTouch: touch,
      isMobile: touch,
    });
    const readings = {} as Record<Run, Reading>;
    for (const run of Object.keys(markups) as Run[]) {
      await page.setContent(
        `<!doctype html><html data-theme="${theme}" data-layout="${touch ? "phone" : "desktop"}"><head><style>${css}*{animation:none!important;transition:none!important}[data-stage="game"]{background:${art}}</style></head><body style="margin:0;height:100vh"><div style="height:100vh;display:flex">${markups[run]}</div></body></html>`,
      );
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      readings[run] = await page.evaluate(read);
    }
    return readings;
  } finally {
    await browser.close();
  }
};

const ORDER = ["Continue", "Step Over", "Step Into", "Step Out", "Toggle breakpoint"];

const VIEWPORTS = [
  { name: "1440", width: 1440, touch: false },
  { name: "430 touch", width: 430, touch: true },
  { name: "360 touch", width: 360, touch: true },
] as const;

describe("the debug toolbar over the game while the run is stopped (I-2591)", () => {
  it.each(VIEWPORTS)("floats over the top-left of the game only while stopped, without moving the game, at $name", async ({ width, touch }) => {
    phone = touch;
    const markups = {
      idle: await markupFor("idle"),
      playing: await markupFor("playing"),
      stopped: await markupFor("stopped"),
    };
    const readings = await inChromium(markups, { width, touch, theme: "charcoal", art: "#000" });
    expect(readings.idle.toolbar).toBeNull();
    expect(readings.playing.toolbar).toBeNull();
    const stopped = readings.stopped;
    expect(stopped.toolbar).not.toBeNull();
    expect(stopped.card).toEqual(readings.playing.card);
    expect(stopped.stage).toEqual(readings.playing.stage);
    expect(stopped.buttons.map((button) => button.label)).toEqual(ORDER);
    expect(stopped.separatorAfter).toBe("Step Out");
    for (const button of stopped.buttons) {
      expect({ label: button.label, width: button.width, height: button.height }).toEqual({ label: button.label, width: 44, height: 44 });
    }
    const [x, y, w, h] = stopped.toolbar!;
    const [cardX, cardY, cardW] = stopped.card;
    expect(x! - cardX!).toBe(12);
    expect(y! - cardY!).toBe(12);
    expect(x! + w!).toBeLessThanOrEqual(cardX! + cardW! - 12);
    expect(h).toBeLessThanOrEqual(52);
  }, 120_000);

  it.each(
    (["charcoal", "chalk"] as const).flatMap((theme) =>
      [
        { art: "#ffffff", over: "light" },
        { art: "#000000", over: "dark" },
      ].map((art) => ({ theme, ...art })),
    ),
  )("draws every enabled control at 4.5 to 1 or better over $over art in $theme", async ({ theme, art }) => {
    const markups = { stopped: await markupFor("stopped") } as Record<Run, string>;
    const { stopped } = await inChromium(markups, { width: 1440, touch: false, theme, art });
    expect(stopped.surfaceAlpha).toBe(1);
    const enabled = stopped.buttons.filter((button) => !button.disabled);
    expect(enabled.map((button) => button.label)).toEqual(expect.arrayContaining(["Continue", "Step Over", "Step Into"]));
    for (const button of enabled) {
      expect({ label: button.label, atLeast: button.contrast >= 4.5, contrast: button.contrast }).toEqual({
        label: button.label,
        atLeast: true,
        contrast: button.contrast,
      });
    }
  }, 120_000);
});
