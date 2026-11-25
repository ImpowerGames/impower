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
  useStickyHeaders(withTopDialog: boolean): void;
  headersBox(): Box | null;
  stickyMarginApplied(): boolean;
  setCaretLine(line: number): void;
  setCaretAt(x: number, y: number): number | null;
  setCaretAtRowEnd(x: number, y: number): { head: number; assoc: number } | null;
  caretLine(): number;
  caretAtLineStart(): boolean;
  caretRow(): Box | null;
  lineBox(line: number): Box;
  scrollerBox(): Box & { left: number };
  edit(): void;
  openKeyboard(visibleHeight: number): void;
  keyboardOpen(): boolean;
  useBottomPanelOverKeyboard(): void;
  bottomPanelBox(): Box | null;
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

  it("leaves a caret at the end of a wrapped row where it is when the next row is below the screen", async () => {
    const page = await open();
    try {
      await page.evaluate(() => (window as unknown as HarnessWindow).caretOnScreen.useTallScript());
      await scrollTo(page, 1200);
      const caret = await page.evaluate(() => {
        const h = (window as unknown as HarnessWindow).caretOnScreen;
        const r = h.scrollerBox();
        const left = h.view.contentDOM.getBoundingClientRect().left;
        const placed = h.setCaretAtRowEnd(left + 20, r.bottom - 40)!;
        const row = h.caretRow()!;
        h.view.scrollDOM.scrollTop += row.bottom - (r.bottom - 2);
        return placed;
      });
      await frames(page);
      const before = await read(page);
      expect(caret.assoc).toBe(-1);
      expect(before.head).toBe(caret.head);
      expect(before.caretRow!.bottom).toBeLessThanOrEqual(before.scroller.bottom);
      expect(before.caretRow!.bottom).toBeGreaterThan(before.scroller.bottom - 6);

      await edit(page);
      const after = await read(page);

      expect(after.head).toBe(before.head);
      expect(after.scrollTop).toBe(before.scrollTop);
      expect(after.focused).toBe(true);
    } finally {
      await page.context().close();
    }
  });

  for (const [edge, visibleHeight] of [
    ["the scroller", null],
    ["an open keyboard", 500],
  ] as const) {
    it(`leaves a caret fully visible at the bottom edge of ${edge} where it is`, async () => {
      const page = await open();
      try {
        if (visibleHeight != null) {
          await page.evaluate(
            (height) => (window as unknown as HarnessWindow).caretOnScreen.openKeyboard(height),
            visibleHeight,
          );
          await frames(page);
        }
        await scrollTo(page, 2000);
        await page.evaluate((visibleHeight) => {
          const h = (window as unknown as HarnessWindow).caretOnScreen;
          const r = h.scrollerBox();
          const bottom = Math.min(r.bottom, visibleHeight ?? r.bottom);
          const left = h.view.contentDOM.getBoundingClientRect().left;
          h.setCaretAt(left + 20, bottom - 60);
          const row = h.caretRow()!;
          h.view.scrollDOM.scrollTop += row.bottom - (bottom - 2);
        }, visibleHeight);
        await frames(page);
        const before = await read(page);
        const bottom = Math.min(before.scroller.bottom, visibleHeight ?? before.scroller.bottom);
        expect(before.caretRow!.bottom).toBeLessThanOrEqual(bottom);
        expect(before.caretRow!.bottom).toBeGreaterThan(bottom - 6);

        await edit(page);
        const after = await read(page);

        expect(after.head).toBe(before.head);
        expect(after.focused).toBe(true);
        if (visibleHeight == null) {
          expect(after.scrollTop).toBe(before.scrollTop);
        } else {
          expect(after.caretRow!.bottom).toBeLessThanOrEqual(visibleHeight);
        }
      } finally {
        await page.context().close();
      }
    });
  }
});

