// @vitest-environment node
import { compile } from "@tailwindcss/node";
import { build } from "esbuild";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { describe, expect, test } from "vitest";

const PACKAGE = process.cwd();
const PICTURE_BOTTOM = 414;

const browserAvailable = existsSync(chromium.executablePath());

const pageScript = async () => {
  const bundle = await build({
    entryPoints: [resolve(PACKAGE, "test/fixtures/dropdownKeepClearPage.tsx")],
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
    ...readdirSync(resolve(PACKAGE, "src/components/dropdown")).map((name) => resolve(PACKAGE, "src/components/dropdown", name)),
    resolve(PACKAGE, "test/fixtures/dropdownKeepClearPage.tsx"),
  ].filter((file) => file.endsWith(".tsx"));
  const candidates = sources.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/"([^"\r\n]*)"/g)].flatMap((match) => match[1]!.split(/\s+/)),
  );
  const compiler = await compile('@import "./src/style.css";', { base: PACKAGE, onDependency: () => {} });
  return compiler.build(candidates);
};

const open = async (height: number, kind: "hinted" | "plain", closing = false) => {
  const [script, css] = await Promise.all([pageScript(), styles()]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height }, reducedMotion: closing ? "no-preference" : "reduce" });
    await page.goto(`about:blank#${kind}`);
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="desktop"><head><style>${css}</style></head><body style="margin:0"></body></html>`,
    );
    await page.addScriptTag({ content: script });
    await page.locator("[data-face]").click();
    await page.locator('[role="menu"]').waitFor();
    await page.waitForTimeout(200);
    if (closing) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(60);
    }
    return await page.evaluate(() => {
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      };
      const menu = document.querySelector('[role="menu"]')!;
      return { menu: box(menu), row: box(menu.querySelector('[role="menuitemradio"]')!) };
    });
  } finally {
    await browser.close();
  }
};

describe.skipIf(!browserAvailable)("a DropdownContent kept clear of a picture, opened in a browser", () => {
  test("with room below, it opens under the picture as before", async () => {
    const placed = await open(900, "hinted");
    expect(placed.menu.top).toBeGreaterThanOrEqual(PICTURE_BOTTOM + 6);
    expect(placed.row.bottom).toBeLessThanOrEqual(placed.menu.bottom);
  });

  test("at 560px with the hinted first row, it gives up its margins to hold that whole row below its trigger, covering none of the picture", async () => {
    const placed = await open(560, "hinted");
    expect(placed.menu.top).toBeGreaterThanOrEqual(PICTURE_BOTTOM);
    expect(placed.row.top).toBeGreaterThanOrEqual(placed.menu.top);
    expect(placed.row.bottom).toBeLessThanOrEqual(placed.menu.bottom);
    expect(placed.menu.bottom).toBeLessThanOrEqual(560 - 4);
  });

  test("at 528px, it keeps its place below the picture while it fades out", async () => {
    const placed = await open(528, "plain", true);
    expect(placed.menu.top).toBeGreaterThanOrEqual(PICTURE_BOTTOM);
    expect(placed.menu.bottom).toBeLessThanOrEqual(528 - 4);
  });

  test("at 528px, where even the smallest margins leave no room for a whole row, it keeps to the room it has rather than flipping over the picture", async () => {
    const placed = await open(528, "plain");
    expect(placed.menu.top).toBeGreaterThanOrEqual(PICTURE_BOTTOM);
    expect(placed.menu.bottom).toBeLessThanOrEqual(528 - 4);
    expect(placed.menu.bottom).toBeGreaterThan(placed.menu.top);
  });
});
