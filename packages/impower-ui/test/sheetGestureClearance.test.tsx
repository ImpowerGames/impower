// @vitest-environment node
import { compile } from "@tailwindcss/node";
import { build } from "esbuild";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { describe, expect, test } from "vitest";

const PACKAGE = process.cwd();
const WIDTH = 430;
const HEIGHT = 807;

const browserAvailable = existsSync(chromium.executablePath());

const pageScript = async (fixture = "sheetGestureClearancePage") => {
  const bundle = await build({
    entryPoints: [resolve(PACKAGE, `test/fixtures/${fixture}.tsx`)],
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    jsxImportSource: "preact",
    alias: { react: "preact/compat", "react-dom": "preact/compat", "react/jsx-runtime": "preact/jsx-runtime" },
    logLevel: "silent",
  });
  return bundle.outputFiles[0]!.text;
};

const styles = async () => {
  const sources = [
    ...["dropdown", "dialog", "wheel-picker"].flatMap((folder) =>
      readdirSync(resolve(PACKAGE, "src/components", folder)).map((name) => resolve(PACKAGE, "src/components", folder, name)),
    ),
    ...readdirSync(resolve(PACKAGE, "src/utils")).map((name) => resolve(PACKAGE, "src/utils", name)),
    resolve(PACKAGE, "test/fixtures/sheetGestureClearancePage.tsx"),
    resolve(PACKAGE, "test/fixtures/nestedSheetClearancePage.tsx"),
  ].filter((file) => /\.tsx?$/.test(file));
  const candidates = sources.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/"([^"\r\n]*)"/g)].flatMap((match) => match[1]!.split(/\s+/)),
  );
  const compiler = await compile('@import "./src/style.css";', { base: PACKAGE, onDependency: () => {} });
  return compiler.build(candidates);
};

type Measured = {
  coarse: boolean;
  clearance: number;
  inner: number;
  sheet: { top: number; bottom: number; left: number; width: number };
  lastRow: { top: number; bottom: number };
  cardPaddingBottom: string;
  role: string | null;
};

const measured = (page: Page) =>
  page.evaluate((): Measured => {
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    const card = menu.closest<HTMLElement>('[role="dialog"]') ?? menu;
    const rows = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    const last = rows[rows.length - 1]!.getBoundingClientRect();
    const sheet = card.getBoundingClientRect();
    return {
      coarse: matchMedia("(pointer: coarse)").matches,
      clearance: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sheet-gesture-clearance")),
      inner: innerHeight,
      sheet: { top: sheet.top, bottom: sheet.bottom, left: sheet.left, width: sheet.width },
      lastRow: { top: last.top, bottom: last.bottom },
      cardPaddingBottom: getComputedStyle(card).paddingBottom,
      role: card.getAttribute("role"),
    };
  });

const opened = async (
  kind: "app" | "long" | "menu",
  coarse: boolean,
  run: (page: Page) => Promise<void>,
  opening: "tap" | "touch" | "click" = coarse ? "tap" : "click",
) => {
  const [script, css] = await Promise.all([pageScript(), styles()]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      reducedMotion: "reduce",
      hasTouch: coarse,
      isMobile: coarse,
    });
    await page.goto(`about:blank#${kind}`);
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="phone"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0"></body></html>`,
    );
    await page.addScriptTag({ content: script });
    const trigger = page.locator("[data-trigger]");
    if (opening === "tap") {
      await trigger.tap();
    } else if (opening === "touch") {
      await trigger.dispatchEvent("pointerdown", { pointerType: "touch", button: 0, bubbles: true, cancelable: true });
      await trigger.dispatchEvent("click");
    } else {
      await trigger.click();
    }
    await page.locator('[role="menu"]').waitFor();
    await page.waitForTimeout(300);
    await run(page);
  } finally {
    await browser.close();
  }
};

describe.skipIf(!browserAvailable)("a bottom sheet's last row and the phone's system-gesture strip", () => {
  test("under a touch pointer the App menu's sheet ends its last row above the clearance, flush at its sides and foot", async () => {
    await opened("app", true, async (page) => {
      const box = await measured(page);
      expect(box.coarse).toBe(true);
      expect(box.clearance).toBe(8);
      expect(box.role).toBe("dialog");
      expect(box.lastRow.bottom).toBeLessThanOrEqual(box.inner - box.clearance);
      expect(box.sheet.bottom).toBe(box.inner);
      expect(box.sheet.left).toBe(0);
      expect(box.sheet.width).toBe(WIDTH);
    });
  });

  test("under a touch pointer a scrolling sheet's last row clears the strip at the list's end, and the sheet keeps its box", async () => {
    await opened("long", true, async (page) => {
      const before = await measured(page);
      await page.evaluate(() => {
        const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
        menu.scrollTop = menu.scrollHeight;
      });
      await page.waitForTimeout(100);
      const after = await measured(page);
      expect(after.sheet).toEqual(before.sheet);
      expect(after.sheet.top).toBeGreaterThanOrEqual(after.inner * 0.2 - 0.5);
      expect(after.sheet.bottom).toBe(after.inner);
      expect(after.lastRow.bottom).toBeLessThanOrEqual(after.inner - after.clearance);
    });
  });

  test("on a device whose primary pointer is fine, the sheet a finger opens in a narrow window adds nothing at its foot", async () => {
    await opened("app", false, async (page) => {
      const box = await measured(page);
      expect(box.coarse).toBe(false);
      expect(box.role).toBe("dialog");
      expect(box.cardPaddingBottom).toBe("0px");
      expect(box.lastRow.bottom).toBe(box.inner - 6);
    }, "touch");
  });

  test("with a mouse in a narrow window the Dropdown opens as a menu with no foot clearance", async () => {
    await opened("menu", false, async (page) => {
      const box = await measured(page);
      expect(box.role).toBe("menu");
      expect(box.cardPaddingBottom).toBe("6px");
    });
  });
});

