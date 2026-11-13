// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildGutterMarksPage } from "./harness/gutter-marks.mjs";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Mark {
  kind: string;
  label: string | null;
  box: Box;
  glyph: Box;
  lineCentre: number;
}

let browser: Browser;
let pageUrl: string;
let outDir: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "gutter-marks-"));
  pageUrl = await buildGutterMarksPage(outDir);
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  rmSync(outDir, { recursive: true, force: true });
});

const open = async (coarse: boolean): Promise<Page> => {
  const context = await browser.newContext({
    viewport: { width: 430, height: 600 },
    hasTouch: coarse,
    isMobile: coarse,
  });
  const page = await context.newPage();
  await page.goto(pageUrl);
  await page.waitForFunction(() => "gutterMarks" in window);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page;
};

const marks = (page: Page): Promise<Mark[]> =>
  page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const kinds = ["cm-choice-marker", "cm-breakpoint", "cm-fold-marker"];
    return [...document.querySelectorAll(kinds.map((k) => `.${k}`).join(","))]
      .filter((el) => (el as HTMLElement).offsetParent !== null && !el.closest("[style*='visibility']"))
      .map((el) => {
        const glyph = el.querySelector(".cm-gutter-button-glyph") ?? el;
        const lineAt = (el as HTMLElement).dataset["line"];
        const view = (window as unknown as { gutterMarks: { view: { lineBlockAt(pos: number): { top: number; height: number }; state: { doc: { line(n: number): { from: number } } }; documentTop: number } } }).gutterMarks.view;
        const block = lineAt ? view.lineBlockAt(view.state.doc.line(Number(lineAt)).from) : null;
        return {
          kind: kinds.find((k) => el.classList.contains(k))!,
          label: el.getAttribute("aria-label"),
          box: box(el),
          glyph: box(glyph),
          lineCentre: block ? view.documentTop + block.top + block.height / 2 : NaN,
        };
      });
  });

const setPinned = (page: Page, pinned: boolean) =>
  page.evaluate(async (value) => {
    (window as unknown as { gutterMarks: { setPinned(p: boolean): void } }).gutterMarks.setPinned(value);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, pinned);

describe.each([
  ["a fine pointer", false, 16],
  ["a coarse pointer", true, 44],
])("every gutter mark under %s", (_label, coarse, target) => {
  it("draws its glyph at 16 by 16 inside a target of the pointer's size", async () => {
    const page = await open(coarse);
    const found = await marks(page);
    expect(new Set(found.map((m) => m.kind))).toEqual(
      new Set(["cm-choice-marker", "cm-breakpoint", "cm-fold-marker"]),
    );
    for (const mark of found) {
      expect([mark.kind, mark.glyph.width, mark.glyph.height]).toEqual([mark.kind, 16, 16]);
      expect([mark.kind, mark.box.width, mark.box.height]).toEqual([mark.kind, target, target]);
      expect(mark.glyph.left + 8).toBeCloseTo(mark.box.left + mark.box.width / 2, 1);
      expect(mark.glyph.top + 8).toBeCloseTo(mark.box.top + mark.box.height / 2, 1);
    }
    await page.context().close();
  });

  it("centres a choice marker's glyph on its line and keeps its box when pinned and unpinned", async () => {
    const page = await open(coarse);
    const choice = async () => (await marks(page)).find((m) => m.kind === "cm-choice-marker" && m.label?.endsWith("line 3"))!;
    const auto = await choice();
    expect(auto.label).toBe("Choice the preview made on line 3");
    expect(auto.glyph.top + 8).toBeCloseTo(auto.lineCentre, 0);
    await setPinned(page, true);
    const pinned = await choice();
    expect(pinned.label).toBe("Pinned choice on line 3");
    expect(pinned.box).toEqual(auto.box);
    expect(pinned.glyph).toEqual(auto.glyph);
    await setPinned(page, false);
    expect((await choice()).box).toEqual(auto.box);
    await page.context().close();
  });
});
