// @vitest-environment node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  fs.readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf-8");

const DOCUMENT_HTML = read("../../src/public/document.html");
const DOCUMENT_CSS = read("../../src/public/document.css");

const page = (htmlClass: string, shell: string) =>
  new JSDOM(
    `<!doctype html><html class="${htmlClass}"><head><style>${DOCUMENT_CSS}</style></head><body><div data-phone-shell ${shell}><div class="sparkdown-script-editor-root"><div class="cm-editor"><div class="cm-panel cm-keyboard-toolbar"></div></div></div></div></body></html>`,
  ).window;

describe("the phone layout around the on-screen keyboard", () => {
  it("leaves the keyboard's resize behaviour to the browser default that every phone browser shares", () => {
    const viewport = new JSDOM(DOCUMENT_HTML).window.document.querySelector(
      'meta[name="viewport"]',
    );

    expect(viewport?.getAttribute("content")).toContain("width=device-width");
    expect(viewport?.getAttribute("content")).not.toContain(
      "interactive-widget",
    );
  });

  it("shows the script's keyboard toolbar on a phone only while editing with the keyboard measured open", () => {
    const toolbar = (win: Window) =>
      win.getComputedStyle(win.document.querySelector(".cm-keyboard-toolbar")!)
        .display;

    expect(toolbar(page("keyboard-open", ""))).toBe("none");
    expect(toolbar(page("", "data-editing"))).toBe("none");
    expect(toolbar(page("keyboard-open", "data-editing"))).not.toBe("none");
  });

  it("stops the page itself panning under the visible area while the keyboard is open", () => {
    const touchAction = (win: Window, element: Element) =>
      Array.from(win.document.styleSheets)
        .flatMap((sheet) => Array.from(sheet.cssRules))
        .filter(
          (rule): rule is CSSStyleRule =>
            "selectorText" in rule &&
            element.matches((rule as CSSStyleRule).selectorText),
        )
        .map((rule) => rule.style.getPropertyValue("touch-action"))
        .filter(Boolean)
        .at(-1) ?? "";
    const open = page("keyboard-open", "data-editing");
    const closed = page("", "data-editing");

    expect(touchAction(open, open.document.documentElement)).toBe("none");
    expect(touchAction(open, open.document.body)).toBe("none");
    expect(touchAction(closed, closed.document.body)).not.toBe("none");
  });
});
