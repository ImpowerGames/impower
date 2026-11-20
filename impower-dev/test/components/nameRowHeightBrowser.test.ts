// @vitest-environment node
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, openPage, stylesFor } from "./pageBundle";

let browser: Browser;
let script: string;
let css: string;

beforeAll(async () => {
  script = await bundlePage("test/components/nameRowPage.tsx");
  css = await stylesFor(script);
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

const measure = async ({ width, touch }: { width: number; touch: boolean }) => {
  const page = await openPage(browser, script, css, { width, height: 932, touch });
  try {
    await page.evaluate(() => window.nameRow.mount());
    const field = page.locator('[data-name-field="row"]');
    await field.waitFor();
    await frames(page);
    return await field.evaluate((input) => ({
      coarse: matchMedia("(pointer: coarse)").matches,
      box: Math.round(input.parentElement!.getBoundingClientRect().height),
      input: Math.round(input.getBoundingClientRect().height),
    }));
  } finally {
    await page.context().close();
  }
};

describe("The name field is a 44 px touch target under a coarse pointer (I-2686)", { timeout: 30_000 }, () => {
  it("is 44 px tall, with its input filling the box, at 430 with touch", async () => {
    expect(await measure({ width: 430, touch: true })).toEqual({ coarse: true, box: 44, input: 42 });
  });

  it("keeps 26 px at 1440 with a mouse", async () => {
    expect(await measure({ width: 1440, touch: false })).toEqual({ coarse: false, box: 26, input: 24 });
  });
});
