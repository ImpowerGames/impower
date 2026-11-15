import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

const SRC = resolve("../packages/impower-ui/src");

describe("fade-edge", () => {
  it("in Chromium, leaves a short name unmasked and fades a long one, in a span and in a field", async () => {
    const compiler = await compile(readFileSync(join(SRC, "style.css"), "utf8"), { base: SRC, onDependency: () => {} });
    const classes = ["block", "[--fade:20px]", "fade-edge", "w-[120px]"];
    const css = optimize(compiler.build(classes), { minify: false }).code;
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(
        `<!doctype html><html><head><style>${css}</style></head><body>
        <span id="short" class="block w-[120px] [--fade:20px] fade-edge">Short</span>
        <span id="long" class="block w-[120px] [--fade:20px] fade-edge">A very long name that overflows its box</span>
        <input id="field-short" class="w-[120px] [--fade:20px] fade-edge" value="Short">
        <input id="field-long" class="w-[120px] [--fade:20px] fade-edge" value="A very long name that overflows its field">
        </body></html>`,
      );
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const masks = await page.evaluate(() =>
        Object.fromEntries(
          ["short", "long", "field-short", "field-long"].map((id) => [id, getComputedStyle(document.getElementById(id)!).maskImage]),
        ),
      );
      expect(masks).toEqual({
        short: "none",
        long: expect.stringContaining("linear-gradient"),
        "field-short": "none",
        "field-long": expect.stringContaining("linear-gradient"),
      });
    } finally {
      await browser.close();
    }
  });
});
