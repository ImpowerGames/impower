import { compile } from "@tailwindcss/node";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { renderToString } from "preact-render-to-string";
import { describe, expect, test } from "vitest";
import PreviewStrip, { type PreviewStripStatus } from "../src/components/preview-strip/PreviewStrip";

const PACKAGE = process.cwd();

const browserAvailable = existsSync(chromium.executablePath());

const icon = (
  <svg viewBox="0 0 16 16">
    <path d="M8 1L15 14H1Z" fill="currentColor" />
  </svg>
);

const status = (key: "problem" | "forced"): PreviewStripStatus => ({
  key,
  tone: key === "problem" ? "error" : "warning",
  icon,
  text: key === "problem" ? "There is no character called INSPECTER here" : "Forced to reach this line",
  onPress: () => {},
});

const markupOf = (statuses: PreviewStripStatus[]) =>
  renderToString(
    <PreviewStrip label="ACTION" words="You found four clues, and every one of them points back." statuses={statuses} />,
  );

const stylesFor = async (markup: string) => {
  const compiler = await compile('@import "./src/style.css";', { base: PACKAGE, onDependency: () => {} });
  const candidates = [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
    match[1]!.replace(/&amp;/g, "&").split(/\s+/),
  );
  return compiler.build(candidates);
};

interface Measured {
  key: string;
  top: number;
  bottom: number;
  height: number;
  x: number;
  y: number;
}

const measure = async (markup: string, width: number) => {
  const css = await stylesFor(markup);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 780 }, isMobile: true, hasTouch: true });
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="phone"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>${markup}</body></html>`,
    );
    await page.evaluate(() => {
      const pressed: (string | null)[] = [];
      (window as unknown as { pressed: (string | null)[] }).pressed = pressed;
      document.addEventListener("click", (event) => {
        const row = (event.target as Element).closest("[data-preview-strip-status]");
        pressed.push(row?.getAttribute("data-preview-strip-status") ?? null);
      });
    });
    const { strip, rows } = await page.evaluate(() => {
      const section = document.querySelector("[data-preview-strip]")!.getBoundingClientRect();
      return {
        strip: { top: section.top, bottom: section.bottom },
        rows: Array.from(document.querySelectorAll<HTMLElement>("[data-preview-strip-status]")).map((row) => {
          const box = row.getBoundingClientRect();
          const text = row.querySelector("span")!.getBoundingClientRect();
          return {
            key: row.dataset["previewStripStatus"]!,
            top: box.top,
            bottom: box.bottom,
            height: box.height,
            x: text.x + Math.min(30, text.width / 2),
            y: text.y + text.height / 2,
          };
        }),
      };
    });
    for (const row of rows) {
      await page.touchscreen.tap(row.x, row.y);
    }
    const pressed = await page.evaluate(() => (window as unknown as { pressed: (string | null)[] }).pressed);
    return { strip, rows: rows as Measured[], pressed };
  } finally {
    await browser.close();
  }
};

describe.skipIf(!browserAvailable)("the preview strip's status rows in a phone browser", () => {
  test.each([360, 384, 430])(
    "at %ipx, a tap on each visible label reaches its own row, and the two targets never overlap",
    async (width) => {
      const { strip, rows, pressed } = await measure(markupOf([status("problem"), status("forced")]), width);
      expect(pressed, "tapping the problem title, then the forced route").toEqual(["problem", "forced"]);
      const [problem, forced] = rows;
      expect(problem!.bottom, "the problem target ends where the forced target starts").toBeLessThanOrEqual(forced!.top);
      expect(forced!.bottom, "the forced target stays inside the strip").toBeLessThanOrEqual(strip.bottom);
      expect(problem!.top).toBeGreaterThanOrEqual(strip.top);
    },
    60000,
  );

  test.each(["problem", "forced"] as const)(
    "a %s row shown alone keeps its 44px target and takes its own tap",
    async (key) => {
      const { rows, pressed } = await measure(markupOf([status(key)]), 430);
      expect(rows[0]!.height).toBe(44);
      expect(pressed).toEqual([key]);
    },
    60000,
  );
});
