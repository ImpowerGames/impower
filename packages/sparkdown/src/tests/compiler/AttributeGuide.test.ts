import { describe, expect, it } from "vitest";
import {
  buildAttributeVocabulary,
  evaluateAttributeVisibility,
  resolveAttributes,
  type AttributeVocabulary,
} from "../../attributes";

const vocabularyFor = (names: string[]) =>
  buildAttributeVocabulary(names.map((name) => ({ key: name, name })));
const shown = (vocabulary: AttributeVocabulary, attributes: string[]) => {
  const selected = resolveAttributes(vocabulary, attributes);
  expect(selected.diagnostics).toEqual([]);
  const { visible } = evaluateAttributeVisibility(
    vocabulary,
    selected.selection,
  );
  return Object.keys(visible).filter((key) => visible[key]);
};

describe("Character portraits guide examples", () => {
  it("adjusts Mia's party look while preserving its hat and eye direction", () => {
    const vocabulary = vocabularyFor([
      "face.neutral:default",
      "face.happy",
      "face.sad",
      "eyebrows.neutral:default",
      "eyebrows.happy",
      "eyebrows.sad",
      "whites:eyes.open:default",
      "lids:eyes.closed",
      "pupils:eyes.open:look.camera:default",
      "pupils:eyes.open:look.left",
      "hat.on",
      "hair-top:hat.off",
      "hair-under-brim:hat.on",
      "body",
    ]);
    const party = resolveAttributes(vocabulary, ["happy", "hat", "look.left"]);
    const adjusted = resolveAttributes(vocabulary, ["sad"], party.selection);
    expect(adjusted.selection).toEqual({
      face: "sad",
      eyebrows: "sad",
      hat: "on",
      look: "left",
    });
    const { visible } = evaluateAttributeVisibility(
      vocabulary,
      adjusted.selection,
    );
    expect(visible["face.sad"]).toBe(true);
    expect(visible["eyebrows.sad"]).toBe(true);
    expect(visible["hat.on"]).toBe(true);
    expect(visible["pupils:eyes.open:look.left"]).toBe(true);
    expect(visible["face.happy"]).toBe(false);
    expect(visible["hair-top:hat.off"]).toBe(false);
  });

  it("shows the office resting state, then changes each requested prop", () => {
    const vocabulary = vocabularyFor([
      "door.open",
      "door.closed:default",
      "vase.broken",
      "vase.whole:default",
      "lamp.off",
      "lamp.on:default",
      "room",
    ]);
    expect(shown(vocabulary, [])).toEqual([
      "door.closed:default",
      "vase.whole:default",
      "lamp.on:default",
      "room",
    ]);
    expect(shown(vocabulary, ["door.open"])).toEqual([
      "door.open",
      "vase.whole:default",
      "lamp.on:default",
      "room",
    ]);
    expect(shown(vocabulary, ["door.open", "vase.broken"])).toEqual([
      "door.open",
      "vase.broken",
      "lamp.on:default",
      "room",
    ]);
    expect(shown(vocabulary, ["lamp.off"])).toEqual([
      "door.closed:default",
      "vase.whole:default",
      "lamp.off",
      "room",
    ]);
  });
});
