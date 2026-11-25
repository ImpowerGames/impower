// @vitest-environment node
import { readFileSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, openPage, stylesFor } from "./pageBundle";

let browser: Browser;
let script: string;
let css: string;

beforeAll(async () => {
  script = await bundlePage("test/components/routeValueSizesPage.tsx");
  css = `${await stylesFor(script)}\n${readFileSync("src/modules/spark-editor/components/preview-route/route-view.css", "utf8")}`;
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

const measure = async (touch: boolean) => {
  const page = await openPage(browser, script, css, { width: 1200, touch });
  await page.evaluate(() => window.routeValueSizes.mount());
  await frames(page);
  const sizes = await page.evaluate(() => {
    const heights = (selector: string) =>
      [...document.querySelectorAll(selector)].map((el) => Math.round(el.getBoundingClientRect().height));
    return {
      valueRows: heights(".route-list .sv-row"),
      clearSlots: [...document.querySelectorAll(".route-list .sv-clear-slot")].map((el) =>
        Math.round(el.getBoundingClientRect().width),
      ),
      saveValueRows: heights(".saves-values .sv-row"),
    };
  });
  await page.context().close();
  return sizes;
};

describe("the editor's Starting values and save values rows", () => {
  it("are 24px with a 22px clear slot under a fine pointer", async () => {
    expect(await measure(false)).toEqual({
      valueRows: [24, 24],
      clearSlots: [22, 22],
      saveValueRows: [24, 24],
    });
  }, 60_000);

  it("are 44px with a 44px clear slot under a coarse pointer", async () => {
    expect(await measure(true)).toEqual({
      valueRows: [44, 44],
      clearSlots: [44, 44],
      saveValueRows: [44, 44],
    });
  }, 60_000);
});
