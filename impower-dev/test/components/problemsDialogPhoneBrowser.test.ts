import { compile } from "@tailwindcss/node";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { h, render } from "preact";
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

const { ProblemsDialog } = await import(
  "../../src/modules/spark-editor/components/problems"
);
const { default: problems } = await import(
  "../../src/modules/spark-editor/workspace/problems/ProblemsStore"
);

const UI_PACKAGE = resolve(process.cwd(), "../packages/impower-ui");

const diagnostic = (line: number, severity: 1 | 2 | 3, message: string): Diagnostic => ({
  range: { start: { line, character: 2 }, end: { line, character: 5 } },
  severity,
  message,
});

const settle = async () => {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 250));
  });
};

const markupFor = async (count: number, playing: boolean) => {
  problems.diagnostics.value = {};
  problems.dialog.value = null;
  problems.played.value = [];
  const half = Math.ceil(count / 2);
  problems.record({
    uri: "file://local/main.sd",
    diagnostics: Array.from({ length: half }, (_, i) => ({
      ...diagnostic(
        10 + i,
        i % 3 === 0 ? 2 : 1,
        `Main problem number ${i + 1}: statement must be inside a scene or branch; the top level holds declarations only, so move it into a scene`,
      ),
      data: [{ name: "Wrap in scene start", done: "Wrapped.", changes: [{ from: 0, to: 1, insert: "a" }] }],
    })),
  });
  problems.record({
    uri: "file://local/scripts/chapter_1.sd",
    diagnostics: Array.from({ length: count - half }, (_, i) =>
      diagnostic(20 + i, 1, `Chapter problem number ${i + 1}`),
    ),
  });
  if (playing) {
    for (let i = 0; i < 6; i += 1) {
      problems.recordPlayed({ severity: "info", title: `Said line ${i + 1}`, message: "" });
    }
  }
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(ProblemsDialog, null), host));
  await act(async () => problems.openDialog({ kind: "story" }, () => null));
  await settle();
  const markup = document.body.innerHTML;
  await act(async () => problems.closeDialog());
  await settle();
  await act(async () => render(null, host));
  document.body.innerHTML = "";
  return markup;
};

const stylesFor = async (markup: string) => {
  const compiler = await compile('@import "./src/style.css";', {
    base: UI_PACKAGE,
    onDependency: () => {},
  });
  const candidates = [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
    match[1]!.replace(/&amp;/g, "&").split(/\s+/),
  );
  return compiler.build(candidates);
};

const measure = async (markup: string) => {
  const css = await stylesFor(markup);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 430, height: 932 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="phone" data-pointer="coarse"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0;height:100vh">${markup}</body></html>`,
    );
    return await page.evaluate(async () => {
      const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      await frame();
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
      const scrollers = [dialog, ...dialog.querySelectorAll<HTMLElement>("*")].filter((element) => {
        const overflow = getComputedStyle(element).overflowY;
        return (overflow === "auto" || overflow === "scroll") && element.scrollHeight > element.clientHeight + 1;
      });
      const entries = [...dialog.querySelectorAll<HTMLElement>("[data-problem-entry]")];
      const hidden: string[] = [];
      for (const entry of entries) {
        const target = entry.firstElementChild as HTMLElement;
        target.scrollIntoView({ block: "center" });
        await frame();
        const box = target.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        if (!hit || !entry.contains(hit)) {
          hidden.push(target.textContent ?? "");
        }
      }
      const clipped: string[] = [];
      const overlapping: string[] = [];
      for (const entry of entries) {
        const row = entry.querySelector<HTMLElement>("[data-message-entry]")!;
        row.scrollIntoView({ block: "start" });
        await frame();
        const rowBox = row.getBoundingClientRect();
        const texts = [...row.querySelectorAll<HTMLElement>("strong, p")];
        for (const text of texts) {
          const box = text.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(text);
          const lines = [...range.getClientRects()];
          const lastLine = lines[lines.length - 1];
          if (
            text.scrollHeight > text.clientHeight + 1 ||
            text.scrollWidth > text.clientWidth + 1 ||
            (lastLine && (lastLine.bottom > rowBox.bottom + 1 || lastLine.right > rowBox.right + 1))
          ) {
            clipped.push(text.textContent ?? "");
          }
          for (const control of row.querySelectorAll<HTMLElement>("button")) {
            if (text.contains(control)) continue;
            const c = control.getBoundingClientRect();
            if (c.left < box.right && c.right > box.left && c.top < box.bottom && c.bottom > box.top) {
              overlapping.push(`${control.textContent} over ${text.textContent}`);
            }
          }
        }
      }
      return { scrollers: scrollers.length, entries: entries.length, hidden, clipped, overlapping };
    });
  } finally {
    await browser.close();
  }
};

describe("the whole-story Problems dialog on a 430x932 touch phone", () => {
  it.each([
    [16, false],
    [3, false],
    [16, true],
    [0, false],
    [0, true],
  ])(
    "with %i problems (playing: %s) scrolls as one column and every problem can be scrolled into view uncovered",
    async (count, playing) => {
      const result = await measure(await markupFor(count, playing));
      expect(result.entries).toBe(count);
      expect(result.hidden).toEqual([]);
      expect(result.clipped).toEqual([]);
      expect(result.overlapping).toEqual([]);
      expect(result.scrollers).toBe(count === 16 ? 1 : Math.min(result.scrollers, 1));
    },
    60000,
  );
});
