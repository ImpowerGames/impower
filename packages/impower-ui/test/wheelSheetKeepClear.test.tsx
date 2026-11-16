import { compile } from "@tailwindcss/node";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WHEEL_ROW, WheelSheet, type WheelOption } from "../src/components/wheel-picker/WheelPicker";

const PACKAGE = process.cwd();
const PANEL_HEIGHT = 430;
const PANEL_WIDTH = 600;
const WHEEL_HEIGHT = 220;

const browserAvailable = existsSync(chromium.executablePath());

const OPTIONS: WheelOption[] = [
  { value: "happy", label: "Happy", hint: "Default" },
  { value: "angry", label: "Angry" },
  { value: "sad", label: "Sad" },
];

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host = undefined;
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const markupOf = async (pictureBottom: number | null, chrome = 0) => {
  const panel = document.body.appendChild(document.createElement("div"));
  panel.setAttribute("data-panel", "");
  const picture = panel.appendChild(document.createElement("div"));
  picture.setAttribute("data-picture", "");
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const bottom = this === panel ? PANEL_HEIGHT : this === picture ? (pictureBottom ?? 0) : 0;
    const height = this.hasAttribute("data-wheel-sheet")
      ? chrome + WHEEL_HEIGHT
      : this.hasAttribute("data-wheel-room")
        ? WHEEL_HEIGHT
        : bottom;
    return { top: 0, left: 0, right: PANEL_WIDTH, bottom, x: 0, y: 0, width: PANEL_WIDTH, height, toJSON: () => ({}) } as DOMRect;
  });
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(
      <WheelSheet
        container={{ current: panel }}
        keepClear={pictureBottom === null ? undefined : { current: picture }}
        open
        title="Face"
        options={OPTIONS}
        value="happy"
        onChoose={() => {}}
        onCancel={() => {}}
      />,
      host!,
    ),
  );
  panel.setAttribute("style", `position:relative;width:${PANEL_WIDTH}px;height:${PANEL_HEIGHT}px;overflow:hidden`);
  picture.setAttribute("style", `height:${pictureBottom ?? 0}px`);
  const markup = panel.outerHTML;
  await act(async () => render(null, host!));
  host = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  return markup;
};

const stylesFor = async (markup: string) => {
  const compiler = await compile('@import "./src/style.css";', { base: PACKAGE, onDependency: () => {} });
  const candidates = [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
    match[1]!.replace(/&amp;/g, "&").split(/\s+/),
  );
  return compiler.build(candidates);
};

const measure = async (markup: string, coarse = false) => {
  const css = await stylesFor(markup);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: PANEL_WIDTH, height: PANEL_HEIGHT },
      reducedMotion: "reduce",
      hasTouch: coarse,
      isMobile: coarse,
    });
    await page.setContent(
      `<!doctype html><html data-theme="charcoal"><head><style>${css}</style></head><body style="margin:0">${markup}</body></html>`,
    );
    return await page.evaluate(() => {
      const box = (element: Element | Range) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height };
      };
      const label = document.querySelector('[data-wheel-sheet] [aria-selected="true"] span')!;
      const range = document.createRange();
      range.selectNodeContents(label);
      return {
        coarse: matchMedia("(pointer: coarse)").matches,
        clearance: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sheet-gesture-clearance")),
        picture: box(document.querySelector("[data-picture]")!),
        sheet: box(document.querySelector("[data-wheel-sheet]")!),
        room: box(document.querySelector("[data-wheel-room]")!),
        row: box(label.closest('[role="option"]')!),
        label: box(range),
        text: label.textContent,
      };
    });
  } finally {
    await browser.close();
  }
};

describe.skipIf(!browserAvailable)("a WheelSheet kept clear of a picture, rendered in a browser", () => {
  const chromeOf = async () => {
    const free = await measure(await markupOf(null));
    return free.sheet.height - free.room.height;
  };

  test.each([
    [249, "175px of room"],
    [264, "160px of room"],
    [300, "124px of room, under the prototype's 160px"],
  ])("with the picture ending at %ipx (%s), the sheet stays under the picture and shows the centred option's label", async (pictureBottom) => {
    const measured = await measure(await markupOf(pictureBottom, await chromeOf()));
    expect(measured.text).toBe("Happy");
    expect(measured.sheet.top).toBeGreaterThanOrEqual(measured.picture.bottom + 6);
    expect(measured.label.top).toBeGreaterThanOrEqual(measured.sheet.top);
    expect(measured.label.bottom).toBeLessThanOrEqual(measured.sheet.bottom);
  });

  test("with less room than its header and one row, the sheet keeps its header and one whole row, rising over the picture", async () => {
    const chrome = await chromeOf();
    const measured = await measure(await markupOf(380, chrome));
    expect(measured.sheet.height).toBeCloseTo(chrome + WHEEL_ROW, 0);
    expect(measured.sheet.top).toBeLessThan(measured.picture.bottom);
    expect(measured.room.height).toBeCloseTo(WHEEL_ROW, 0);
    expect(measured.label.top).toBeGreaterThanOrEqual(measured.room.top);
    expect(measured.label.bottom).toBeLessThanOrEqual(measured.room.bottom);
  });
});

describe.skipIf(!browserAvailable)("a WheelSheet under a coarse pointer, rendered in a browser", () => {
  const chromeOf = async (coarse: boolean) => {
    const free = await measure(await markupOf(null), coarse);
    return free.sheet.height - free.room.height;
  };

  test("keeps its centred row above the panel's foot by the gesture clearance when it has all the room it wants", async () => {
    const measured = await measure(await markupOf(null), true);
    expect(measured.coarse).toBe(true);
    expect(measured.clearance).toBeGreaterThan(0);
    expect(measured.text).toBe("Happy");
    expect(measured.row.bottom).toBeLessThanOrEqual(PANEL_HEIGHT - measured.clearance);
  });

  test("with room just above its header, one row and the clearance, stays under the picture and keeps the row clear of the foot", async () => {
    const chrome = await chromeOf(true);
    const minimum = chrome + WHEEL_ROW;
    const measured = await measure(await markupOf(PANEL_HEIGHT - 6 - minimum - 1, chrome), true);
    expect(measured.sheet.top).toBeGreaterThanOrEqual(measured.picture.bottom + 6);
    expect(measured.row.top).toBeGreaterThanOrEqual(measured.room.top - 2);
    expect(measured.row.bottom).toBeLessThanOrEqual(PANEL_HEIGHT - measured.clearance);
  });

  test.each([1, 8])(
    "with %ipx less room than its header, one row and the clearance, rises over the picture by that much and keeps the row clear of the foot",
    async (shortfall) => {
      const chrome = await chromeOf(true);
      const minimum = chrome + WHEEL_ROW;
      const measured = await measure(await markupOf(PANEL_HEIGHT - 6 - minimum + shortfall, chrome), true);
      expect(measured.text).toBe("Happy");
      expect(measured.sheet.height).toBeCloseTo(minimum, 0);
      expect(measured.sheet.top).toBeCloseTo(measured.picture.bottom + 6 - shortfall, 0);
      expect(measured.row.bottom).toBeLessThanOrEqual(PANEL_HEIGHT - measured.clearance);
      expect(measured.label.top).toBeGreaterThanOrEqual(measured.room.top);
    },
  );

  test("adds the clearance under a coarse pointer only", async () => {
    expect((await chromeOf(true)) - (await chromeOf(false))).toBeCloseTo(
      (await measure(await markupOf(null), true)).clearance,
      0,
    );
  });
});
