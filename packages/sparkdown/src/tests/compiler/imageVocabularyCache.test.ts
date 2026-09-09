import { describe, expect, it } from "vitest";
import { ImageVocabularyCache, imageFileForCompiler } from "../../workspace/utils/prepareImageFile";

const file = (option: string) => ({
  uri: "file:///project/assets/mia.svg", type: "image", name: "mia", ext: "svg", version: 1,
  text: `<svg><g id="face" serif:id="face.${option}:default"/></svg>`,
});

describe("workspace portrait vocabulary preparation", () => {
  it("normalizes artist labels and sends metadata without SVG text", () => {
    const prepared = new ImageVocabularyCache().prepare(file("happy"));
    expect(prepared.text).toBeUndefined();
    expect(prepared.attribute_vocabulary?.groups["face"]?.options).toEqual(["happy"]);
    expect(prepared.data).toContain("data-name");
    const wire = imageFileForCompiler(prepared, true);
    expect(wire.text).toBeUndefined();
    expect(wire.data).toBeUndefined();
    expect(wire.attribute_vocabulary).toEqual(prepared.attribute_vocabulary);
    expect(prepared.data).toBeDefined();
  });

  it("reuses the signature but refreshes equal-length edits and deletions", () => {
    const cache = new ImageVocabularyCache();
    const original = cache.prepare(file("happy"));
    expect(cache.prepare(file("happy")).attribute_vocabulary).toBe(original.attribute_vocabulary);
    const changed = cache.prepare(file("angry"));
    expect(changed.attribute_vocabulary?.groups["face"]?.options).toEqual(["angry"]);
    expect(changed.attribute_vocabulary).not.toBe(original.attribute_vocabulary);
    cache.delete(original.uri);
    expect(cache.prepare(file("angry")).attribute_vocabulary).not.toBe(changed.attribute_vocabulary);
  });
});
