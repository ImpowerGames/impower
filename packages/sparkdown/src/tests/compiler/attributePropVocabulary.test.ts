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
      ...BOOLEAN_ATTRIBUTES,
    ];
    expect(routed.filter((p) => !VALID.has(p))).toEqual([]);
  });

  test("every boolean attribute is also an attribute prop", () => {
    expect([...BOOLEAN_ATTRIBUTES].filter((p) => !ATTRIBUTE_PROPS.has(p))).toEqual(
      [],
    );
  });

  test("enumerated attributes are not treated as booleans", () => {
    for (const prop of ["draggable", "spellcheck", "crossorigin"]) {
      expect(BOOLEAN_ATTRIBUTES.has(prop)).toBe(false);
      expect(ATTRIBUTE_PROPS.has(prop)).toBe(true);
    }
  });

  test("translate is a style prop, not an attribute prop", () => {
    expect(isAttributeProp("translate")).toBe(false);
  });
});
