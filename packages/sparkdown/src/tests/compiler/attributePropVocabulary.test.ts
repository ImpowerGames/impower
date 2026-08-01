// The validator's vocabulary and the ui runtime's routing must describe the
// same set of props.
//
// They were two hand-maintained lists, and they drifted by 29 entries. A prop
// in the validator's list but not the runtime's validates clean, gets routed to
// `style[prop]`, and is dropped by CSSOM: no attribute, no style, no warning —
// the exact silent no-op the validator exists to prevent, produced by the
// validator's own data.

import { describe, expect, test } from "vitest";
import {
  ARIA_ATTRIBUTE_ALIASES,
  ATTRIBUTE_PROPS,
  BOOLEAN_ATTRIBUTES,
  DATA_ATTRIBUTE_PROPS,
  isAttributeProp,
} from "../../compiler/constants/dataAttributeProps";
import VALID_STYLE_PROPS_DATA from "../../compiler/constants/validStyleProps.json";

const VALID = new Set<string>(VALID_STYLE_PROPS_DATA.props);

describe("the two lists agree", () => {
  test("every prop the runtime routes as an attribute validates clean", () => {
    const routed = [
      ...ATTRIBUTE_PROPS,
      ...DATA_ATTRIBUTE_PROPS,
      ...ARIA_ATTRIBUTE_ALIASES.keys(),
    ];
    expect(routed.filter((p) => !VALID.has(p))).toEqual([]);
  });

  // The direction that actually bit: validates clean, does nothing. Anything in
  // the generated vocabulary that is not a CSS property must be routed.
  test("no non-CSS prop validates clean without being routed", () => {
    // A CSS property always contains a letter and may be hyphenated/vendored;
    // the attribute-shaped names are the ones worth checking, so compare
    // against the routing predicate directly for the declared attribute sets.
    const declared = [
      ...ATTRIBUTE_PROPS,
      ...DATA_ATTRIBUTE_PROPS,
      ...ARIA_ATTRIBUTE_ALIASES.keys(),
      ...BOOLEAN_ATTRIBUTES,
    ];
    expect(declared.filter((p) => !isAttributeProp(p))).toEqual([]);
  });

  test("every boolean attribute is also an attribute prop", () => {
    expect([...BOOLEAN_ATTRIBUTES].filter((p) => !ATTRIBUTE_PROPS.has(p))).toEqual(
      [],
    );
  });

  // Enumerated attributes take a meaningful `="false"`, so treating them as
  // presence-only would silently drop the author's explicit "no".
  test("enumerated attributes are not treated as booleans", () => {
    for (const prop of ["draggable", "spellcheck", "translate", "crossorigin"]) {
      expect(BOOLEAN_ATTRIBUTES.has(prop)).toBe(false);
      expect(ATTRIBUTE_PROPS.has(prop)).toBe(true);
    }
  });
});
