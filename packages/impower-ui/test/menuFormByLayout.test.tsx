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

  test.each([768, 1440])("at %ipx wide, a tap opens the popover, a tap on its trigger closes it for good, and a tap outside closes it without pressing what is under it, by pointerdown, mousedown or click", async (width) => {
    await withPage(width, [], async (page) => {
      const pressed = await page.evaluateHandle(() => {
        const log: string[] = [];
        const left = document.querySelector("[data-left]")!;
        for (const type of ["pointerdown", "mousedown", "click"]) {
          left.addEventListener(type, () => log.push(type));
        }
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

  test.each([768, 1440])("at %ipx wide, a popover that is not modal closes on a tap outside without pressing what is under it, by pointerdown, mousedown or click, and on a tap on its trigger for good", async (width) => {
    await withPage(width, ["panel"], async (page) => {
      const pressed = await page.evaluateHandle(() => {
        const log: string[] = [];
        const left = document.querySelector("[data-left]")!;
        for (const type of ["pointerdown", "mousedown", "click"]) {
          left.addEventListener(type, () => log.push(type));
        }
        return log;
      });
      const panelOpen = () => page.evaluate(() => !!document.querySelector("[data-panel]"));
      const centre = (box: { left: number; top: number; width: number; height: number }) => [box.left + box.width / 2, box.top + box.height / 2] as const;
      await page.locator("[data-trigger]").tap();
      await page.waitForTimeout(300);
      expect(await panelOpen()).toBe(true);
      await page.touchscreen.tap(...centre((await boxes(page)).left!));
      await page.waitForTimeout(400);
      expect(await panelOpen(), "after a tap outside").toBe(false);
      expect(await pressed.evaluate((log) => log)).toEqual([]);
      await page.locator("[data-trigger]").tap();
      await page.waitForTimeout(300);
      expect(await panelOpen()).toBe(true);
      await page.touchscreen.tap(...centre((await boxes(page)).trigger!));
      await page.waitForTimeout(400);
      expect(await panelOpen(), "after a tap on the trigger").toBe(false);
      await page.mouse.click(...centre((await boxes(page)).left!));
      expect(await pressed.evaluate((log) => log), "a mouse click outside a closed panel still presses").toEqual(["pointerdown", "mousedown", "click"]);
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

const UNDERNEATH_EVENTS = [
  "pointerover",
  "pointerenter",
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
  "pointerout",
  "pointerleave",
  "touchstart",
  "touchmove",
  "touchend",
  "touchcancel",
  "mouseover",
  "mouseenter",
  "mousemove",
  "mousedown",
  "mouseup",
  "mouseout",
  "mouseleave",
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
  "focus",
  "focusin",
] as const;

const SURFACES = {
  "the modal Dropdown": { options: [] as string[], open: () => '[role="menu"]' },
  "the non-modal panel": { options: ["panel"], open: () => "[data-panel]" },
} as const;

type Surface = keyof typeof SURFACES;

const MOUSE_OUTSIDE: Record<Surface, string[]> = {
  "the modal Dropdown": ["pointerover", "pointerenter", "mouseover", "mouseenter", "pointerup", "mouseup"],
  "the non-modal panel": [
    "pointerover",
    "pointerenter",
    "mouseover",
    "mouseenter",
    "pointermove",
    "mousemove",
    "pointerdown",
    "mousedown",
    "focus",
    "focusin",
    "pointerup",
    "mouseup",
    "click",
  ],
};

const HOVER_ENTRY = ["pointerover", "pointerenter", "pointermove", "mouseover", "mouseenter", "mousemove"];

const HOVER = [...HOVER_ENTRY, "pointerout", "pointerleave", "mouseout", "mouseleave"];

const recordUnderneath = (page: Page) =>
  page.evaluateHandle((types) => {
    const log: string[] = [];
    const heard = { beforePress: [] as string[], fromPress: [] as string[], log };
    let pressed = false;
    window.addEventListener("pointerdown", () => {
      pressed = true;
    }, true);
    const left = document.querySelector("[data-left]")!;
    for (const type of types) {
      left.addEventListener(type, () => {
        log.push(type);
        (pressed ? heard.fromPress : heard.beforePress).push(type);
      });
    }
    return heard;
  }, [...UNDERNEATH_EVENTS]);

const surfaceOpen = (page: Page, surface: Surface) =>
  page.evaluate((selector) => !!document.querySelector(selector), SURFACES[surface].open());

const leftCentre = async (page: Page) => {
  const left = (await boxes(page)).left!;
  return { x: left.left + left.width / 2, y: left.top + left.height / 2 };
};

const penTap = async (page: Page, x: number, y: number) => {
  const cdp = await page.context().newCDPSession(page);
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"] as const) {
    await cdp.send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: type === "mouseMoved" ? "none" : "left",
      buttons: type === "mousePressed" ? 1 : 0,
      clickCount: type === "mouseMoved" ? 0 : 1,
      pointerType: "pen",
    });
  }
  await cdp.detach();
};

const openSurface = async (page: Page, surface: Surface) => {
  await page.locator("[data-trigger]").tap();
  await page.waitForTimeout(300);
  expect(await surfaceOpen(page, surface), `${surface} opened`).toBe(true);
};

describe.skipIf(!browserAvailable)("a tap outside an open surface only closes it, in a browser", () => {
  test.each(
    (Object.keys(SURFACES) as Surface[]).flatMap((surface) =>
      [768, 1440].flatMap((width) => (["touch", "pen"] as const).map((input) => [surface, width, input] as const)),
    ),
  )("%s at %ipx wide: a %s tap outside closes it and the control under it hears none of the tap's events", async (surface, width, input) => {
    await withPage(width, [...SURFACES[surface].options], async (page) => {
      await openSurface(page, surface);
      const heard = await recordUnderneath(page);
      const { x, y } = await leftCentre(page);
      if (input === "touch") {
        await page.touchscreen.tap(x, y);
      } else {
        await penTap(page, x, y);
      }
      await page.waitForTimeout(500);
      expect(await surfaceOpen(page, surface), "the surface closed").toBe(false);
      const { beforePress, fromPress } = await heard.evaluate(({ beforePress, fromPress }) => ({ beforePress: [...new Set(beforePress)], fromPress: [...new Set(fromPress)] }));
      const pressing = input === "touch" ? fromPress : fromPress.filter((type) => !HOVER.includes(type));
      expect(pressing, input === "touch" ? "events the control underneath heard from the press on" : "events other than the still-hovering pen's hover the control underneath heard from the press on").toEqual([]);
      expect(beforePress.filter((type) => !HOVER_ENTRY.includes(type)), "events other than hover entry the control underneath heard before the press").toEqual([]);
      expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-left") ?? false), "the control underneath took focus").toBe(false);
    }, { touchScreen: true });
  }, 20000);

  test.each(
    (Object.keys(SURFACES) as Surface[]).flatMap((surface) => [768, 1440].map((width) => [surface, width] as const)),
  )("%s at %ipx wide: once the tap has closed it, the next tap on the control underneath reaches it", async (surface, width) => {
    await withPage(width, [...SURFACES[surface].options], async (page) => {
      await openSurface(page, surface);
      const { x, y } = await leftCentre(page);
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(500);
      const heard = await recordUnderneath(page);
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(500);
      const events = await heard.evaluate(({ log }) => log);
      expect(events).toContain("pointerdown");
      expect(events).toContain("touchstart");
      expect(events).toContain("click");
    }, { touchScreen: true });
  }, 20000);

  test.each(
    (Object.keys(SURFACES) as Surface[]).flatMap((surface) => [768, 1440].map((width) => [surface, width] as const)),
  )("%s at %ipx wide: a mouse press outside reaches the control under it as it always has", async (surface, width) => {
    await withPage(width, [...SURFACES[surface].options], async (page) => {
      await page.locator("[data-trigger]").click();
      await page.waitForTimeout(300);
      expect(await surfaceOpen(page, surface)).toBe(true);
      const heard = await recordUnderneath(page);
      const { x, y } = await leftCentre(page);
      await page.mouse.click(x, y);
      await page.waitForTimeout(500);
      expect(await surfaceOpen(page, surface)).toBe(false);
      const events = [...new Set(await heard.evaluate(({ log }) => log))];
      expect(events).toEqual(MOUSE_OUTSIDE[surface]);
    });
  }, 20000);

  test.each([768, 1440])("at %ipx wide, a scroll gesture starting outside the open panel closes it and scrolls the page, and the page still scrolls after", async (width) => {
    await withPage(width, ["panel", "scroll"], async (page) => {
      await openSurface(page, "the non-modal panel");
      const swipe = async () => {
        const cdp = await page.context().newCDPSession(page);
        const x = width / 2;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: 600 }] });
        for (let y = 560; y >= 200; y -= 40) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
        await page.waitForTimeout(500);
      };
      await swipe();
      expect(await surfaceOpen(page, "the non-modal panel"), "the panel closed").toBe(false);
      const first = await page.evaluate(() => scrollY);
      expect(first, "the page scrolled under the first swipe").toBeGreaterThan(0);
      await swipe();
      expect(await page.evaluate(() => scrollY), "the page scrolled under the second swipe").toBeGreaterThan(first);
    }, { touchScreen: true });
  }, 20000);
});
