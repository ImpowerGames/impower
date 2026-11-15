// @vitest-environment node
import { compile, optimize } from "@tailwindcss/node";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SRC = resolve("../packages/impower-ui/src");
const PAGE = resolve("test/components/outlineRailScrollPage.tsx");

const gapAfter = (depth: number, next: number | undefined) =>
  next === undefined ? 6 * depth : 2 + 6 * Math.max(0, depth - next);

const expectedTops = (depths: number[]) => {
  const tops = [0];
  depths.forEach((depth, i) => tops.push(tops[i]! + 44 + gapAfter(depth, depths[i + 1])));
  return tops;
};

let browser: Browser;
let script: string;
let css: string;

beforeAll(async () => {
  const bundle = await build({
    entryPoints: [PAGE],
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    jsxImportSource: "preact",
    alias: { react: "preact/compat", "react-dom": "preact/compat", "react/jsx-runtime": "preact/jsx-runtime" },
    logLevel: "silent",
  });
  script = bundle.outputFiles[0]!.text;
  const sources = [
    join(SRC, "components/list-row/ListRow.tsx"),
    join(SRC, "components/virtual-list/VirtualList.tsx"),
    PAGE,
    resolve("src/modules/spark-editor/components/outline/railLayout.ts"),
  ];
  const candidates = sources.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/"([^"\r\n]*)"/g)].flatMap((match) => match[1]!.split(/\s+/)),
  );
  const compiler = await compile(readFileSync(join(SRC, "style.css"), "utf8"), { base: SRC, onDependency: () => {} });
  css = optimize(compiler.build(candidates), { minify: false }).code;
  browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

const open = async (): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent(
    `<!doctype html><html data-theme="charcoal" data-layout="desktop" data-pointer="fine"><head><style>${css}</style></head><body style="margin:0"></body></html>`,
  );
  await page.addScriptTag({ content: script });
  await page.locator('[role="listitem"]').first().waitFor();
  return page;
};

const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

const read = (page: Page) =>
  page.evaluate(() => {
    const list = document.querySelector('[role="list"]')!;
    const scroller = list.parentElement!;
    const origin = list.getBoundingClientRect().top;
    const view = scroller.getBoundingClientRect();
    return {
      depths: window.rail.rows().map((row) => row.depth),
      keys: window.rail.rows().map((row) => row.key),
      height: list.getBoundingClientRect().height,
      scrollTop: scroller.scrollTop,
      maxScroll: scroller.scrollHeight - scroller.clientHeight,
      view: { top: view.top, bottom: view.bottom },
      rendered: [...list.querySelectorAll('[role="listitem"]')].map((item) => {
        const row = item.firstElementChild!.getBoundingClientRect();
        return {
          index: Number(item.getAttribute("aria-posinset")) - 1,
          top: row.top - origin,
          height: row.height,
          viewTop: row.top,
          viewBottom: row.bottom,
        };
      }),
    };
  });

describe("the Outline rail's list, scrolled in Chromium", () => {
  it("places every row at the prototype's spacing down to the last row of a long outline, without drift", async () => {
    const page = await open();
    try {
      const start = await read(page);
      const tops = expectedTops(start.depths);
      expect(start.height).toBe(tops[tops.length - 1]);
      await page.evaluate(() => {
        const scroller = document.querySelector('[role="list"]')!.parentElement!;
        scroller.scrollTop = scroller.scrollHeight;
      });
      await frames(page);
      const end = await read(page);
      expect(end.scrollTop).toBe(end.maxScroll);
      const last = end.rendered.find((r) => r.index === end.depths.length - 1);
      expect(last).toBeDefined();
      for (const r of [...start.rendered, ...end.rendered]) {
        expect(r.top, `row ${r.index}`).toBe(tops[r.index]);
        expect(r.height, `row ${r.index}`).toBe(44);
      }
      expect(last!.viewBottom).toBeLessThanOrEqual(end.view.bottom);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("reveals a row wholly in view, at the same offset its neighbours give it", async () => {
    const page = await open();
    try {
      const { depths } = await read(page);
      const target = depths.length - 20;
      await page.evaluate((index) => window.rail.reveal(index), target);
      await frames(page);
      const after = await read(page);
      const row = after.rendered.find((r) => r.index === target)!;
      expect(row.top).toBe(expectedTops(depths)[target]);
      expect(row.viewTop).toBeGreaterThanOrEqual(after.view.top);
      expect(row.viewBottom).toBeLessThanOrEqual(after.view.bottom);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("moves the rows below a folded scene up by exactly its group's extent", async () => {
    const page = await open();
    try {
      const before = await read(page);
      const beforeTops = expectedTops(before.depths);
      const next = before.keys.indexOf("s1");
      const group = beforeTops[next]! - beforeTops[0]! - 44 - 2;
      await page.evaluate(() => window.rail.fold(0));
      await frames(page);
      const after = await read(page);
      expect(after.keys.indexOf("s1")).toBe(1);
      const moved = after.rendered.find((r) => r.index === 1)!;
      const was = before.rendered.find((r) => r.index === next)!;
      expect(was.top - moved.top).toBe(group);
      expect(moved.top).toBe(46);
      for (const r of after.rendered) {
        expect(r.top, `row ${r.index}`).toBe(expectedTops(after.depths)[r.index]);
      }
    } finally {
      await page.close();
    }
  }, 60_000);
});
