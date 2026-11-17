// @vitest-environment node
import { compile } from "@tailwindcss/node";
import { build } from "esbuild";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { describe, expect, test } from "vitest";

const PACKAGE = process.cwd();
const FIXTURE = resolve(PACKAGE, "test/fixtures/dropdownEdgeGapPage.tsx");

const browserAvailable = existsSync(chromium.executablePath());

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
    ...readdirSync(resolve(PACKAGE, "src/components/dropdown")).map((name) => resolve(PACKAGE, "src/components/dropdown", name)),
    FIXTURE,
  ].filter((file) => /\.tsx?$/.test(file));
  const candidates = sources.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/"([^"\r\n]*)"/g)].flatMap((match) => match[1]!.split(/\s+/)),
  );
  const compiler = await compile('@import "./src/style.css";', { base: PACKAGE, onDependency: () => {} });
  return compiler.build(candidates);
};

const menuBox = async (width: number, hash: string) => {
  const [script, css] = await Promise.all([pageScript(), styles()]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: "reduce" });
    await page.goto(`about:blank${hash}`);
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="desktop"><head><style>${css}</style></head><body style="margin:0">`,
    );
    await page.addScriptTag({ content: script });
    await page.locator("[data-trigger]").click();
    await page.locator('[role="menu"]').waitFor();
    await page.waitForTimeout(300);
    return await page.evaluate(() => {
      const box = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      };
      return { trigger: box("[data-trigger]"), menu: box('[role="menu"]'), window: innerWidth };
    });
  } finally {
    await browser.close();
  }
};

describe.skipIf(!browserAvailable)("a dropdown keeps its edge gap from the window unless its caller sets another, in a browser", () => {
  test("by default an end-aligned menu stops 12px short of the window's right edge, inside its trigger's", async () => {
    const { trigger, menu, window } = await menuBox(1440, "");
    expect(trigger.right).toBe(window - 10);
    expect(menu.right).toBe(window - 12);
  }, 60_000);

  test("with an edge gap of 0 its right edge sits on its trigger's", async () => {
    const { trigger, menu } = await menuBox(1440, "#flush");
    expect(menu.right).toBe(trigger.right);
  }, 60_000);

  test.each([430, 320])("with an edge gap of 0 it stays inside a %ipx window", async (width) => {
    const { menu, window } = await menuBox(width, "#flush");
    expect(menu.left).toBeGreaterThanOrEqual(0);
    expect(menu.right).toBeLessThanOrEqual(window);
  }, 60_000);
});
