import { compile } from "@tailwindcss/node";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WheelSheet, type WheelOption } from "../src/components/wheel-picker/WheelPicker";

const PACKAGE = process.cwd();
const PANEL_HEIGHT = 430;
const PANEL_WIDTH = 600;

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

const markupAt = async (pictureBottom: number) => {
  const panel = document.body.appendChild(document.createElement("div"));
  panel.setAttribute("data-panel", "");
  const picture = panel.appendChild(document.createElement("div"));
  picture.setAttribute("data-picture", "");
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const bottom = this === panel ? PANEL_HEIGHT : this === picture ? pictureBottom : 0;
    return { top: 0, left: 0, right: PANEL_WIDTH, bottom, x: 0, y: 0, width: PANEL_WIDTH, height: bottom, toJSON: () => ({}) } as DOMRect;
  });
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(
      <WheelSheet
        container={{ current: panel }}
        keepClear={{ current: picture }}
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
  picture.setAttribute("style", `height:${pictureBottom}px`);
  return panel.outerHTML;
};

const stylesFor = async (markup: string) => {
  const compiler = await compile('@import "./src/style.css";', { base: PACKAGE, onDependency: () => {} });
  const candidates = [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
    match[1]!.replace(/&amp;/g, "&").split(/\s+/),
  );
  return compiler.build(candidates);
};

const measure = async (markup: string) => {
  const css = await stylesFor(markup);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: PANEL_WIDTH, height: PANEL_HEIGHT }, reducedMotion: "reduce" });
    await page.setContent(
      `<!doctype html><html data-theme="charcoal"><head><style>${css}</style></head><body style="margin:0">${markup}</body></html>`,
    );
    return await page.evaluate(() => {
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      };
      const label = document.querySelector('[data-wheel-sheet] [aria-selected="true"] span')!;
      const range = document.createRange();
      range.selectNodeContents(label);
      return {
        picture: box(document.querySelector("[data-picture]")!),
        sheet: box(document.querySelector("[data-wheel-sheet]")!),
        label: box(range),
        text: label.textContent,
      };
    });
  } finally {
    await browser.close();
  }
};

describe.skipIf(!browserAvailable)("a WheelSheet kept clear of a picture, rendered in a browser", () => {
  test.each([
    [249, "room above the floor"],
    [264, "the 160px floor"],
  ])("with the picture ending at %ipx (%s), the sheet stays under the picture and shows the centred option's label", async (pictureBottom) => {
    const measured = await measure(await markupAt(pictureBottom));
    expect(measured.text).toBe("Happy");
    expect(measured.sheet.top).toBeGreaterThanOrEqual(measured.picture.bottom + 6);
    expect(measured.label.top).toBeGreaterThanOrEqual(measured.sheet.top);
    expect(measured.label.bottom).toBeLessThanOrEqual(measured.sheet.bottom);
  });
});
