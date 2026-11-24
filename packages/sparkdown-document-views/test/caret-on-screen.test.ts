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
  view: { scrollDOM: HTMLElement; contentDOM: HTMLElement; state: { selection: { main: { head: number } } } };
  useTallScript(): void;
  setCaretLine(line: number): void;
  setCaretAt(x: number, y: number): number | null;
  caretLine(): number;
  caretAtLineStart(): boolean;
  caretRow(): Box | null;
  lineBox(line: number): Box;
  scrollerBox(): Box & { left: number };
  edit(): void;
  openKeyboard(visibleHeight: number): void;
  keyboardOpen(): boolean;
}

type HarnessWindow = { caretOnScreen: Harness };

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
    (window as unknown as HarnessWindow).caretOnScreen.view.scrollDOM.scrollTop = top;
  }, top);
  await frames(page);
};

const placeLineBelowBand = async (page: Page, line: number, gap: number) => {
  await page.evaluate(
    ([line, gap]) => {
      const h = (window as unknown as HarnessWindow).caretOnScreen;
      const box = h.lineBox(line);
      h.view.scrollDOM.scrollTop += box.top - (h.scrollerBox().top + h.stickyTop + gap);
    },
    [line, gap] as const,
  );
  await frames(page);
};

const read = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as HarnessWindow).caretOnScreen;
    const line = h.caretLine();
    return {
      scrollTop: h.view.scrollDOM.scrollTop,
      line,
      head: h.view.state.selection.main.head,
      atLineStart: h.caretAtLineStart(),
      caretRow: h.caretRow(),
      caretBox: h.lineBox(line),
      aboveBox: line > 1 ? h.lineBox(line - 1) : null,
      scroller: h.scrollerBox(),
      stickyTop: h.stickyTop,
      caretMargin: h.caretMargin,
      focused: document.activeElement === h.view.contentDOM,
      keyboardOpen: h.keyboardOpen(),
    };
  });

const edit = async (page: Page) => {
  await page.evaluate(() => (window as unknown as HarnessWindow).caretOnScreen.edit());
  await frames(page);
};

const openKeyboard = async (page: Page) => {
  await page.evaluate(() => (window as unknown as HarnessWindow).caretOnScreen.openKeyboard(500));
  await frames(page);
};

const placeCaret = (page: Page, dx: number, fraction: number) =>
  page.evaluate(
    ([dx, fraction]) => {
      const h = (window as unknown as HarnessWindow).caretOnScreen;
      const r = h.scrollerBox();
      const left = h.view.contentDOM.getBoundingClientRect().left;
      return h.setCaretAt(left + dx, r.top + (r.bottom - r.top) * fraction);
    },
    [dx, fraction] as const,
  );

describe("Edit keeps the script still", () => {
  it("moves an off-screen caret to the start of the first line clear of the sticky headers, and opening the keyboard scrolls nothing", async () => {
    const page = await open();
    try {
      await page.evaluate(() => (window as unknown as HarnessWindow).caretOnScreen.setCaretLine(11));
      await scrollTo(page, 4081);
      await placeLineBelowBand(page, 150, 3);
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

      await openKeyboard(page);
      const typing = await read(page);
      expect(typing.keyboardOpen).toBe(true);
      expect(typing.scrollTop).toBe(before.scrollTop);
    } finally {
      await page.context().close();
    }
  });

  it("leaves a caret already on screen where it is, and opening the keyboard scrolls nothing", async () => {
    const page = await open();
    try {
      await scrollTo(page, 4081);
      const target = await placeCaret(page, 120, 0.25);
      await frames(page);
      const before = await read(page);
      expect(before.head).toBe(target);
      expect(before.atLineStart).toBe(false);

      await edit(page);
      const after = await read(page);

      expect(after.scrollTop).toBe(before.scrollTop);
      expect(after.focused).toBe(true);
      expect(after.head).toBe(target);

      await openKeyboard(page);
      const typing = await read(page);
      expect(typing.keyboardOpen).toBe(true);
      expect(typing.scrollTop).toBe(before.scrollTop);
    } finally {
      await page.context().close();
    }
  });

  it("leaves a caret fully visible just below the sticky headers where it is", async () => {
    const page = await open();
    try {
      await scrollTo(page, 4081);
      await placeLineBelowBand(page, 150, 3);
      await page.evaluate(() => (window as unknown as HarnessWindow).caretOnScreen.setCaretLine(150));
      await frames(page);
      const before = await read(page);
      expect(before.caretRow!.top).toBeGreaterThanOrEqual(before.scroller.top + before.stickyTop);
      expect(before.caretRow!.top).toBeLessThan(
        before.scroller.top + before.stickyTop + before.caretMargin,
      );

      await edit(page);
      const after = await read(page);

      expect(after.head).toBe(before.head);
      expect(after.scrollTop).toBe(before.scrollTop);
      expect(after.focused).toBe(true);
    } finally {
      await page.context().close();
    }
  });

  it("puts the caret on the first visual row clear of the sticky headers when one wrapped line fills the screen", async () => {
    const page = await open();
    try {
      await page.evaluate(() => {
        const h = (window as unknown as HarnessWindow).caretOnScreen;
        h.useTallScript();
        h.setCaretLine(1);
      });
      await frames(page);
      for (const nudge of [0, 4, 8, 12, 16, 20]) {
        await scrollTo(page, 1200 + nudge);
        await page.evaluate(() => (window as unknown as HarnessWindow).caretOnScreen.setCaretLine(1));
        await frames(page);
        const before = await read(page);
        expect(before.scrollTop).toBe(1200 + nudge);
        expect(before.caretBox.bottom).toBeLessThan(before.scroller.top + before.stickyTop);

        await edit(page);
        const after = await read(page);

        expect(after.scrollTop).toBe(before.scrollTop);
        expect(after.line).toBe(2);
        expect(after.caretRow!.top).toBeGreaterThanOrEqual(
          after.scroller.top + after.stickyTop + after.caretMargin - 1,
        );
        expect(after.caretRow!.bottom).toBeLessThanOrEqual(after.scroller.bottom + 1);
      }
    } finally {
      await page.context().close();
    }
  });
});
