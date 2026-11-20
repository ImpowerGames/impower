import { compile } from "@tailwindcss/node";
import { chromium } from "playwright";
import { renderToString } from "preact-render-to-string";
import { describe, expect, test } from "vitest";
import JumpChips from "../src/components/jump-chips/JumpChips";
import Select from "../src/components/select/Select";
import { browserAvailable } from "./browserAvailable";

const PACKAGE = process.cwd();

const markup = renderToString(
  <>
    <JumpChips
      label="Settings sections"
      groups={[{ id: "editor", label: "Editor preferences", items: [{ id: "appearance", label: "Appearance" }, { id: "shortcuts", label: "Keyboard shortcuts" }] }]}
      onJump={() => {}}
    />
    <Select aria-label="Sample" options={[{ value: "dialogue", label: "Dialogue" }]} defaultValue="dialogue" />
  </>,
);

const heights = async (coarse: boolean) => {
  const compiler = await compile('@import "./src/style.css";', { base: PACKAGE, onDependency: () => {} });
  const candidates = [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1]!.replace(/&amp;/g, "&").split(/\s+/));
  const css = compiler.build(candidates);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 780 }, isMobile: coarse, hasTouch: coarse });
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="phone"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>${markup}</body></html>`,
    );
    return await page.evaluate(() => ({
      coarse: matchMedia("(pointer: coarse)").matches,
      chips: [...document.querySelectorAll("[data-index-jump]")].map((el) => el.getBoundingClientRect().height),
      select: document.querySelector("select")!.getBoundingClientRect().height,
    }));
  } finally {
    await browser.close();
  }
};

describe.skipIf(!browserAvailable)("the Settings chips and the default select under each pointer, in a browser", () => {
  test("are at least 44px tall under a coarse pointer", async () => {
    const measured = await heights(true);
    expect(measured.coarse).toBe(true);
    for (const height of [...measured.chips, measured.select]) expect(height).toBeGreaterThanOrEqual(44);
  }, 60_000);

  test("keep their 36px under a mouse", async () => {
    const measured = await heights(false);
    expect(measured.coarse).toBe(false);
    expect([...measured.chips, measured.select].map(Math.round)).toEqual([36, 36, 36]);
  }, 60_000);
});
