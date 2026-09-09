import { decodeSVGSource } from "../../attributes/svg";
import { describe, expect, it } from "vitest";
import { buildAttributeVocabulary, buildSVGAttributeVocabulary, filterSVGAttributes, normalizeSVGAttributeNames, ATTRIBUTE_VOCABULARY_VERSION } from "../../attributes";
import { SparkdownFileRegistry } from "../../compiler/classes/SparkdownFileRegistry";
import { ImageVocabularyCache } from "../../workspace/utils/prepareImageFile";

describe("SVG attribute ingestion contract", () => {
  it("never interprets ordinary IDs or unnormalized exporter labels as conditions", () => {
    const svg = '<svg><g id="icon.part"><path id="Layer_1"/></g><g serif:id="hat.on"/><g inkscape:label="eyes.closed"/></svg>';
    expect(buildSVGAttributeVocabulary(svg).groups).toEqual({});
    expect(buildSVGAttributeVocabulary(svg).diagnostics).toEqual([]);
    expect(filterSVGAttributes(svg, {})).toContain("icon.part");
  });
  it("normalizes explicit labels and leaves referenced IDs and existing names intact", () => {
    const svg = '<svg><g serif:id="hat.on" id="art"/><use href="#art"/><g data-name="body" serif:id="wrong.on"/><path id="face.happy"/></svg>';
    const normalized = normalizeSVGAttributeNames(svg);
    expect(normalized).toContain('data-name="hat.on"');
    expect(normalized).toContain('href="#art"');
    expect(normalized).not.toContain('data-name="face.happy"');
    expect(buildSVGAttributeVocabulary(normalized).groups).toEqual({hat: {options: ["on", "off"], switch: true}});
    expect(normalizeSVGAttributeNames(normalized)).toBe(normalized);
  });
  it("prepares uppercase SVG imports before sending metadata", () => {
    const file = new ImageVocabularyCache().prepare({uri: "file:///portrait.SVG", name: "portrait", ext: "SVG", type: "image", text: '<svg><g serif:id="hat.on"/></svg>'});
    expect(file.attribute_vocabulary?.groups["hat"]).toBeDefined();
    expect(file.text).toBeUndefined();
  });
  it("rebuilds incompatible metadata from available SVG bytes", () => {
    const registry = new SparkdownFileRegistry();
    registry.add({file: {uri: "file:///portrait.SVG", name: "portrait", ext: "SVG", type: "image", text: '<svg><g serif:id="hat.on"/></svg>', attribute_vocabulary: {...buildAttributeVocabulary([]), version: -1}}});
    expect(registry.get("file:///portrait.SVG")?.attribute_vocabulary?.groups["hat"]).toBeDefined();
    expect(registry.get("file:///portrait.SVG")?.attribute_vocabulary?.version).toBe(ATTRIBUTE_VOCABULARY_VERSION);
  });
  it("quarantines incompatible metadata without bytes and reports a reload diagnostic", () => {
    const registry = new SparkdownFileRegistry();
    registry.add({file: {uri: "file:///portrait.svg", name: "portrait", ext: "svg", type: "image", attribute_vocabulary: {...buildAttributeVocabulary([{key: "x", name: "hat.on"}]), version: -1}}});
    const vocabulary = registry.get("file:///portrait.svg")?.attribute_vocabulary;
    expect(vocabulary?.groups).toEqual({});
    expect(vocabulary?.diagnostics).toContainEqual(expect.objectContaining({code: "incompatible-attribute-vocabulary"}));
  });
  it("diagnoses contradictory inherited conditions through unlabelled ancestors", () => {
    const vocabulary = buildAttributeVocabulary([{key: "a", name: "eyes.open"}, {key: "b", name: "details", parent: "a"}, {key: "c", name: "eyes.closed", parent: "b"}]);
    expect(vocabulary.diagnostics).toContainEqual(expect.objectContaining({code: "contradictory-inherited-condition", layer: "eyes.closed", group: "eyes"}));
  });
  it("intersects every ancestor OR list, not only adjacent pairs", () => {
    const vocabulary = buildAttributeVocabulary([{key: "a", name: "pose.a.b"}, {key: "b", name: "pose.b.c", parent: "a"}, {key: "c", name: "pose.a.c", parent: "b"}]);
    expect(vocabulary.diagnostics).toContainEqual(expect.objectContaining({code: "contradictory-inherited-condition", layer: "pose.a.c"}));
  });
  it("accepts intersecting hyphen prefixes and independent sibling conditions", () => {
    const vocabulary = buildAttributeVocabulary([{key: "a", name: "arms.phone"}, {key: "b", name: "arms.phone-left", parent: "a"}, {key: "c", name: "arms.down"}]);
    expect(vocabulary.diagnostics).toEqual([]);
  });
});

it.each(["100%20", "%23art", "%E2%82%AC", "100%"])("preserves literal %s through preparation and registry normalization", (literal) => {
  const file = new ImageVocabularyCache().prepare({uri: "file:///percent.svg", name: "percent", ext: "svg", type: "image", text: '<svg><text>' + literal + '</text><g serif:id="hat.on"/></svg>'});
  const registry = new SparkdownFileRegistry();
  registry.add({file});
  expect(decodeSVGSource(registry.get(file.uri)!.data!)).toContain('<text>' + literal + '</text>');
  expect(registry.get(file.uri)?.attribute_vocabulary?.groups["hat"]).toBeDefined();
});
