// @vitest-environment node
import { compile } from "@tailwindcss/node";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { describe, expect, test } from "vitest";
import { browserAvailable } from "./browserAvailable";

const PACKAGE = process.cwd();
const FIXTURE = resolve(PACKAGE, "test/fixtures/toastPlacementPage.tsx");
const SOURCES = [resolve(PACKAGE, "src/components/toast/Toast.tsx"), resolve(PACKAGE, "src/components/button/Button.tsx"), FIXTURE];

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
  const candidates = SOURCES.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/"([^"\r\n]*)"/g)].flatMap((match) => match[1]!.split(/\s+/)),
  );
  const compiler = await compile('@import "./src/style.css";', { base: PACKAGE, onDependency: () => {} });
  return compiler.build(candidates);
};

type Box = { left: number; right: number; top: number; bottom: number; width: number };

const place = async (layout: string, viewport: { width: number; height: number }, pane: { left: number; width: number }) => {
  const [script, css] = await Promise.all([pageScript(), styles()]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    await page.goto(`about:blank#${pane.left},${pane.width}`);
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="${layout}"><head><style>${css}</style></head><body style="margin:0">`,
    );
    await page.addScriptTag({ content: script });
    await page.locator("[data-toast]").waitFor();
    await page.waitForTimeout(200);
    return await page.evaluate(() => {
      const box = (element: Element): Box => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
      };
      const toast = document.querySelector("[data-toast]")!;
      return {
        toast: box(toast),
        message: box(toast.querySelector("span")!),
        action: box(toast.querySelector("button")!),
      };
    });
  } finally {
    await browser.close();
  }
};

describe.skipIf(!browserAvailable)("the toast stays readable inside its pane, in a browser", () => {
  test.each([
    ["the workspace column's 280px minimum", { left: 232, width: 280 }],
    ["a 636px workspace column", { left: 232, width: 636 }],
    ["a 1000px workspace column", { left: 232, width: 1000 }],
  ])("on desktop, at %s, sits in the title bar inside the column with its message and Undo showing", async (_name, pane) => {
    const { toast, message, action } = await place("desktop", { width: 1440, height: 900 }, pane);
    expect(toast.left).toBeGreaterThanOrEqual(pane.left + 14);
    expect(toast.right).toBeLessThanOrEqual(pane.left + pane.width - 14);
    expect(Math.abs((toast.left + toast.right) / 2 - (pane.left + pane.width / 2))).toBeLessThanOrEqual(1);
    expect(toast.top).toBeGreaterThanOrEqual(0);
    expect(toast.bottom).toBeLessThanOrEqual(76);
    expect(message.width).toBeGreaterThanOrEqual(120);
    expect(action.width).toBeGreaterThanOrEqual(44);
    expect(action.right).toBeLessThanOrEqual(toast.right);
  }, 60_000);

  test("on desktop, in a wide column, keeps 140px clear on each side for the title bar's name", async () => {
    const pane = { left: 232, width: 636 };
    const { toast } = await place("desktop", { width: 1440, height: 900 }, pane);
    expect(toast.left).toBeGreaterThanOrEqual(pane.left + 140);
    expect(toast.right).toBeLessThanOrEqual(pane.left + pane.width - 140);
  }, 60_000);

  test("on a phone it sits above the bottom navigation, inside the screen, with its message and Undo showing", async () => {
    const pane = { left: 0, width: 360 };
    const { toast, message, action } = await place("phone", { width: 360, height: 780 }, pane);
    expect(toast.left).toBeGreaterThanOrEqual(14);
    expect(toast.right).toBeLessThanOrEqual(346);
    expect(toast.bottom).toBeLessThanOrEqual(780 - 65 - 8);
    expect(message.width).toBeGreaterThanOrEqual(120);
    expect(action.width).toBeGreaterThanOrEqual(44);
  }, 60_000);
});
