import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSVGAttributeVocabulary,
  evaluateAttributeVisibility,
  resolveAttributes,
  type AttributeLayerInput,
} from "../../attributes";

// The historical portrait fixture preserves the real SVG's names, original IDs and
// folder tree at this source revision, omitting only drawing geometry.
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "./fixtures/raffles-and-bunny-8d734bb.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { sourceCommit: string; trees: Record<string, AttributeLayerInput[]> };
const layers = fixture.trees["bunny_realization"]!;
const keys = new Set(layers.map((layer) => layer.key));
const xml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
const group = (layer: AttributeLayerInput): string =>
  `<g data-name="${xml(layer.name)}"${layer.id ? ` id="${xml(layer.id)}"` : ""}>${layers
    .filter((child) => child.parent === layer.key)
    .map(group)
    .join("")}</g>`;
const svg = `<svg>${layers
  .filter((layer) => !layer.parent || !keys.has(layer.parent))
  .map(group)
  .join("")}</svg>`;
const vocabulary = buildSVGAttributeVocabulary(svg);

describe("bunny_realization.svg vocabulary fixture", () => {
  it("indexes the real named groups and switches", () => {
    expect(fixture.sourceCommit).toBe(
      "46e336a577ac42e55eb39b917ad2ad5abad84b94",
    );
    for (const name of [
      "face",
      "eyebrows",
      "look",
      "eyes",
      "mouth",
      "clothes",
      "arms",
    ]) {
      expect(vocabulary.groups[name]?.switch, name).toBe(false);
    }
    for (const name of ["jacket", "helmet", "mask", "cushion", "grab"]) {
      expect(vocabulary.groups[name]?.switch, name).toBe(true);
      expect(vocabulary.groups[name]?.options).toEqual(
        expect.arrayContaining(["on", "off"]),
      );
    }
  });

  it("preserves realization as resting and reports the artist's competing default", () => {
    const realization = vocabulary.layers.find(
      (layer) => layer.id === "filter-face-realization-default",
    )!;
    expect(vocabulary.folders[realization.parent]?.defaults["face"]).toContain(
      "realization",
    );
    // The pinned art also marks supportive in this folder. Do not silently
    // discard the artist's second default when evaluating its visible stack.
    expect(vocabulary.diagnostics).toContainEqual(
      expect.objectContaining({ code: "conflicting-defaults", group: "face" }),
    );
    expect(
      evaluateAttributeVisibility(vocabulary, {}).visible[realization.key],
    ).toBe(true);
  });

  it("overrides bunny_help's eyebrows without changing the help face", () => {
    const help = resolveAttributes(vocabulary, ["help"]);
    const changed = resolveAttributes(
      vocabulary,
      ["eyebrows.angry"],
      help.selection,
    );
    expect(changed.selection).toMatchObject({
      face: "help",
      eyebrows: "angry",
    });
    const visible = evaluateAttributeVisibility(
      vocabulary,
      changed.selection,
    ).visible;
    const shown = vocabulary.layers
      .filter((layer) => visible[layer.key])
      .map((layer) => layer.id);
    expect(shown).toContain("filter-face-help");
    expect(shown).toContain("filter-eyebrows-angry");
    expect(shown).not.toContain("filter-eyebrows-help");
  });
});
