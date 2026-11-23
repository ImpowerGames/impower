// @vitest-environment node
import { compile } from "@tailwindcss/node";
import { build } from "esbuild";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { describe, expect, test } from "vitest";
import { browserAvailable } from "./browserAvailable";

const PACKAGE = process.cwd();
const HEIGHT = 807;

const pageScript = async () => {
  const bundle = await build({
    entryPoints: [resolve(PACKAGE, "test/fixtures/menuFormPage.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    jsxImportSource: "preact",
    alias: { react: "preact/compat", "react-dom": "preact/compat", "react/jsx-runtime": "preact/jsx-runtime" },
    logLevel: "silent",
  });
  return bundle.outputFiles[0]!.text;
};

const styles = async () => {
  const sources = [
    ...["dropdown", "dialog"].flatMap((folder) =>
      readdirSync(resolve(PACKAGE, "src/components", folder)).map((name) => resolve(PACKAGE, "src/components", folder, name)),
    ),
    ...readdirSync(resolve(PACKAGE, "src/utils")).map((name) => resolve(PACKAGE, "src/utils", name)),
    resolve(PACKAGE, "test/fixtures/menuFormPage.tsx"),
  ].filter((file) => /\.tsx?$/.test(file));
  const candidates = sources.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/"([^"\r\n]*)"/g)].flatMap((match) => match[1]!.split(/\s+/)),
  );
  const compiler = await compile('@import "./src/style.css";', { base: PACKAGE, onDependency: () => {} });
  return compiler.build(candidates);
};

type Opening = "tap" | "touch" | "touch detail 0 after a mouse click" | "mouse" | "keyboard";

const withPage = async (
  width: number,
  options: string[],
  run: (page: Page) => Promise<void>,
  { touchScreen = false, height = HEIGHT }: { touchScreen?: boolean; height?: number } = {},
) => {
  const [script, css] = await Promise.all([pageScript(), styles()]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
      hasTouch: touchScreen,
      isMobile: touchScreen,
    });
    await page.goto(`about:blank#${options.join(",")}`);
    await page.setContent(
      `<!doctype html><html data-theme="charcoal" data-layout="${width < 701 ? "phone" : "desktop"}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0"></body></html>`,
    );
    await page.addScriptTag({ content: script });
    await run(page);
  } finally {
    await browser.close();
  }
};

const openWith = async (page: Page, opening: Opening) => {
  const trigger = page.locator("[data-trigger]");
  if (opening === "tap") {
    await trigger.tap();
  } else if (opening === "touch") {
    await trigger.dispatchEvent("pointerdown", { pointerType: "touch", button: 0, bubbles: true, cancelable: true });
    await trigger.dispatchEvent("click", { detail: 1 });
  } else if (opening === "touch detail 0 after a mouse click") {
    await page.mouse.click(2, 2);
    await trigger.evaluate((element) => {
      for (const type of ["pointerdown", "pointerup"]) {
        element.dispatchEvent(new PointerEvent(type, { pointerType: "touch", button: 0, bubbles: true, cancelable: true }));
      }
      element.dispatchEvent(new PointerEvent("click", { pointerType: "touch", detail: 0, bubbles: true, cancelable: true }));
    });
  } else if (opening === "mouse") {
    await trigger.click();
  } else {
    await trigger.focus();
    await page.keyboard.press("Enter");
  }
  await page.locator('[role="menu"]').waitFor();
  await page.waitForTimeout(300);
};

const boxes = (page: Page) =>
  page.evaluate(() => {
    const box = (element: Element | null) => {
      if (!element) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
    };
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    const sheet = menu?.closest('[role="dialog"]') ?? null;
    return {
      left: box(document.querySelector("[data-left]")),
      trigger: box(document.querySelector("[data-trigger]")),
      right: box(document.querySelector("[data-right]")),
      bars: [...document.querySelectorAll("[data-bar]")].map(box),
      picture: box(document.querySelector("[data-picture]")),
      page: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      form: menu ? (sheet ? "sheet" : "menu") : "closed",
      menu: box(menu),
      sheet: box(sheet),
      scrolls: menu ? menu.scrollHeight > menu.clientHeight + 1 : false,
      inner: { width: innerWidth, height: innerHeight },
    };
  });

