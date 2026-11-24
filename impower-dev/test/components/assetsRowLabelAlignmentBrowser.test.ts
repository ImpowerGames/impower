// @vitest-environment node
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, openPage, stylesFor } from "./pageBundle";

const CAST = "Assets/Images/Cast";

let browser: Browser;
let script: string;
let css: string;

beforeAll(async () => {
  script = await bundlePage("test/components/assetsTileSizesPage.tsx", "test/components/assetsTileSizesWorkspace.ts");
  css = await stylesFor(script);
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

type Lead = { label: string; lead: { x: number; width: number; height: number }; labelX: number; rowHeight: number };

const rowsOf = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-asset-path]")]
      .filter((open) => open.getBoundingClientRect().height > 0)
      .map((open): Lead => {
        const row = open.closest<HTMLElement>('[class*="group/row"]')!;
        const play = row.querySelector<HTMLElement>("[data-asset-play]");
        const leading = play ?? (open.firstElementChild as HTMLElement);
        const box = leading.getBoundingClientRect();
        const walker = document.createTreeWalker(open, NodeFilter.SHOW_TEXT, (node) =>
          node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
        );
        const text = walker.nextNode()!;
        const range = document.createRange();
        range.selectNodeContents(text);
        return {
          label: text.textContent!.trim(),
          lead: { x: Math.round(box.left), width: Math.round(box.width), height: Math.round(box.height) },
          labelX: Math.round(range.getBoundingClientRect().left),
          rowHeight: Math.round(row.getBoundingClientRect().height),
        };
      }),
  );

const measure = async ({ width, touch }: { width: number; touch: boolean }) => {
  const page = await openPage(browser, script, css, { width, touch, theme: "charcoal" });
  await page.evaluate(() =>
    window.assetsPage.mount({
      pictures: 1,
      lists: { assetsLayouts: { "Assets/Images/Cast": "rows" }, assetsFolders: { image: "Assets/Images/Cast", audio: "Assets/Audio" } },
    }),
  );
  await page.locator(`[data-asset-path="${CAST}/picture_000.png"]`).waitFor();
  await frames(page);
  const images = await rowsOf(page);
  await page.getByRole("tab", { name: "Audio" }).click();
  await page.locator('[data-asset-path="Assets/Audio/Sounds"]').click();
  await page.locator("[data-asset-play]").waitFor();
  await frames(page);
  const sounds = await rowsOf(page);
  await page.context().close();
  return [...images, ...sounds];
};

describe("Assets list rows", () => {
  for (const viewport of [
    { width: 1440, touch: false },
    { width: 430, touch: true },
  ]) {
    it(`at ${viewport.width} draw one leading box size for folders, pictures and sounds, so every label starts at one x`, async () => {
      const rows = await measure(viewport);
      expect(rows.map((row) => row.label).sort()).toEqual(["Crew", "chime", "picture_000"]);
      const [first] = rows;
      for (const row of rows) {
        expect({ label: row.label, ...row.lead, labelX: row.labelX, rowHeight: row.rowHeight }).toEqual({
          label: row.label,
          x: first!.lead.x,
          width: 44,
          height: 44,
          labelX: first!.labelX,
          rowHeight: first!.rowHeight,
        });
      }
    });
  }
});
