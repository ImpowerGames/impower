import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DocumentSymbol } from "vscode-languageserver-protocol";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: {}, search: {} },
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: ScriptOutlineTab } = await import("../../src/modules/spark-editor/components/scripts-page/ScriptOutlineTab");

const SRC = resolve("../packages/impower-ui/src");

const scene = (name: string, line: number): DocumentSymbol => ({
  name,
  kind: 5,
  range: { start: { line, character: 0 }, end: { line: line + 2, character: 3 } },
  selectionRange: { start: { line, character: 0 }, end: { line, character: 5 } },
  children: [],
});

const tabMarkup = (count: number) => {
  workspace.outline.value = {
    uri: "file://p/main.sd",
    symbols: Array.from({ length: count }, (_, i) => scene(`scene_${i}`, i * 3)),
    diagnostics: [],
    firstContentLine: 0,
  };
  return renderToString(h(ScriptOutlineTab, null));
};

const PAGES = [
  { viewport: 768, layout: "compact", left: 76, right: 768, gutter: 16 },
  { viewport: 1440, layout: "desktop", left: 76, right: 795, gutter: 18 },
] as const;

let browser: Browser;
let css: string;
const markups: Record<string, string> = {};

beforeAll(async () => {
  markups.resting = tabMarkup(3);
  markups.scrolling = tabMarkup(40);
  const compiler = await compile(readFileSync(join(SRC, "style.css"), "utf8"), {
    base: SRC,
    onDependency: () => {},
  });
  const decoded = Object.values(markups)
    .join("")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
  css = optimize(compiler.build([...new Set(decoded.split(/[\s"']+/).filter(Boolean))]), { minify: false }).code;
  browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const measure = async (markup: string, page: (typeof PAGES)[number], theme: "charcoal" | "chalk") => {
  const tab = await browser.newPage({ viewport: { width: page.viewport, height: 900 } });
  try {
    await tab.setContent(
      `<!doctype html><html data-theme="${theme}" data-layout="${page.layout}" data-pointer="fine"><head><style>${css}</style></head><body style="margin:0"><div style="position:absolute;top:0;left:${page.left}px;width:${page.right - page.left}px;height:900px;display:flex;flex-direction:column">${markup}</div></body></html>`,
    );
    return await tab.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:absolute;top:0;left:-200px;width:100px;height:50px;visibility:hidden;overflow-y:scroll;scrollbar-width:thin;scrollbar-gutter:stable";
      document.body.appendChild(probe);
      document.documentElement.style.setProperty("--scrollbar-size", `${probe.offsetWidth - probe.clientWidth}px`);
      probe.remove();
      const list = document.querySelector('[role="list"]')!;
      const scroller = list.parentElement!;
      const search = document.querySelector('input[aria-label="Search this script"]')!.closest("label")!;
      const rows = [...list.querySelectorAll('[role="listitem"]')].map((item) => {
        const r = item.firstElementChild!.getBoundingClientRect();
        return { left: r.left, right: r.right };
      });
      const s = search.getBoundingClientRect();
      return {
        overflows: scroller.scrollHeight > scroller.clientHeight,
        scrollbar: scroller.offsetWidth - scroller.clientWidth,
        search: { left: s.left, right: s.right },
        rows,
      };
    });
  } finally {
    await tab.close();
  }
};

describe("the Scripts page's In this script list, in Chromium", () => {
  for (const page of PAGES) {
    for (const theme of ["charcoal", "chalk"] as const) {
      it(`keeps its rows ${page.gutter}px inside the page at ${page.viewport} in ${theme}, with or without a scrollbar`, async () => {
        const resting = await measure(markups.resting!, page, theme);
        const scrolling = await measure(markups.scrolling!, page, theme);
        expect(resting.overflows).toBe(false);
        expect(scrolling.overflows).toBe(true);
        expect(scrolling.scrollbar).toBeGreaterThan(0);
        for (const m of [resting, scrolling]) {
          expect(m.rows.length).toBeGreaterThan(0);
          for (const row of m.rows) {
            expect(row.left).toBe(page.left + page.gutter);
            expect(row.right).toBe(page.right - page.gutter);
          }
          expect(m.search.left).toBe(page.left + page.gutter);
          expect(m.search.right).toBe(page.right - page.gutter);
        }
      }, 60_000);
    }
  }
});
