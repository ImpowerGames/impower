import "./compileSnapshot";
import { readFileSync } from "node:fs";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
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
  it("compiles the documented named look without an unresolved variable warning", () => {
    const guide = readFileSync(
      new URL("../../../docs/guide/Portraits.md", import.meta.url),
      "utf8",
    );
    const example = guide.match(
      /define mia_party as filtered_image with[\s\S]*?\nend/,
    )?.[0];
    expect(example).toBeDefined();
    const uri = "file:///project/main.sd";
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        { uri, type: "script", name: "main", ext: "sd", version: 1,
          languageId: "sparkdown", text: example! },
        { uri: "file:///project/assets/mia.svg", type: "image", name: "mia",
          ext: "svg", data: '<svg><g data-name="face.happy:default"/><g data-name="hat.on"/><g data-name="pupils:look.left:default"/></svg>' },
      ],
    });
    const program = compiler.compile({ textDocument: { uri } }).program;
    const messages = (program.diagnostics?.[uri] ?? []).map((d) =>
      typeof d.message === "string" ? d.message : d.message.value,
    );
    expect(messages).toEqual([]);
  });
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
