// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildIconMaskPaintPage } from "./harness/icon-mask-paint.mjs";

interface Painted {
  icon: string;
  background: string;
  color: string;
}

let browser: Browser;
let pageUrl: string;
let outDir: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "icon-mask-paint-"));
  pageUrl = await buildIconMaskPaintPage(outDir);
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  rmSync(outDir, { recursive: true, force: true });
});

const paints = async (forcedColors: "active" | "none") => {
  const context = await browser.newContext({ viewport: { width: 430, height: 600 }, forcedColors, hasTouch: true });
  const page = await context.newPage();
  await page.goto(pageUrl);
  await page.waitForFunction(() => "iconMaskPaint" in window);
  await page.evaluate(() => (window as unknown as { iconMaskPaint: { ready: Promise<void> } }).iconMaskPaint.ready);
  const result = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement("span"));
    probe.style.color = "CanvasText";
    const canvasText = getComputedStyle(probe).color;
    probe.remove();
    const painted: { icon: string; background: string; color: string }[] = [];
    const root = document.querySelector(".sparkdown-script-editor-root")!;
    for (const element of [root, ...root.querySelectorAll("*")]) {
      for (const pseudo of [null, "::before", "::after"]) {
        const style = getComputedStyle(element, pseudo);
        const mask = style.maskImage || style.getPropertyValue("-webkit-mask-image");
        if (!mask.includes("url(") || style.display === "none") continue;
        if (pseudo && style.content === "none") continue;
        const own = (el: Element) => [...el.classList].filter((c) => c.startsWith("cm-") || c.startsWith("codicon")).map((c) => `.${c}`).join("");
        const button = element.closest(".cm-gutter-button");
        const name = element.getAttribute("name");
        painted.push({
          icon: `${button && button !== element ? `${own(button)} ` : ""}${element.tagName.toLowerCase()}${own(element)}${name ? `[name='${name}']` : ""}${pseudo ?? ""}`,
          background: style.backgroundColor,
          color: style.color,
        });
      }
    }
    const untyped = document.querySelector(".cm-completionIcon-untyped");
    const unmasked = untyped ? getComputedStyle(untyped, "::after").backgroundColor : "no untyped completion icon";
    return { canvasText, painted, unmasked };
  });
  await context.close();
  return result;
};

const EXPECTED = [
  ".cm-breakpoint",
  ".cm-choice-marker",
  ".cm-fold-marker",
  ".cm-choice-icon-auto",
  ".cm-choice-icon-pinned",
  ".cm-choice-icon-arrow",
  ".cm-problem-line-error::after",
  ".cm-problem-line-warning::after",
  ".cm-problem-line-info::after",
  ".cm-activeDiagnosticIcon",
  ".cm-navLeftIcon",
  ".cm-navRightIcon",
  ".cm-toolbar-icon",
  "[name='close']::after",
  "[name='submit']::after",
  ".codicon-info::after",
  ".cm-completionIcon-method::after",
  ".cm-completionIcon-variable::after",
  ".cm-completionIcon-keyword::after",
  ".cm-completionIcon-snippet::after",
];

const covers = (painted: Painted[]) =>
  EXPECTED.filter((part) => !painted.some(({ icon }) => icon.includes(part)));

describe("every masked icon in the code editor", () => {
  it("paints its mask in its own text colour", async () => {
    const { painted } = await paints("none");
    expect(covers(painted)).toEqual([]);
    expect(painted.filter((icon) => icon.background !== icon.color)).toEqual([]);
  });

  it("leaves an icon with no mask unpainted, so a completion with no icon of its own shows no square", async () => {
    for (const mode of ["none", "active"] as const) {
      expect((await paints(mode)).unmasked, mode).toMatch(/^rgba\(\d+, \d+, \d+, 0\)$/);
    }
  });

  it("paints its mask in CanvasText under forced colours, so none turns into Canvas on Canvas", async () => {
    const { canvasText, painted } = await paints("active");
    expect(covers(painted)).toEqual([]);
    expect(painted.filter((icon) => icon.background !== canvasText)).toEqual([]);
  });
});