describe.skipIf(!browserAvailable)("a menu's form follows the layout, whatever opens it, in a browser", () => {
  test.each([
    [430, "tap", "sheet", true],
    [430, "mouse", "sheet", false],
    [430, "mouse", "sheet", true],
    [430, "keyboard", "sheet", true],
    [430, "keyboard", "sheet", false],
    [360, "tap", "sheet", true],
    [360, "mouse", "sheet", false],
    [430, "touch detail 0 after a mouse click", "sheet", true],
    [768, "tap", "menu", true],
    [768, "mouse", "menu", false],
    [768, "keyboard", "menu", true],
    [1440, "tap", "menu", true],
    [1440, "mouse", "menu", false],
    [1440, "touch", "menu", false],
    [1440, "touch detail 0 after a mouse click", "menu", false],
  ] as const)("at %ipx wide, opened by %s, it opens as a %s and moves nothing on the page", async (width, opening, form, touchScreen) => {
    await withPage(width, [], async (page) => {
      const before = await boxes(page);
      await openWith(page, opening);
      const after = await boxes(page);
      expect(after.form).toBe(form);
      expect(after.left).toEqual(before.left);
      expect(after.trigger).toEqual(before.trigger);
      expect(after.right).toEqual(before.right);
      expect(after.bars).toEqual(before.bars);
      expect(after.page).toEqual(before.page);
    }, { touchScreen });
  });

  test.each([
    [430, "tap", false],
    [768, "tap", false],
    [430, "mouse", false],
    [430, "keyboard", true],
    [768, "keyboard", true],
  ] as const)("at %ipx wide, opened by %s, an item draws the focus ring: %s", async (width, opening, ring) => {
    await withPage(width, [], async (page) => {
      await openWith(page, opening);
      const focus = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        const inside = !!active?.closest('[role="menu"], [role="dialog"]');
        const ringed = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(
          (item) => item.matches(":focus-visible") || (getComputedStyle(item).outlineStyle !== "none" && parseFloat(getComputedStyle(item).outlineWidth) > 0),
        ).length;
        return { inside, ringed };
      });
      expect(focus.inside).toBe(true);
      expect(focus.ringed).toBe(ring ? 1 : 0);
    }, { touchScreen: opening === "tap" });
  });

  test.each([768, 1440])("at %ipx wide, a tap opens the popover, a tap on its trigger closes it for good, and a tap outside closes it without pressing what is under it", async (width) => {
    await withPage(width, [], async (page) => {
      const pressed = await page.evaluateHandle(() => {
        const log: string[] = [];
        document.querySelector("[data-left]")!.addEventListener("click", () => log.push("left"));
        return log;
      });
      await openWith(page, "tap");
      expect((await boxes(page)).form).toBe("menu");
      const trigger = (await boxes(page)).trigger!;
      await page.touchscreen.tap(trigger.left + trigger.width / 2, trigger.top + trigger.height / 2);
      await page.waitForTimeout(400);
      expect((await boxes(page)).form, "after a tap on the trigger").toBe("closed");
      await openWith(page, "tap");
      expect((await boxes(page)).form).toBe("menu");
      const left = (await boxes(page)).left!;
      await page.touchscreen.tap(left.left + left.width / 2, left.top + left.height / 2);
      await page.waitForTimeout(400);
      expect((await boxes(page)).form, "after a tap outside").toBe("closed");
      expect(await pressed.evaluate((log) => log)).toEqual([]);
    }, { touchScreen: true });
  }, 20000);

  test.each([
    [768, "tap", "sheet", true],
    [1440, "touch", "sheet", false],
    [768, "mouse", "menu", false],
    [1440, "keyboard", "menu", false],
    [430, "mouse", "sheet", false],
  ] as const)("a menu that also comes up as a sheet by touch, at %ipx wide, opened by %s, opens as a %s", async (width, opening, form, touchScreen) => {
    await withPage(width, ["touch-sheet"], async (page) => {
      await openWith(page, opening);
      expect((await boxes(page)).form).toBe(form);
    }, { touchScreen });
  });

  test.each([
    [1440, 440, 560, ["touch-sheet"]],
    [820, 130, 560, ["touch-sheet"]],
    [430, 0, 430, []],
  ])("at %ipx wide, the sheet a finger opens sits at x %i, %ipx wide, on the window's foot, with its backdrop over the whole window, and a tap outside closes it", async (width, left, sheetWidth, options) => {
    await withPage(width, options, async (page) => {
      await openWith(page, "tap");
      const placed = await boxes(page);
      expect(placed.form).toBe("sheet");
      expect(placed.sheet!.left).toBe(left);
      expect(placed.sheet!.width).toBe(sheetWidth);
      expect(placed.sheet!.bottom).toBe(HEIGHT);
      const backdrop = await page.evaluate(() => {
        const rect = document.querySelector('[role="dialog"]')!.parentElement!.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      });
      expect(backdrop).toEqual({ left: 0, top: 0, width, height: HEIGHT });
      const corners = await page.evaluate(() => {
        const style = getComputedStyle(document.querySelector('[role="dialog"]')!);
        return [style.borderTopLeftRadius, style.borderTopRightRadius];
      });
      expect(corners[0]).toBe(corners[1]);
      expect(parseFloat(corners[0]!)).toBeGreaterThan(0);
      await page.touchscreen.tap(8, 8);
      await page.waitForTimeout(400);
      expect((await boxes(page)).form).toBe("closed");
    }, { touchScreen: true });
  });

  test("at 820px wide, a sheet that is not a menu still spans the window's width along its foot", async () => {
    await withPage(820, ["plain"], async (page) => {
      await page.locator("[data-plain-sheet]").waitFor();
      await page.waitForTimeout(300);
      const sheet = await page.evaluate(() => {
        const rect = document.querySelector('[role="dialog"]')!.getBoundingClientRect();
        return { left: rect.left, width: rect.width, bottom: rect.bottom };
      });
      expect(sheet).toEqual({ left: 0, width: 820, bottom: HEIGHT });
    }, { touchScreen: true });
  });

  test.each([768, 701])("at %ipx wide, a long menu a mouse opens stays 12px inside the window 6px under its trigger, capped in height, and scrolls", async (width) => {
    await withPage(width, ["long"], async (page) => {
      await openWith(page, "mouse");
      const placed = await boxes(page);
      expect(placed.form).toBe("menu");
      expect(placed.menu!.left).toBeGreaterThanOrEqual(12);
      expect(placed.menu!.right).toBeLessThanOrEqual(width - 12);
      expect(placed.menu!.top).toBe(placed.trigger!.bottom + 6);
      expect(placed.menu!.bottom).toBeLessThanOrEqual(HEIGHT - 12);
      expect(placed.scrolls).toBe(true);
      const last = page.locator('[role="menuitem"]').last();
      await last.scrollIntoViewIfNeeded();
      const row = await last.boundingBox();
      expect(row!.y + row!.height).toBeLessThanOrEqual(placed.menu!.bottom);
    });
  });

  test.each([768, 701])("at %ipx wide, a menu a mouse opens from the window's foot opens above its trigger, 12px inside the window", async (width) => {
    await withPage(width, ["bottom"], async (page) => {
      await openWith(page, "mouse");
      const placed = await boxes(page);
      expect(placed.form).toBe("menu");
      expect(placed.menu!.bottom).toBe(placed.trigger!.top - 6);
      expect(placed.menu!.top).toBeGreaterThanOrEqual(12);
      expect(placed.menu!.left).toBeGreaterThanOrEqual(12);
      expect(placed.menu!.right).toBeLessThanOrEqual(width - 12);
    });
  });

  test.each([768, 701])("at %ipx wide, a menu of labels wider than the window, with no width of its own, a mouse opens stays 12px inside the window and wraps its labels", async (width) => {
    await withPage(width, ["wide"], async (page) => {
      await openWith(page, "mouse");
      const placed = await boxes(page);
      expect(placed.form).toBe("menu");
      expect(placed.menu!.left).toBeGreaterThanOrEqual(12);
      expect(placed.menu!.right).toBeLessThanOrEqual(width - 12);
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[role="menu"], [role="menuitem"]')].filter((element) => element.scrollWidth > element.clientWidth + 1).length,
      );
      expect(clipped).toBe(0);
    });
  });

  test.each([
    ["a long menu", ["clear", "long"]],
    ["a menu from the window's foot", ["clear", "long", "bottom"]],
  ] as const)("at 768px wide, %s a mouse opens keeps clear of the picture above it", async (_name, options) => {
    await withPage(768, [...options], async (page) => {
      await openWith(page, "mouse");
      const placed = await boxes(page);
      expect(placed.form).toBe("menu");
      expect(placed.menu!.top).toBeGreaterThanOrEqual(placed.picture!.bottom);
      expect(placed.menu!.bottom).toBeLessThanOrEqual(HEIGHT);
      expect(placed.scrolls).toBe(true);
    });
  });
});
