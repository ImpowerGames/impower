import { describe, expect, it } from "vitest";
import {
  buildAttributeVocabulary,
  evaluateAttributeVisibility,
  resolveAttributes,
} from "../../attributes";

const vocabulary = buildAttributeVocabulary([
  { key: "ear-arm", name: "arm:arms.phone.phone-left.phone-close" },
  { key: "away-arm", name: "arm:arms.phone-away" },
  { key: "down-arm", name: "arm:arms.down:default" },
]);

const visible = (attributes: string[]) => {
  const resolved = resolveAttributes(vocabulary, attributes);
  return {
    diagnostics: resolved.diagnostics,
    visible: evaluateAttributeVisibility(vocabulary, resolved.selection).visible,
  };
};

describe("attribute options match exactly", () => {
  it("shows only the phone-away arm for phone-away", () => {
    const result = visible(["arms.phone-away"]);
    expect(result.diagnostics).toEqual([]);
    expect(result.visible).toMatchObject({
      "ear-arm": false,
      "away-arm": true,
      "down-arm": false,
    });
  });

  it("shows the at-ear arm for each option it lists", () => {
    for (const option of ["phone", "phone-left", "phone-close"])
      expect(visible([`arms.${option}`]).visible).toMatchObject({
        "ear-arm": true,
        "away-arm": false,
      });
  });

  it("reports a hyphenated option the image does not define", () => {
    expect(visible(["arms.phone-awya"]).diagnostics).toContainEqual(
      expect.objectContaining({ code: "unknown-attribute" }),
    );
  });

  it("reports a child that narrows a parent to a different hyphenated option", () => {
    const nested = buildAttributeVocabulary([
      { key: "a", name: "arms.phone" },
      { key: "b", name: "arms.phone-left", parent: "a" },
    ]);
    expect(nested.diagnostics).toContainEqual(
      expect.objectContaining({ code: "contradictory-inherited-condition" }),
    );
  });
});