type Nested = {
  inner: number;
  clearance: number;
  page: { top: number; bottom: number; paddingBottom: string };
  region: { bottom: number };
  lastControl: { bottom: number };
  wheel: { top: number; bottom: number; height: number; paddingBottom: string } | null;
  centredRow: { bottom: number } | null;
};

const nested = async (wheel: boolean, coarse: boolean, viewport: { width: number; height: number }) => {
  const [script, css] = await Promise.all([pageScript("nestedSheetClearancePage"), styles()]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce", hasTouch: coarse, isMobile: coarse });
    await page.goto(`about:blank#${wheel ? "wheel" : "page"}`);
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="phone"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0"></body></html>`,
    );
    await page.addScriptTag({ content: script });
    await page.locator(wheel ? "[data-wheel-sheet]" : "[data-region]").waitFor();
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>("[data-scroller]")!;
      scroller.scrollTop = scroller.scrollHeight;
    });
    await page.waitForTimeout(100);
    return await page.evaluate((): Nested => {
      const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
      const card = document.querySelector<HTMLElement>("[data-region]")!.closest<HTMLElement>('[role="dialog"]')!;
      const controls = document.querySelectorAll("[data-control]");
      const sheet = document.querySelector<HTMLElement>("[data-wheel-sheet]");
      const wheelBox = sheet?.getBoundingClientRect();
      const row = rect('[data-wheel-sheet] [aria-selected="true"]');
      return {
        inner: innerHeight,
        clearance: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sheet-gesture-clearance")),
        page: { top: card.getBoundingClientRect().top, bottom: card.getBoundingClientRect().bottom, paddingBottom: getComputedStyle(card).paddingBottom },
        region: { bottom: rect("[data-region]")!.bottom },
        lastControl: { bottom: controls[controls.length - 1]!.getBoundingClientRect().bottom },
        wheel: wheelBox && sheet
          ? { top: wheelBox.top, bottom: wheelBox.bottom, height: wheelBox.height, paddingBottom: getComputedStyle(sheet).paddingBottom }
          : null,
        centredRow: row ? { bottom: row.bottom } : null,
      };
    });
  } finally {
    await browser.close();
  }
};

describe.skipIf(!browserAvailable)("a sheet laid out inside a full-screen flush Sheet and the phone's system-gesture strip", () => {
  test.each([
    ["portrait", { width: WIDTH, height: HEIGHT }],
    ["landscape", { width: HEIGHT, height: WIDTH }],
  ])("under a touch pointer in %s the wheel sheet inside the page reaches the screen's foot and holds one clearance", async (_, viewport) => {
    const box = await nested(true, true, viewport);
    expect(box.clearance).toBe(8);
    expect(box.page.bottom).toBe(box.inner);
    expect(box.region.bottom).toBe(box.inner);
    expect(box.wheel!.bottom).toBe(box.inner);
    expect(box.wheel!.paddingBottom).toBe("8px");
    expect(box.centredRow!.bottom).toBeLessThanOrEqual(box.inner - box.clearance);
  });

  test.each([
    ["portrait", { width: WIDTH, height: HEIGHT }],
    ["landscape", { width: HEIGHT, height: WIDTH }],
  ])("under a touch pointer in %s the page's last scrolled control ends above the clearance", async (_, viewport) => {
    const box = await nested(false, true, viewport);
    expect(box.page.bottom).toBe(box.inner);
    expect(box.lastControl.bottom).toBeLessThanOrEqual(box.inner - box.clearance);
  });

  test("with a mouse the page and the wheel sheet inside it add nothing at their foot", async () => {
    const box = await nested(true, false, { width: WIDTH, height: HEIGHT });
    expect(box.page.paddingBottom).toBe("0px");
    expect(box.wheel!.paddingBottom).toBe("0px");
    expect(box.wheel!.bottom).toBe(box.inner);
  });
});
