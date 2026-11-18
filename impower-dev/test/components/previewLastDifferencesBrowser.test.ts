import { compile } from "@tailwindcss/node";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { h, render, type VNode } from "preact";
import { act } from "preact/test-utils";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "vscode-languageserver-protocol";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: { revealDocument: vi.fn(), goBackToChoice: vi.fn(async () => true) },
    fs: { getUriFromPath: (path: string) => `file://local/${path}` },
  },
}));

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width"),
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

const { ProblemsDialog } = await import("../../src/modules/spark-editor/components/problems");
const { default: problems } = await import("../../src/modules/spark-editor/workspace/problems/ProblemsStore");
const { default: PreviewTopBar } = await import("../../src/modules/spark-editor/components/preview-top-bar/PreviewTopBar");
const { default: PreviewBar } = await import("../../src/modules/spark-editor/components/preview-bar/PreviewBar");
const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: workspaceSettings } = await import("../../src/modules/spark-editor/workspace/settings/WorkspaceSettings");

const UI_PACKAGE = resolve(process.cwd(), "../packages/impower-ui");

type Theme = "chalk" | "charcoal";

const settle = () =>
  act(async () => {
    await new Promise((done) => setTimeout(done, 250));
  });

const markupOf = async (node: VNode, open?: () => void) => {
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host));
  if (open) {
    await act(async () => open());
    await settle();
  }
  const markup = document.body.innerHTML;
  await act(async () => render(null, host));
  document.body.innerHTML = "";
  return markup;
};

const inChromium = async <T>(markup: string, { width, theme, layout }: { width: number; theme: Theme; layout: string }, read: () => T) => {
  const compiler = await compile('@import "./src/style.css";', { base: UI_PACKAGE, onDependency: () => {} });
  const css = compiler.build([...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1]!.replace(/&amp;/g, "&").split(/\s+/)));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    await page.setContent(
      `<!doctype html><html data-theme="${theme}" data-layout="${layout}"><head><style>${css}</style></head><body style="margin:0;height:100vh">${markup}</body></html>`,
    );
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    return (await page.evaluate(read)) as T;
  } finally {
    await browser.close();
  }
};

const INK: Record<Theme, string> = { chalk: "rgb(32, 33, 35)", charcoal: "rgb(240, 239, 235)" };
const MUTED: Record<Theme, string> = { chalk: "rgb(98, 99, 106)", charcoal: "rgb(185, 185, 189)" };

const diagnostic = (line: number): Diagnostic => ({
  range: { start: { line, character: 2 }, end: { line, character: 5 } },
  severity: 1,
  message: "Statement must be inside a scene",
});

describe("the preview's last differences from the Folio prototype (I-2517)", () => {
  it.each<Theme>(["chalk", "charcoal"])("draws the Problems dialog's close button in ink and its subtitle muted in %s", async (theme) => {
    problems.diagnostics.value = {};
    problems.played.value = [];
    problems.record({ uri: "file://local/main.sd", diagnostics: [diagnostic(3)] });
    const markup = await markupOf(h(ProblemsDialog, null), () => problems.openDialog({ kind: "story" }, () => null));
    await act(async () => problems.closeDialog());
    const colours = await inChromium(markup, { width: 430, theme, layout: "phone" }, () => {
      const dialog = document.querySelector('[role="dialog"]')!;
      return {
        close: getComputedStyle(dialog.querySelector('[aria-label="Close dialog"]')!).color,
        subtitle: getComputedStyle(dialog.querySelector("p")!).color,
      };
    });
    expect(colours).toEqual({ close: INK[theme], subtitle: MUTED[theme] });
  }, 60_000);

  it("sizes the mode button at 820 by its padding, icon, label and chevron alone, with no border", async () => {
    workspaceSettings.setPreference("previewMode", "game");
    const bar = await markupOf(h(PreviewTopBar, {}));
    const measured = await inChromium(`<div class="@container" style="width:744px">${bar}</div>`, { width: 820, theme: "chalk", layout: "desktop" }, () => {
      const mode = document.querySelector<HTMLElement>('button[aria-label^="Viewing mode"]')!;
      const style = getComputedStyle(mode);
      const parts = [...mode.children].map((child) => child.getBoundingClientRect().width);
      const gaps = parseFloat(style.columnGap) * (parts.length - 1);
      return {
        border: [style.borderLeftWidth, style.borderRightWidth],
        extra: Math.round((mode.getBoundingClientRect().width - parts.reduce((sum, part) => sum + part, 0) - gaps - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) * 100) / 100,
      };
    });
    expect(measured).toEqual({ border: ["0px", "0px"], extra: 0 });
  }, 60_000);

  it("names the mode button, the aspect-ratio button and the bar under the game as the prototype does", async () => {
    workspaceSettings.setPreference("previewMode", "game");
    workspaceSettings.setProjectSetting("previewAspectRatio", "auto");
    const next = structuredClone(workspace.current);
    next.preview.modes.game = { ...next.preview.modes.game, size: { width: 544, height: 694, aspectRatio: "auto" } };
    workspace.current = next;
    const markup = (await markupOf(h(PreviewTopBar, {}))) + (await markupOf(h(PreviewBar, { fullscreen: false, onToggleFullscreen: () => {} })));
    const names = await inChromium(markup, { width: 1440, theme: "chalk", layout: "desktop" }, () => {
      const mode = document.querySelector<HTMLElement>('button[aria-label^="Viewing mode"]')!;
      const ratio = document.querySelector<HTMLElement>('button[aria-label^="Game aspect ratio"]')!;
      return {
        mode: [mode.getAttribute("aria-label"), mode.title],
        ratio: [ratio.getAttribute("aria-label"), ratio.title],
        bar: [...document.querySelectorAll('[role="group"]')].map((group) => group.getAttribute("aria-label")),
      };
    });
    expect(names).toEqual({
      mode: ["Viewing mode: Visual Novel", "Viewing mode: Visual Novel"],
      ratio: ["Game aspect ratio: Auto, shown at 544×694 pixels", "Game aspect ratio: Auto, shown at 544×694 pixels"],
      bar: expect.arrayContaining(["Playback controls", "Problems and playback messages"]),
    });
  }, 60_000);
});
