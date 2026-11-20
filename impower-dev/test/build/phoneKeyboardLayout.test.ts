// @vitest-environment node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  fs.readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf-8");

const DOCUMENT_HTML = read("../../src/public/document.html");
const DOCUMENT_CSS = read("../../src/public/document.css");

const page = (htmlClass: string, shell: string, panel = "") =>
  new JSDOM(
    `<!doctype html><html class="${htmlClass}"><head><style>${DOCUMENT_CSS}</style></head><body><div data-phone-shell ${shell}><div class="sparkdown-script-editor-root"><div class="cm-editor"><div class="cm-panel cm-keyboard-toolbar"></div></div></div>${panel}</div></body></html>`,
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

  it("lets the reader pinch-zoom the page to at least 200%", () => {
    const content =
      new JSDOM(DOCUMENT_HTML).window.document
        .querySelector('meta[name="viewport"]')
        ?.getAttribute("content") ?? "";
    const settings = Object.fromEntries(
      content
        .split(",")
        .map((part) => part.split("=").map((side) => side.trim().toLowerCase())),
    );

    expect(settings["user-scalable"] ?? "yes").not.toMatch(/^(no|0)$/);
    expect(Number(settings["maximum-scale"] ?? "10")).toBeGreaterThanOrEqual(2);
  });

  it("draws every text field at 16px on a touch screen, so focusing one does not zoom the page", () => {
    const sheet = new JSDOM(`<style>${DOCUMENT_CSS}</style>`).window.document
      .styleSheets[0]!;
    const coarse = Array.from(sheet.cssRules).filter(
      (rule): rule is CSSMediaRule =>
        "conditionText" in rule &&
        /pointer:\s*coarse/.test((rule as CSSMediaRule).conditionText),
    );
    const sized = coarse
      .flatMap((rule) => Array.from(rule.cssRules) as CSSStyleRule[])
      .filter((rule) => rule.style.getPropertyValue("font-size") === "16px");
    const win = new JSDOM(
      '<input type="text"><input type="search"><input><textarea></textarea><select></select><input type="checkbox"><input type="radio"><input type="range">',
    ).window;
    const covered = (el: Element) =>
      sized.some((rule) => el.matches(rule.selectorText));
    const [text, search, untyped, area, select, checkbox, radio, range] =
      Array.from(win.document.body.children);

    expect([text, search, untyped, area, select].map(covered)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect([checkbox, radio, range].map(covered)).toEqual([false, false, false]);
  });

  it("shows the script's keyboard toolbar on a phone only while editing with the keyboard measured open", () => {
    const toolbar = (win: Window) =>
      win.getComputedStyle(win.document.querySelector(".cm-keyboard-toolbar")!)
        .display;

    expect(toolbar(page("keyboard-open", ""))).toBe("none");
    expect(toolbar(page("", "data-editing"))).toBe("none");
    expect(toolbar(page("keyboard-open", "data-editing"))).not.toBe("none");
  });

  it("keeps the script's keyboard toolbar, the spacer under a panel's heading, while a panel replaces the keyboard", () => {
    const toolbar = (win: Window) =>
      win.getComputedStyle(win.document.querySelector(".cm-keyboard-toolbar")!)
        .display;
    const panel = '<div data-keyboard-panel><div role="heading">Add</div></div>';

    expect(toolbar(page("", "data-editing", panel))).not.toBe("none");
    expect(toolbar(page("", "", panel))).toBe("none");
  });

  it("stops the page itself panning under the visible area while the keyboard is open, and still lets a pinch zoom it", () => {
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

    expect(touchAction(open, open.document.documentElement)).toBe("pinch-zoom");
    expect(touchAction(open, open.document.body)).toBe("pinch-zoom");
    expect(touchAction(closed, closed.document.body)).toBe("");
  });
});
