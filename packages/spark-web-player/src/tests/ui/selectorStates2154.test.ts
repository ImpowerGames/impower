import { describe, expect, it } from "vitest";
import { getCSSSelector } from "@impower/spark-dom/src/utils/getStyleContent";
import {
  SELECTOR_STATE_ALIASES,
  STANDARD_PSEUDO_CLASSES,
} from "../../../../sparkdown/src/compiler/constants/selectorStates";

describe("selector states (#2154)", () => {
  it.each([...STANDARD_PSEUDO_CLASSES].filter((name) => !(`@${name}` in SELECTOR_STATE_ALIASES)))(
    "writes the standard state @%s as its pseudo-class",
    (name) => {
      expect(getCSSSelector(`@${name}`, {})).toBe(`:${name}`);
    },
  );

  it("keeps a standard state's parameters", () => {
    expect(getCSSSelector("@nth-child(2)", {})).toBe(":nth-child(2)");
    expect(getCSSSelector("@has(@hovered)", {})).toBe(":has(:hover)");
    expect(getCSSSelector("@not(@first-child)", {})).toBe(":not(:first-child)");
  });

  it.each([
    ["@nth-child(2n of card)", ":nth-child(2n of .card)"],
    ["@nth-last-child(-n + 3 of item.big)", ":nth-last-child(-n + 3 of .item.big)"],
    ["@nth-child(odd of @hovered)", ":nth-child(odd of :hover)"],
    ["@nth-child(2n + 1)", ":nth-child(2n + 1)"],
    ["@nth-of-type(2n + 1)", ":nth-of-type(2n + 1)"],
    ["@lang(en, fr)", ":lang(en, fr)"],
    ["@language(en, fr)", ":lang(en, fr)"],
    ["@dir(rtl)", ":dir(rtl)"],
    ["@state(open)", ":state(open)"],
  ])("keeps the argument grammar of %s", (selector, css) => {
    expect(getCSSSelector(selector, {})).toBe(css);
  });

  it("reads a whole state name rather than a known name it starts with", () => {
    expect(getCSSSelector("@first-child", {})).toBe(":first-child");
    expect(getCSSSelector("@hoveredx", {})).toBe("@hoveredx");
  });

  it("still writes the player's own states and parameterised states", () => {
    expect(getCSSSelector("@hovered", {})).toBe(":hover");
    expect(getCSSSelector("@direction(rtl)", {})).toBe(":dir(rtl)");
    expect(getCSSSelector("@screen-size(sm)", { sm: 400 })).toBe("@container screen (max-width:400px)");
    expect(getCSSSelector("@theme(dark)", {})).toBe(':where([data-color-scheme="dark"]) &');
  });

  it("selects the elements a standard state names", () => {
    const list = document.createElement("div");
    list.innerHTML = '<div class="card"></div><div class="card"></div><div class="card"></div>';
    const [first, second, third] = [...list.children];
    const selector = getCSSSelector("card @first-child", {});
    expect(first!.matches(selector)).toBe(true);
    expect(second!.matches(selector)).toBe(false);
    const even = getCSSSelector("card @nth-child(2n)", {});
    expect([first, second, third].map((e) => e!.matches(even))).toEqual([false, true, false]);
  });
});
