// @vitest-environment node
import { compile } from "@tailwindcss/node";
import { build } from "esbuild";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { describe, expect, test } from "vitest";

const PACKAGE = process.cwd();
const WIDTH = 430;

const browserAvailable = existsSync(chromium.executablePath());

const pageScript = async () => {
  const bundle = await build({
    entryPoints: [resolve(PACKAGE, "test/fixtures/dropdownSheetKeepClearPage.tsx")],
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
    resolve(PACKAGE, "test/fixtures/dropdownSheetKeepClearPage.tsx"),
  ].filter((file) => file.endsWith(".tsx"));
  const candidates = sources.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/"([^"\r\n]*)"/g)].flatMap((match) => match[1]!.split(/\s+/)),
  );
  const compiler = await compile('@import "./src/style.css";', { base: PACKAGE, onDependency: () => {} });
  return compiler.build(candidates);
};

const withSheet = async (height: number, kind: "short" | "tall", run: (page: Page) => Promise<void>) => {
  const [script, css] = await Promise.all([pageScript(), styles()]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height }, reducedMotion: "reduce" });
    await page.goto(`about:blank#${kind}`);
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="phone"><head><style>${css}</style></head><body style="margin:0"></body></html>`,
    );
    await page.addScriptTag({ content: script });
    await run(page);
  } finally {
    await browser.close();
  }
};

const open = async (page: Page) => {
  await page.locator("[data-face]").click();
  await page.locator('[role="menu"]').waitFor();
  await page.waitForTimeout(300);
};

const boxOf = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const rect = document.querySelector(selector)!.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height };
  }, selector);

describe.skipIf(!browserAvailable)("the Dropdown's phone-layout sheet kept clear of a picture, opened in a browser", () => {
  test("leaves the picture undimmed and uncovered, with the sheet and its backdrop below it", async () => {
    await withSheet(932, "short", async (page) => {
      const picture = await boxOf(page, "[data-picture]");
      const clip = { x: picture.left, y: picture.top, width: picture.width, height: picture.height };
      const before = await page.screenshot({ clip });
      await open(page);
      const after = await page.screenshot({ clip });
      expect(after.equals(before)).toBe(true);
      const sheet = await boxOf(page, '[role="dialog"]');
      expect(sheet.top).toBeGreaterThanOrEqual(picture.bottom + 6);
      const hit = await page.evaluate(
        ({ x, y }) => !!document.elementFromPoint(x, y)?.closest("[data-picture]"),
        { x: picture.left + picture.width / 2, y: picture.top + picture.height / 2 },
      );
      expect(hit).toBe(true);
    });
  });

  test("previews an option when it takes focus or the pointer enters it, and focuses the chosen option on opening", async () => {
    await withSheet(932, "short", async (page) => {
      await open(page);
      expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("happy");
      await page.getByRole("menuitemradio", { name: "angry" }).focus();
      expect(await page.evaluate(() => document.body.dataset.previewed)).toBe("angry");
      await page.getByRole("menuitemradio", { name: "sad" }).hover();
      expect(await page.evaluate(() => document.body.dataset.previewed)).toBe("sad");
    });
  });

  test("stays open for a press on the picture, which reaches it, and closes for a press on the backdrop", async () => {
    await withSheet(932, "short", async (page) => {
      await open(page);
      await page.locator("[data-picture-button]").click();
      expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-picture-button"))).toBe(true);
      expect(await page.locator('[role="dialog"]').count()).toBe(1);
      const sheet = await boxOf(page, '[role="dialog"]');
      const picture = await boxOf(page, "[data-picture]");
      await page.mouse.click(WIDTH / 2, (picture.bottom + sheet.top) / 2 + 3);
      await page.waitForTimeout(300);
      expect(await page.locator('[role="dialog"]').count()).toBe(0);
    });
  });

  test("in a window too short for a whole row below the picture, it rises over the picture by the shortfall alone", async () => {
    await withSheet(480, "tall", async (page) => {
      await open(page);
      const sheet = await boxOf(page, '[role="dialog"]');
      const row = await boxOf(page, '[role="menuitemradio"]');
      expect(row.top).toBeGreaterThanOrEqual(sheet.top);
      expect(row.bottom).toBeLessThanOrEqual(480);
      expect(sheet.top).toBeGreaterThan(480 - (row.height + 24));
    });
  });
});
