// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCaretOnScreenPage } from "./harness/caret-on-screen.mjs";

interface Box {
  top: number;
  bottom: number;
}

interface Harness {
  stickyTop: number;
  caretMargin: number;
  revealCaret(): void;
  view: { scrollDOM: HTMLElement; contentDOM: HTMLElement; state: { selection: { main: { head: number } } } };
  setCaretLine(line: number): void;
  caretLine(): number;
  caretAtLineStart(): boolean;
  lineBox(line: number): Box;
  scrollerBox(): Box;
  edit(): void;
}

let browser: Browser;
let pageUrl: string;
let outDir: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "caret-on-screen-"));
  pageUrl = await buildCaretOnScreenPage(outDir);
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  rmSync(outDir, { recursive: true, force: true });
});

const open = async (): Promise<Page> => {
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(pageUrl);
  await page.waitForFunction(() => "caretOnScreen" in window);
  return page;
};

const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100))),
      ),
  );

const scrollTo = async (page: Page, top: number) => {
  await page.evaluate((top) => {
    const h = (window as unknown as { caretOnScreen: Harness }).caretOnScreen;
    h.view.scrollDOM.scrollTop = top;
  }, top);
  await frames(page);
};

const read = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as { caretOnScreen: Harness }).caretOnScreen;
    const line = h.caretLine();
    return {
      scrollTop: h.view.scrollDOM.scrollTop,
      line,
      head: h.view.state.selection.main.head,
      atLineStart: h.caretAtLineStart(),
      caretBox: h.lineBox(line),
      aboveBox: line > 1 ? h.lineBox(line - 1) : null,
      scroller: h.scrollerBox(),
      stickyTop: h.stickyTop,
      caretMargin: h.caretMargin,
      focused: document.activeElement === h.view.contentDOM,
    };
  });

const edit = async (page: Page) => {
  await page.evaluate(() => (window as unknown as { caretOnScreen: Harness }).caretOnScreen.edit());
  await frames(page);
};

const revealCaret = async (page: Page) => {
  await page.evaluate(() => (window as unknown as { caretOnScreen: Harness }).caretOnScreen.revealCaret());
  await frames(page);
};

describe("Edit keeps the script still", () => {
  it("moves an off-screen caret to the start of the first line fully on screen, below the sticky headers, so neither Edit nor the keyboard's caret reveal scrolls", async () => {
    const page = await open();
    try {
      await page.evaluate(() => (window as unknown as { caretOnScreen: Harness }).caretOnScreen.setCaretLine(11));
      await scrollTo(page, 4081);
      await page.evaluate(() => {
        const h = (window as unknown as { caretOnScreen: Harness }).caretOnScreen;
        const line = h.lineBox(150);
        h.view.scrollDOM.scrollTop += line.top - (h.scrollerBox().top + h.stickyTop + 3);
      });
      await frames(page);
      const before = await read(page);
      expect(before.scrollTop).toBeGreaterThan(1000);
      expect(before.caretBox.bottom).toBeLessThan(before.scroller.top);

      await edit(page);
      const after = await read(page);

      expect(after.scrollTop).toBe(before.scrollTop);
      expect(after.focused).toBe(true);
      expect(after.atLineStart).toBe(true);
      expect(after.caretBox.top).toBeGreaterThanOrEqual(after.scroller.top + after.stickyTop - 1);
      expect(after.caretBox.bottom).toBeLessThanOrEqual(after.scroller.bottom + 1);
      expect(after.aboveBox!.top).toBeLessThan(
        after.scroller.top + after.stickyTop + after.caretMargin - 1,
      );

      await revealCaret(page);
      expect((await read(page)).scrollTop).toBe(before.scrollTop);
    } finally {
      await page.context().close();
    }
  });

  it("leaves a caret already on screen where it is, and the keyboard's caret reveal scrolls nothing", async () => {
    const page = await open();
    try {
      await scrollTo(page, 4081);
      const target = await page.evaluate(() => {
        const h = (window as unknown as { caretOnScreen: Harness }).caretOnScreen;
        const view = h.view as unknown as {
          scrollDOM: HTMLElement;
          posAtCoords(c: { x: number; y: number }): number | null;
          contentDOM: HTMLElement;
          dispatch(spec: { selection: { anchor: number } }): void;
        };
        const r = view.scrollDOM.getBoundingClientRect();
        const left = view.contentDOM.getBoundingClientRect().left;
        const pos = view.posAtCoords({ x: left + 120, y: r.top + r.height / 2 })!;
        view.dispatch({ selection: { anchor: pos } });
        return pos;
      });
      await frames(page);
      const before = await read(page);
      expect(before.head).toBe(target);
      expect(before.atLineStart).toBe(false);

      await edit(page);
      const after = await read(page);

      expect(after.scrollTop).toBe(before.scrollTop);
      expect(after.focused).toBe(true);
      expect(after.head).toBe(target);

      await revealCaret(page);
      expect((await read(page)).scrollTop).toBe(before.scrollTop);
    } finally {
      await page.context().close();
    }
  });
});
