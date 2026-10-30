// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { getCssTokenValue } from "../../../../spark-dom/src/utils/getCssTokenValue";
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { getCssPropertyNames } from "../../../../sparkle-style-transformer/src/utils/getCssPropertyNames";

const applyUpdateStyle = (
  element: HTMLElement,
  style: Record<string, string | number | null>,
) => {
  Object.entries(style).forEach(([k, v]) => {
    if (v == null) {
      for (const cssProp of getCssPropertyNames(k)) {
        element.style.removeProperty(cssProp);
      }
    } else {
      for (const [cssProp, cssValue] of getCssEquivalent(
        k,
        getCssTokenValue(v),
      )) {
        element.style.setProperty(cssProp, cssValue);
      }
    }
  });
};

const setThenClear = (prop: string, value: string) => {
  const el = document.createElement("div");
  applyUpdateStyle(el, { [prop]: value });
  const applied = el.getAttribute("style") ?? "";
  applyUpdateStyle(el, { [prop]: null });
  return { applied, cleared: el.getAttribute("style") ?? "" };
};

describe("a nulled style prop is actually removed", () => {
  test("display (control)", () => {
    const { applied, cleared } = setThenClear("display", "none");
    expect(applied).toContain("display");
    expect(cleared).not.toContain("display");
  });

  for (const [prop, value] of [
    ["background_color", "red"],
    ["color", "red"],
    ["text_color", "red"],
    ["border_color", "red"],
  ] as const) {
    test(prop, () => {
      const { applied, cleared } = setThenClear(prop, value);
      expect(applied).not.toBe("");
      expect(cleared).toBe("");
    });
  }
});
