import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../src");

const block = (css: string, opener: string) => {
  const start = css.indexOf(opener);
  expect(start, opener).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = start + opener.length - 1; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") depth -= 1;
    if (depth === 0) return css.slice(start + opener.length, i);
  }
  return "";
};

describe("fade-edge", () => {
  it("masks only while its text overflows where scroll timelines are supported, and always masks elsewhere", async () => {
    const compiler = await compile(readFileSync(join(SRC, "style.css"), "utf8"), { base: SRC, onDependency: () => {} });
    const css = optimize(compiler.build(["fade-edge"]), { minify: true }).code;
    const fallback = block(css, ".fade-edge{");
    const mask = fallback.split(";").find((declaration) => declaration.startsWith("mask-image:"))!;
    expect(mask).toContain("linear-gradient");
    const supported = block(block(css, "@supports (animation-timeline:scroll()){"), ".fade-edge{");
    expect(supported).toContain("mask-image:none");
    expect(supported).toContain("overflow:hidden");
    expect(supported).toContain("animation-timeline:scroll(self inline)");
    const name = supported.split("animation:")[1]!.split(";")[0]!.split(" ").at(-1)!;
    const frames = block(css, `@keyframes ${name}{`);
    expect(frames).toContain(mask);
  });

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
