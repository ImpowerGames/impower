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

const pageScript = async () => {
  const bundle = await build({
    entryPoints: [resolve(PACKAGE, "test/fixtures/sheetGestureClearancePage.tsx")],
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
    ...["dropdown", "dialog"].flatMap((folder) =>
      readdirSync(resolve(PACKAGE, "src/components", folder)).map((name) => resolve(PACKAGE, "src/components", folder, name)),
    ),
    ...readdirSync(resolve(PACKAGE, "src/utils")).map((name) => resolve(PACKAGE, "src/utils", name)),
    resolve(PACKAGE, "test/fixtures/sheetGestureClearancePage.tsx"),
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

const opened = async (kind: "app" | "long" | "menu", coarse: boolean, run: (page: Page) => Promise<void>) => {
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
    if (coarse) {
      await page.locator("[data-trigger]").tap();
    } else {
      await page.locator("[data-trigger]").click();
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

  test("with a mouse in a narrow window the Dropdown's sheet adds nothing at its foot", async () => {
    await opened("app", false, async (page) => {
      const box = await measured(page);
      expect(box.coarse).toBe(false);
      expect(box.role).toBe("dialog");
      expect(box.cardPaddingBottom).toBe("0px");
      expect(box.lastRow.bottom).toBe(box.inner - 6);
    });
  });

  test("with a mouse in a narrow window a Dropdown kept as a menu, as the Variants menu is, stays a menu with no foot clearance", async () => {
    await opened("menu", false, async (page) => {
      const box = await measured(page);
      expect(box.role).toBe("menu");
      expect(box.cardPaddingBottom).toBe("6px");
    });
  });
});
