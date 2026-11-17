import { describe, expect, test } from "vitest";
import { createScreenRenderContext } from "../../sparkle-screen-preview/src/utils/createScreenRenderContext";
import { getComponents, parseSparkle, renderCssVDOM } from "../src";
import { sparkleSelectorToCssSelector } from "../src/runtime/css";

const renderStyle = (selector: string) => {
  const parsed = parseSparkle(`style card\n  ${selector}\n    color = red`);
  return JSON.stringify(
    renderCssVDOM(
      parsed,
      createScreenRenderContext(getComponents(parsed), {}, new Set()),
    ),
  );
};

describe("the screen preview writes style states as the game player does (#2154)", () => {
  test.each([
    ["@first-child", ":first-child"],
    ["card @first-child", ".card:first-child"],
    ["@focus-visible", ":focus-visible"],
    ["@hover", ":hover"],
    ["@has(@hovered)", ":has(:hover)"],
    ["@type_submit", '[type="submit"]'],
    ["@file-button", "::file-selector-button"],
    ["@nth-child(2n of card)", ":nth-child(2n of .card)"],
    ["@lang(en, fr)", ":lang(en, fr)"],
    ["@hoveredx", "@hoveredx"],
    ["@theme(dark)", "@media(prefers-color-scheme:dark)"],
  ])("writes %s as %s", (selector, css) => {
    expect(sparkleSelectorToCssSelector(selector, {})).toBe(css);
  });

  test("renders a standard state block into the preview's styles", () => {
    expect(renderStyle("@first-child")).toContain(":first-child");
    expect(renderStyle("@first-child")).not.toContain(":first-child-child");
  });
});
