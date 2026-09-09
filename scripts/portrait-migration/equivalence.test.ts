import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildAttributeVocabulary, evaluateAttributeVisibility, resolveAttributes } from "../../packages/sparkdown/src/attributes/index";
import type { AttributeLayerInput } from "../../packages/sparkdown/src/attributes/types";

const json = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const fixture = json("./fixtures/raffles-and-bunny-8d734bb.json") as {
  sourceCommit: string;
  trees: Record<string, AttributeLayerInput[]>;
  cases: { directive: string; image: string; attributes: string[]; old: string[] }[];
};
const historical = json("./raffles-and-bunny.json").historical_exceptions;
const exceptions = { ...historical, ...json("./raffles-and-bunny-8d734bb-exceptions.json") } as Record<string, { removed: string[]; added: string[] }>;
const vocabularies = Object.fromEntries(Object.entries(fixture.trees).map(([name, layers]) => [name, buildAttributeVocabulary(layers)]));

test("real project corpus is pinned to its source revision", () => {
  // Coverage-prompt changes advanced HEAD; all measured project hashes match 8d734bb.
  assert.equal(fixture.sourceCommit, "46e336a577ac42e55eb39b917ad2ad5abad84b94");
  assert.equal(fixture.cases.length, 478);
  assert.equal(Object.keys(historical).length, 27);
  assert.equal(fixture.cases.filter((entry) => exceptions[entry.directive]).length, 29);
});

for (const entry of fixture.cases) {
  test(`visible layers: ${entry.directive}`, () => {
    const vocabulary = vocabularies[entry.image]!;
    const selection = resolveAttributes(vocabulary, entry.attributes).selection;
    const result = evaluateAttributeVisibility(vocabulary, selection);
    const actual = vocabulary.layers.filter((layer) => layer.id && result.visible[layer.key]).map((layer) => layer.id!).sort();
    const expected = new Set(entry.old);
    const exception = exceptions[entry.directive];
    for (const removed of exception?.removed ?? []) expected.delete(removed);
    for (const added of exception?.added ?? []) expected.add(added);
    assert.deepEqual(actual, [...expected].sort());
  });
}
