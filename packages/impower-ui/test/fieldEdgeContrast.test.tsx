// @vitest-environment node
import { compile } from "@tailwindcss/node";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { browserAvailable } from "./browserAvailable";

const PACKAGE = process.cwd();
const FIXTURE = resolve(PACKAGE, "test/fixtures/fieldEdgePage.tsx");
const SOURCES = [
  FIXTURE,
  resolve(PACKAGE, "src/components/text-field/TextField.tsx"),
  resolve(PACKAGE, "src/components/select/Select.tsx"),
  resolve(PACKAGE, "src/components/switch/Switch.tsx"),
];
const THEMES = ["charcoal", "chalk", "ink", "paper", "graphite", "warm", "midnight", "dusk"];

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
    [...readFileSync(file, "utf8").matchAll(/["`]([^"`\r\n]*)["`]/g)].flatMap((match) => match[1]!.split(/\s+/)),
  );
  const compiler = await compile('@import "./src/style.css";', { base: PACKAGE, onDependency: () => {} });
  return compiler.build(candidates);
};

type Boundary = { theme: string; surface: string; field: string; border: string; fill: string; around: string };

let browser: Browser | undefined;
let boundaries: Boundary[] = [];

beforeAll(async () => {
  if (!browserAvailable) {
    return;
  }
  const [script, css] = await Promise.all([pageScript(), styles()]);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 }, reducedMotion: "reduce" });
  await page.setContent(
    `<!doctype html><html data-layout="desktop"><head><style>${css}</style></head><body style="margin:0">`,
  );
  await page.addScriptTag({ content: script });
  await page.locator("[data-field]").first().waitFor();
  for (const theme of THEMES) {
    boundaries.push(
      ...(await page.evaluate((name) => {
        document.documentElement.dataset["theme"] = name;
        return Array.from(document.querySelectorAll<HTMLElement>("[data-surface]")).flatMap((surface) =>
          Array.from(surface.querySelectorAll<HTMLElement>("[data-field]")).map((field) => {
            const style = getComputedStyle(field);
            return {
              theme: name,
              surface: surface.dataset["surface"]!,
              field: field.dataset["field"]!,
              border: style.borderTopColor,
              fill: style.backgroundColor,
              around: getComputedStyle(surface).backgroundColor,
            };
          }),
        );
      }, theme)),
    );
  }
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const channels = (color: string): [number, number, number, number] => {
  const parts = color.match(/[\d.]+/g)!.map(Number);
  return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
};

const over = (color: string, below: [number, number, number]): [number, number, number] => {
  const [r, g, b, a] = channels(color);
  return [r * a + below[0] * (1 - a), g * a + below[1] * (1 - a), b * a + below[2] * (1 - a)];
};

const luminance = (rgb: [number, number, number]) => {
  const [r, g, b] = rgb.map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
};

describe.skipIf(!browserAvailable)("a form control's boundary stands out from the surface around it, in a browser", () => {
  test("every theme renders each field on each surface", () => {
    expect(boundaries).toHaveLength(THEMES.length * 3 * 3);
  });

  test.each(THEMES)("in %s, the text field, select and switch reach 3:1 against the page, panel and inset well", (theme) => {
    const failures = boundaries
      .filter((boundary) => boundary.theme === theme)
      .map((boundary) => {
        const around = over(boundary.around, [255, 255, 255]);
        const fill = over(boundary.fill, around);
        const best = Math.max(contrast(over(boundary.border, fill), around), contrast(fill, around));
        return { ...boundary, best: Number(best.toFixed(2)) };
      })
      .filter((boundary) => boundary.best < 3);
    expect(failures).toEqual([]);
  });
});
