import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildAttributeVocabulary,
  evaluateAttributeVisibility,
  resolveAttributes,
  type AttributeLayerInput,
} from "../../attributes";

const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/raffles-and-bunny-8d734bb.json", import.meta.url),
    "utf8",
  ),
) as {
  sourceCommit: string;
  sourceHashes: Record<string, string>;
  trees: Record<string, AttributeLayerInput[]>;
  cases: {
    directive: string;
    image: string;
    attributes: string[];
    expected: string[];
  }[];
};
const vocabularies = Object.fromEntries(
  Object.entries(fixture.trees).map(([name, layers]) => [
    name,
    buildAttributeVocabulary(layers),
  ]),
);

describe("real portrait corpus visibility", () => {
  it("pins all 478 cases and their source provenance", () => {
    expect(fixture.sourceCommit).toBe(
      "46e336a577ac42e55eb39b917ad2ad5abad84b94",
    );
    expect(Object.keys(fixture.sourceHashes)).toHaveLength(90);
    expect(Object.keys(fixture.trees)).toHaveLength(55);
    expect(fixture.cases).toHaveLength(478);
  });

  it.each(fixture.cases)("visible layers: $directive", (entry) => {
    const vocabulary = vocabularies[entry.image]!;
    const selection = resolveAttributes(vocabulary, entry.attributes).selection;
    const result = evaluateAttributeVisibility(vocabulary, selection);
    const actual = vocabulary.layers
      .filter((layer) => layer.id && result.visible[layer.key])
      .map((layer) => layer.id!)
      .sort();
    expect(actual).toEqual(entry.expected);
  });
});
