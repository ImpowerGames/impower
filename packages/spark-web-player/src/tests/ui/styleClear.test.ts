// @vitest-environment jsdom
//
// Clearing a style prop. `ui/update` sends `null` for a prop that no longer
// applies, and the renderer removes it by asking `getCssEquivalent` which CSS
// declarations that prop expands to — with the null value in hand. A utility
// prop expands through a TRANSFORMER, and a transformer handed "null" can
// return nothing, in which case the expansion is empty and there is no
// declaration name to remove: the old value stays painted on the element.
//
// The mirror of the attribute-removal defect in `domAttributeLifecycle`:
// the removal path is the one nobody exercises.

import { describe, expect, test } from "vitest";
import { getCSSPropertyKeyValue } from "../../../../spark-dom/src/utils/getCSSPropertyKeyValue";
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { getCssPropertyNames } from "../../../../sparkle-style-transformer/src/utils/getCssPropertyNames";

/** Exactly the `ui/update` style branch of `UIManager.onReceiveRequest`. */
const applyUpdateStyle = (
  element: HTMLElement,
  style: Record<string, string | number | null>,
) => {
  Object.entries(style).forEach(([k, v]) => {
    const [prop, value] = getCSSPropertyKeyValue(k, v);
    if (v == null) {
      for (const cssProp of getCssPropertyNames(prop)) {
        element.style.removeProperty(cssProp);
      }
    } else {
      for (const [cssProp, cssValue] of getCssEquivalent(prop, value)) {
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
  // A plain pass-through prop: no utility, no transformer.
  test("display (control)", () => {
    const { applied, cleared } = setThenClear("display", "none");
    expect(applied).toContain("display");
    expect(cleared).not.toContain("display");
  });

  // Utility props whose expansion runs a value transformer — the case where a
  // "null" value can collapse the expansion to nothing.
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
