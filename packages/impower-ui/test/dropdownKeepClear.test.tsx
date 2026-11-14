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

const open = async (height: number, kind: "hinted" | "plain") => {
  const [script, css] = await Promise.all([pageScript(), styles()]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height }, reducedMotion: "reduce" });
    await page.goto(`about:blank#${kind}`);
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="desktop"><head><style>${css}</style></head><body style="margin:0"></body></html>`,
    );
    await page.addScriptTag({ content: script });
    await page.locator("[data-face]").click();
    await page.locator('[role="menu"]').waitFor();
    await page.waitForTimeout(200);
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

  test.each([
    [560, "hinted"],
    [528, "plain"],
  ] as const)("at %ipx with a %s first row and no room for it on either side, it keeps that whole row in the menu and the window", async (height, kind) => {
    const placed = await open(height, kind);
    expect(placed.row.top).toBeGreaterThanOrEqual(placed.menu.top);
    expect(placed.row.bottom).toBeLessThanOrEqual(placed.menu.bottom);
    expect(placed.menu.top).toBeGreaterThanOrEqual(0);
    expect(placed.menu.bottom).toBeLessThanOrEqual(height);
  });
});
