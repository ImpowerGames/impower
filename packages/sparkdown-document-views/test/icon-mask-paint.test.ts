// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";
import {
  COMPLETION_ICON_COLORS,
  ICONED_COMPLETION_TYPES,
  ICONLESS_COMPLETIONS,
} from "./harness/completion-types";
import { buildIconMaskPaintPage } from "./harness/icon-mask-paint.mjs";

interface Painted {
  icon: string;
  background: string;
  color: string;
}

const OWN_COLORS: [icon: string, variable: string][] = [
  [".cm-problem-line-error::after", "--editor-problem-error"],
  [".cm-problem-line-warning::after", "--editor-problem-warning"],
  [".cm-problem-line-info::after", "--editor-problem-info"],
  ["[name='close']::after", "--editor-icon-close"],
  ["[name='submit']::after", "--editor-icon-ink"],
  ...ICONED_COMPLETION_TYPES.map((type): [string, string] => [
    `.cm-completionIcon-${type}::after`,
    COMPLETION_ICON_COLORS[type],
  ]),
];

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
  const result = await page.evaluate(
    ({ iconless, variables }) => {
      const resolve = (color: string) => {
        const probe = document.body.appendChild(document.createElement("span"));
        probe.style.color = color;
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      };
      const canvasText = resolve("CanvasText");
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
      const unmasked = Object.fromEntries(
        iconless.map((label) => {
          const row = [...document.querySelectorAll(".cm-completionLabel")].find((el) => el.textContent === label)?.parentElement;
          const icon = row?.querySelector(".cm-completionIcon");
          return [label, icon ? getComputedStyle(icon, "::after").backgroundColor : "no such completion icon"];
        }),
      );
      const own = Object.fromEntries(variables.map((variable) => [variable, resolve(`var(${variable})`)]));
      return { canvasText, painted, unmasked, own };
    },
    {
      iconless: ICONLESS_COMPLETIONS.map(({ label }) => label),
      variables: [...new Set(OWN_COLORS.map(([, variable]) => variable))],
    },
  );
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
  ".cm-activeDiagnosticIcon",
  ".cm-navLeftIcon",
  ".cm-navRightIcon",
  ".cm-toolbar-icon",
  ".codicon-info::after",
  ...OWN_COLORS.map(([icon]) => icon),
];

const covers = (painted: Painted[]) =>
  EXPECTED.filter((part) => !painted.some(({ icon }) => icon.includes(part)));

const completionTypesIn = (spec: object): string[] =>
  Object.entries(spec).flatMap(([key, value]) => [
    ...[...key.matchAll(/cm-completionIcon-([\w-]+)/g)].map(([, type]) => type!),
    ...(value && typeof value === "object" ? completionTypesIn(value) : []),
  ]);

describe("every masked icon in the code editor", () => {
  it("paints its mask in its own text colour", async () => {
    const { painted } = await paints("none");
    expect(covers(painted)).toEqual([]);
    expect(painted.filter((icon) => icon.background !== icon.color)).toEqual([]);
  });

  it("keeps each completion type, problem mark and go-to-line icon in the colour variable it painted before", async () => {
    const { painted, own } = await paints("none");
    const wrong = OWN_COLORS.flatMap(([part, variable]) =>
      painted
        .filter(({ icon }) => icon.includes(part))
        .filter(({ background }) => background !== own[variable])
        .map(({ icon, background }) => ({ icon, background, expected: `${variable} ${own[variable]}` })),
    );
    expect(new Set(Object.values(own)).size).toBe(Object.keys(own).length);
    expect(wrong).toEqual([]);
  });

  it.each(ICONLESS_COMPLETIONS)("leaves the $label completion, which has no icon of its own, unpainted, so it shows no square", async ({ label }) => {
    for (const mode of ["none", "active"] as const) {
      expect((await paints(mode)).unmasked[label], mode).toMatch(/^rgba\(\d+, \d+, \d+, 0\)$/);
    }
  });

  it("paints its mask in CanvasText under forced colours, so none turns into Canvas on Canvas", async () => {
    const { canvasText, painted } = await paints("active");
    expect(covers(painted)).toEqual([]);
    expect(painted.filter((icon) => icon.background !== canvasText)).toEqual([]);
  });

  it("checks every completion type the editor theme draws an icon for", () => {
    expect([...new Set(completionTypesIn(EDITOR_THEME))].sort()).toEqual([...ICONED_COMPLETION_TYPES].sort());
  });
});
