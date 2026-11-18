// @vitest-environment node
import { compile } from "@tailwindcss/node";
import { build } from "esbuild";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { describe, expect, test } from "vitest";
import { browserAvailable } from "./browserAvailable";

const PACKAGE = process.cwd();
const FIXTURE = resolve(PACKAGE, "test/fixtures/sheetInitialFocusPage.tsx");

const pageScript = async () => {
  const bundle = await build({
    entryPoints: [FIXTURE],
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
    FIXTURE,
  ].filter((file) => /\.tsx?$/.test(file));
  const candidates = sources.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/"([^"\r\n]*)"/g)].flatMap((match) => match[1]!.split(/\s+/)),
  );
  const compiler = await compile('@import "./src/style.css";', { base: PACKAGE, onDependency: () => {} });
  return compiler.build(candidates);
};

const withPage = async (run: (page: Page) => Promise<void>) => {
  const [script, css] = await Promise.all([pageScript(), styles()]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 430, height: 932 }, reducedMotion: "reduce", hasTouch: true, isMobile: true });
    await page.setContent(
      `<!doctype html><html data-theme="chalk" data-layout="phone"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0"></body></html>`,
    );
    await page.addScriptTag({ content: script });
    await run(page);
  } finally {
    await browser.close();
  }
};

const ring = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => ({
    focused: element === document.activeElement,
    focusVisible: element.matches(":focus-visible"),
    outline: getComputedStyle(element).outlineStyle,
  }));

const CHECKED = '[role="menuitemradio"][aria-checked="true"]';

const settle = async (page: Page, selector: string) => {
  await page.locator(selector).waitFor();
  await page.waitForTimeout(300);
};

describe.skipIf(!browserAvailable)("a sheet's initial focus draws a ring only when a key opened it, in a browser", () => {
  test("the checked row of a menu sheet tapped open after a key press is focused without a ring", async () => {
    await withPage(async (page) => {
      await page.keyboard.press("Shift");
      await page.locator("[data-menu-trigger]").tap();
      await settle(page, CHECKED);
      expect(await ring(page, CHECKED)).toEqual({ focused: true, focusVisible: false, outline: "none" });
    });
  }, 60_000);

  test("the checked row of a menu sheet tapped open with no key pressed is focused without a ring", async () => {
    await withPage(async (page) => {
      await page.locator("[data-menu-trigger]").tap();
      await settle(page, CHECKED);
      expect(await ring(page, CHECKED)).toEqual({ focused: true, focusVisible: false, outline: "none" });
    });
  }, 60_000);

  test("another sheet's initial focus is drawn without a ring when tapped open after a key press", async () => {
    await withPage(async (page) => {
      await page.keyboard.press("Shift");
      await page.locator("[data-sheet-trigger]").tap();
      await settle(page, "[data-sheet-close]");
      expect(await ring(page, "[data-sheet-close]")).toEqual({ focused: true, focusVisible: false, outline: "none" });
    });
  }, 60_000);

  test("another sheet's initial focus shows the ring when a key opened it", async () => {
    await withPage(async (page) => {
      await page.locator("[data-sheet-trigger]").focus();
      await page.keyboard.press("Enter");
      await settle(page, "[data-sheet-close]");
      expect(await ring(page, "[data-sheet-close]")).toEqual({ focused: true, focusVisible: true, outline: "solid" });
    });
  }, 60_000);
});