describe("Edit keeps the script still under real sticky scene headers", () => {
  const SCENE_20_BODY_LINE = 3 + 7 * 19 + 1;

  const headers = (page: Page) =>
    page.evaluate(() => (window as unknown as HarnessWindow).caretOnScreen.headersBox());

  const settle = async (page: Page) => {
    await frames(page);
    await frames(page);
  };

  const scrollUnderHeader = async (page: Page, line: number) => {
    await page.evaluate((line) => {
      const h = (window as unknown as HarnessWindow).caretOnScreen;
      h.view.scrollDOM.scrollTop += h.lineBox(line).top - (h.scrollerBox().top + 2);
    }, line);
    await settle(page);
    await page.waitForFunction(() => {
      const h = (window as unknown as HarnessWindow).caretOnScreen;
      return h.headersBox() != null && h.stickyMarginApplied();
    });
  };

  it("leaves a caret fully visible below a top dialog where it is when the sticky header covers only the dialog", async () => {
    const page = await open();
    try {
      await page.evaluate((line) => {
        const h = (window as unknown as HarnessWindow).caretOnScreen;
        h.useStickyHeaders(true);
        h.setCaretLine(line);
      }, SCENE_20_BODY_LINE);
      await settle(page);
      await page.evaluate(() => {
        const h = (window as unknown as HarnessWindow).caretOnScreen;
        const row = h.caretRow()!;
        h.view.scrollDOM.scrollTop += row.top - (h.scrollerBox().top + 2);
      });
      await settle(page);
      await page.waitForFunction(() => {
        const h = (window as unknown as HarnessWindow).caretOnScreen;
        return h.headersBox() != null && h.stickyMarginApplied();
      });
      const header = await headers(page);
      const before = await read(page);
      expect(header).not.toBeNull();
      expect(header!.bottom).toBeLessThanOrEqual(before.scroller.top);
      expect(before.caretRow!.top).toBeGreaterThanOrEqual(before.scroller.top);
      expect(before.caretRow!.top).toBeLessThan(before.scroller.top + 6);

      await edit(page);
      const after = await read(page);

      expect(after.head).toBe(before.head);
      expect(after.scrollTop).toBe(before.scrollTop);
    } finally {
      await page.context().close();
    }
  });

  it("puts an off-screen caret below the sticky header when the header covers the script", async () => {
    const page = await open();
    try {
      await page.evaluate(() => {
        const h = (window as unknown as HarnessWindow).caretOnScreen;
        h.useStickyHeaders(false);
        h.setCaretLine(11);
      });
      await settle(page);
      await scrollUnderHeader(page, SCENE_20_BODY_LINE);
      const header = await headers(page);
      const before = await read(page);
      expect(header).not.toBeNull();
      expect(header!.bottom).toBeGreaterThan(before.scroller.top);

      await edit(page);
      const after = await read(page);

      expect(after.scrollTop).toBe(before.scrollTop);
      expect(after.atLineStart).toBe(true);
      expect(after.caretRow!.top).toBeGreaterThanOrEqual(header!.bottom - 1);
    } finally {
      await page.context().close();
    }
  });
});

describe("Opening the keyboard over the caret", () => {
  const VISIBLE_HEIGHT = 500;
  const CLEARANCE = 12;

  const openOverCaret = (page: Page) =>
    page.evaluate((visibleHeight) => {
      const h = (window as unknown as HarnessWindow).caretOnScreen;
      h.openKeyboard(visibleHeight);
      return {
        caretRow: h.caretRow(),
        panel: h.bottomPanelBox(),
        scroller: h.scrollerBox(),
        keyboardOpen: h.keyboardOpen(),
      };
    }, VISIBLE_HEIGHT);

  const caretUnderKeyboard = async (page: Page) => {
    await scrollTo(page, 2000);
    await placeCaret(page, 20, 0.85);
    await frames(page);
    await edit(page);
    const before = await read(page);
    expect(before.focused).toBe(true);
    expect(before.caretRow!.top).toBeGreaterThan(VISIBLE_HEIGHT);
    return before;
  };

  it("raises the caret above the keyboard in the same task the viewport reports it", async () => {
    const page = await open();
    try {
      const before = await caretUnderKeyboard(page);

      const opened = await openOverCaret(page);

      expect(opened.caretRow!.bottom).toBeLessThanOrEqual(VISIBLE_HEIGHT - CLEARANCE + 1);
      expect(opened.caretRow!.bottom).toBeGreaterThan(VISIBLE_HEIGHT - CLEARANCE - 6);
      expect(opened.keyboardOpen).toBe(true);
      await frames(page);
      const after = await read(page);
      expect(after.head).toBe(before.head);
      expect(after.caretRow!.bottom).toBe(opened.caretRow!.bottom);
    } finally {
      await page.context().close();
    }
  });

  it("keeps the script painted under a toolbar lifted onto the keyboard and the caret clear above that toolbar", async () => {
    const page = await open();
    try {
      await page.evaluate(() =>
        (window as unknown as HarnessWindow).caretOnScreen.useBottomPanelOverKeyboard(),
      );
      await frames(page);
      const before = await caretUnderKeyboard(page);

      const opened = await openOverCaret(page);

      expect(opened.panel!.bottom).toBeCloseTo(VISIBLE_HEIGHT, 0);
      expect(opened.scroller.bottom).toBeGreaterThan(VISIBLE_HEIGHT + 100);
      expect(opened.caretRow!.bottom).toBeLessThanOrEqual(opened.panel!.top - CLEARANCE + 1);
      expect(opened.caretRow!.bottom).toBeGreaterThan(opened.panel!.top - CLEARANCE - 6);
      await frames(page);
      const after = await read(page);
      expect(after.head).toBe(before.head);
      expect(after.caretRow!.bottom).toBe(opened.caretRow!.bottom);
    } finally {
      await page.context().close();
    }
  });
});
