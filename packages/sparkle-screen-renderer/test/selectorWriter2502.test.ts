import { describe, expect, test } from "vitest";
import { createScreenRenderContext } from "../../sparkle-screen-preview/src/utils/createScreenRenderContext";
import { BREAKPOINTS, SHARED_CASES } from "../../spark-web-player/src/tests/ui/selectorWriterCases2502";
import { getComponents, parseSparkle, renderCssVDOM } from "../src";
import { sparkleSelectorToCssSelector } from "../src/runtime/css";

const renderStyle = (selector: string) => {
  const parsed = parseSparkle(`style card\n  ${selector}\n    color = red`);
  return JSON.stringify(renderCssVDOM(parsed, createScreenRenderContext(getComponents(parsed), {}, new Set())));
};

describe("the screen preview writes selectors as the game player does (#2502)", () => {
  test.each(SHARED_CASES)("writes %s as %s", (source, css) => {
    expect(sparkleSelectorToCssSelector(source, { ...BREAKPOINTS })?.css).toBe(css);
  });

  test.each([
    ["@type_submit", '[type="submit"]'],
    ["@busy", '[aria-busy="true"]'],
    ["@track", "::-webkit-slider-runnable-track"],
    ["@file_button", "::file-selector-button"],
    ["@indeterminate", ":indeterminate"],
    ["> #image^=bunny@", ">[image^=bunny\\@]"],
  ])("writes the player's own %s as %s", (source, css) => {
    expect(sparkleSelectorToCssSelector(source, {})?.css).toBe(css);
  });

  test.each([
    ["@theme(dark)", "@media(prefers-color-scheme:dark)"],
    ["@theme( dark )", "@media(prefers-color-scheme:dark)"],
  ])("writes the color scheme state %s as the media query %s", (source, css) => {
    expect(sparkleSelectorToCssSelector(source, {})?.css).toBe(css);
  });

  test("renders a standard state block into the preview's styles", () => {
    expect(renderStyle("@first-child")).toContain("&:first-child {");
    expect(renderStyle("@first-child")).not.toContain("first-child-child");
  });

  test("anchors every state alternative of a block to its element", () => {
    expect(renderStyle("@hovered, @focus-visible")).toContain("&:hover, &:focus-visible {");
  });
});
