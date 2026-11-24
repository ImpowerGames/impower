// @vitest-environment node
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, openPage, stylesFor } from "./pageBundle";

const PICTURE = "Assets/Images/Cast/picture_000.png";

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

type Drawn = { computed: string; drawn: number; label: number; rightGap: number; height: number; centreOffset: number };

const measure = async (width: number, touch: boolean, query: string) => {
  const page = await openPage(browser, script, css, { width, touch, theme: "charcoal" });
  await page.evaluate(() =>
    window.assetsPage.mount({ pictures: 2, lists: { assetsLayouts: { "Assets/Images/Cast": "rows" } } }),
  );
  await page.locator(`[data-asset-path="${PICTURE}"]`).waitFor();
  const label = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('[data-asset-path] [class*="truncate"]') ?? document.querySelector<HTMLElement>("[data-asset-path]")!;
    return parseFloat(getComputedStyle(row).fontSize);
  });
  const input = page.locator('input[type="search"]');
  if (query) {
    await input.fill(query);
  }
  await frames(page);
  const drawn = await input.evaluate((input: HTMLInputElement, label): Drawn => {
    const frame = input.closest("label")!;
    const box = input.getBoundingClientRect();
    const field = input.parentElement!.getBoundingClientRect();
    const icon = frame.querySelector("svg")!.getBoundingClientRect();
    const computed = getComputedStyle(input).fontSize;
    return {
      computed,
      drawn: Math.round(parseFloat(computed) * (box.width / input.offsetWidth) * 10) / 10,
      label,
      rightGap: Math.round(Math.abs(field.right - box.right)),
      height: frame.getBoundingClientRect().height,
      centreOffset: Math.round(Math.abs(box.top + box.height / 2 - (icon.top + icon.height / 2))),
    };
  }, label);
  await page.context().close();
  return drawn;
};

describe("the library search field's drawn size", () => {
  for (const width of [360, 430, 768]) {
    for (const query of ["", "pic", "a query much longer than the field can show at once, running on"]) {
      it(`at ${width} with touch and ${query ? `the query "${query.slice(0, 12)}"` : "no query"}, keeps a 16px font drawn at a 14px row label's size across the whole field`, async () => {
        const drawn = await measure(width, width < 768, query);
        expect(drawn).toEqual({ computed: "16px", drawn: drawn.label, label: 14, rightGap: 0, height: 44, centreOffset: 0 });
      });
    }
  }

  it("at 1440 with a mouse, draws 13px with no scaling", async () => {
    const drawn = await measure(1440, false, "");
    expect(drawn).toMatchObject({ computed: "13px", drawn: 13, rightGap: 0, height: 44 });
  });
});
