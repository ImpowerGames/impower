import { describe, expect, it } from "vitest";
import {
  buildAttributeVocabulary,
  buildSVGAttributeVocabulary,
  attributeVocabularyCacheKey,
  diagnoseRareAttributeOptions,
  decodeSVGSource,
  evaluateAttributeVisibility,
  normalizeSVGAttributeNames,
  parseLayerName,
  resolveAttributes,
} from "../../attributes";
import { filterSVG } from "../../compiler/utils/filterSVG";

const portrait = `<svg xmlns="http://www.w3.org/2000/svg">
  <g id="body"/>
  <g id="face-neutral" data-name="face.neutral:default">
    <g id="neutral-lids" data-name="lids:eyes.closed"/>
    <g id="neutral-left" data-name="pupils:eyes.open:look.left"/>
    <g id="neutral-camera" data-name="pupils:eyes.open:look.camera:default"/>
    <g id="neutral-whites" data-name="whites:eyes.open:default"/>
  </g>
  <g id="face-happy" data-name="face.happy">
    <g id="happy-up" data-name="pupils:eyes.open:look.up:default"/>
    <g id="happy-whites" data-name="whites:eyes.open:default"/>
  </g>
  <g id="brows-neutral" data-name="eyebrows.neutral:default"/>
  <g id="brows-happy" data-name="eyebrows.happy"/>
  <g id="brows-angry" data-name="eyebrows.angry"/>
  <g id="hair-top" data-name="hair-top:hat.off"/>
  <g id="hair-flat" data-name="hair-under-brim:hat.on"/>
  <g id="hat" data-name="hat.on"/>
</svg>`;

const ids = (svg: string) =>
  [...svg.matchAll(/\bid=['"]([^'"]*)['"]/g)].map((m) => m[1]);
const render = (attributes: string[]) => {
  const vocabulary = buildSVGAttributeVocabulary(portrait);
  return ids(
    filterSVG(portrait, resolveAttributes(vocabulary, attributes).selection),
  );
};

describe("portrait layer naming", () => {
  it.each([
    ["body", "body", [], false],
    ["hat.on", "", [{ group: "hat", options: ["on"] }], false],
    [
      "hair-top:hat.off",
      "hair-top",
      [{ group: "hat", options: ["off"] }],
      false,
    ],
    [
      "face.neutral:default",
      "",
      [{ group: "face", options: ["neutral"] }],
      true,
    ],
    [
      "pupils:eyes.open:look.left",
      "pupils",
      [
        { group: "eyes", options: ["open"] },
        { group: "look", options: ["left"] },
      ],
      false,
    ],
    [
      "hand-right:arms.down.phone-left",
      "hand-right",
      [{ group: "arms", options: ["down", "phone-left"] }],
      false,
    ],
    ["_face.happy_37", "", [{ group: "face", options: ["happy"] }], false],
    [
      "whites~eyes.open~default",
      "whites",
      [{ group: "eyes", options: ["open"] }],
      true,
    ],
  ])("parses %s", (name, label, conditions, resting) => {
    expect(parseLayerName(name as string)).toEqual({
      label,
      conditions,
      default: resting,
      diagnostics: [],
    });
  });

  it.each([
    "face..happy",
    "hair top:hat.off",
    "face.happy:default:eyes.open",
    "face.happy~look.up:default",
    "_face.happy",
    "body:happy",
    "face.happy:",
  ])("diagnoses malformed name %s", (name) => {
    expect(parseLayerName(name).diagnostics.length).toBeGreaterThan(0);
  });

  it("uses data-name ahead of id and normalizes Affinity and Inkscape labels", () => {
    const svg = `<svg><g id="face.happy2" data-name="face.neutral:default"/><g id="mangled" serif:id="eyes.open:default"/><g id="mangled2" inkscape:label="look.camera:default"/></svg>`;
    const normalized = normalizeSVGAttributeNames(svg);
    expect(normalizeSVGAttributeNames(normalized)).toBe(normalized);
    const vocabulary = buildSVGAttributeVocabulary(normalized);
    expect(vocabulary.groups["face"]?.options).toEqual(["neutral"]);
    expect(vocabulary.groups["eyes"]?.options).toEqual(["open"]);
    expect(vocabulary.groups["look"]?.options).toEqual(["camera"]);
    expect(normalized).toContain('id="mangled"');
  });
});

describe("portrait attributes", () => {
  it("shows plain layers as a positive control and switches off by default", () => {
    expect(render([])).toContain("body");
    expect(render([])).toContain("hair-top");
    expect(render([])).not.toContain("hat");
    expect(render(["hat"])).toEqual(
      expect.arrayContaining(["hat", "hair-flat"]),
    );
    expect(render(["hat"])).not.toContain("hair-top");
  });

  it("look.left keeps default-open whites and selects the left pupils", () => {
    expect(render(["look.left"])).toEqual(
      expect.arrayContaining(["neutral-left", "neutral-whites"]),
    );
    expect(render(["look.left"])).not.toContain("neutral-camera");
  });

  it("eyes.closed hides all pupils and whites", () => {
    const drawn = render(["eyes.closed"]);
    expect(drawn).toContain("neutral-lids");
    expect(drawn).not.toContain("neutral-left");
    expect(drawn).not.toContain("neutral-camera");
    expect(drawn).not.toContain("neutral-whites");
  });

  it("inherits parent visibility and each face's own nearest defaults", () => {
    const drawn = render(["happy"]);
    expect(drawn).toEqual(
      expect.arrayContaining([
        "face-happy",
        "happy-up",
        "happy-whites",
        "brows-happy",
      ]),
    );
    expect(drawn).not.toContain("face-neutral");
    expect(drawn).not.toContain("neutral-camera");
  });

  it("overrides eyebrows without losing the named look's face", () => {
    const vocabulary = buildSVGAttributeVocabulary(portrait);
    const base = resolveAttributes(vocabulary, ["happy"]);
    const adjusted = resolveAttributes(
      vocabulary,
      ["eyebrows.angry"],
      base.selection,
    );
    expect(adjusted.selection).toMatchObject({
      face: "happy",
      eyebrows: "angry",
    });
    expect(ids(filterSVG(portrait, adjusted.selection))).toEqual(
      expect.arrayContaining(["face-happy", "brows-angry"]),
    );
  });

  it("sets the last option per group and turns a named look's switch off", () => {
    const vocabulary = buildSVGAttributeVocabulary(portrait);
    expect(
      resolveAttributes(vocabulary, ["happy", "neutral", "hat", "hat.off"])
        .selection,
    ).toEqual({ face: "neutral", eyebrows: "neutral", hat: "off" });
  });

  it("offers both switch states even when only its on layer is authored", () => {
    const vocabulary = buildAttributeVocabulary([
      { key: "hat", name: "hat.on" },
    ]);
    expect(vocabulary.groups["hat"]?.options).toEqual(["on", "off"]);
    expect(resolveAttributes(vocabulary, ["hat.off"]).selection).toEqual({
      hat: "off",
    });
  });

  it("ignores globally absent options while preserving the other choices", () => {
    const vocabulary = buildSVGAttributeVocabulary(portrait);
    const result = resolveAttributes(vocabulary, [
      "happy",
      "face.sad",
      "gloves",
    ]);
    expect(result.selection).toEqual({ face: "happy", eyebrows: "happy" });
    expect(
      result.diagnostics.filter((d) => d.code === "unknown-attribute"),
    ).toHaveLength(2);
  });

  it("hides unmatched alternatives without requiring every folder to implement an option", () => {
    const vocabulary = buildSVGAttributeVocabulary(portrait);
    const resolved = resolveAttributes(vocabulary, ["happy", "look.left"]);
    const result = evaluateAttributeVisibility(vocabulary, resolved.selection);
    expect(ids(filterSVG(portrait, resolved.selection))).not.toContain(
      "happy-up",
    );
    expect(result.diagnostics).toEqual([]);
  });


  it("accepts a phone-left pose outside the sleeve folder and hides phone-only cheek detail", () => {
    const vocabulary = buildAttributeVocabulary([
      { key: "sleeve", name: "sweater-left-sleeve" },
      { key: "down-sleeve", parent: "sleeve", name: "sleeve:arms.down.phone-right:default" },
      { key: "phone-arm", name: "arm:arms.phone-left" },
      { key: "script-arm", name: "arm:arms.script" },
      { key: "head", name: "head" },
      { key: "face", parent: "head", name: "face" },
      { key: "cheek", parent: "head", name: "cheek:arms.phone" },
    ]);
    for (const option of ["phone-left", "script"]) {
      const resolved = resolveAttributes(vocabulary, ["arms." + option]);
      expect(resolved.diagnostics).toEqual([]);
      const result = evaluateAttributeVisibility(vocabulary, resolved.selection);
      expect(result.diagnostics).toEqual([]);
      expect(result.visible["down-sleeve"]).toBe(false);
      expect(result.visible["phone-arm"]).toBe(option === "phone-left");
      expect(result.visible["script-arm"]).toBe(option === "script");
      expect(result.visible["cheek"]).toBe(option === "phone-left");
      expect(result.visible["face"]).toBe(true);
    }
    expect(resolveAttributes(vocabulary, ["arms.missing"]).diagnostics).toContainEqual(
      expect.objectContaining({ code: "unknown-attribute" }),
    );
  });

  it("diagnoses unrelated bare-option ambiguity but accepts face and eyebrows", () => {
    const vocabulary = buildAttributeVocabulary([
      { key: "look", name: "look.down" },
      { key: "head", name: "head.down" },
      { key: "face", name: "face.happy" },
      { key: "brows", name: "eyebrows.happy" },
    ]);
    expect(resolveAttributes(vocabulary, ["down"]).diagnostics).toContainEqual(
      expect.objectContaining({ code: "ambiguous-attribute" }),
    );
    expect(resolveAttributes(vocabulary, ["happy"]).diagnostics).toEqual([]);
  });

  it("combines group conditions with AND, options with OR, and matches hyphen prefixes", () => {
    const vocabulary = buildAttributeVocabulary([
      { key: "hand", name: "hand-right:arms.down.phone-left" },
      { key: "phone", name: "arm:arms.phone" },
      { key: "sleeve", name: "sleeve:arms.down.phone-left:jacket.on" },
      { key: "glove", name: "glove:arms.down.phone-left:gloves.on" },
    ]);
    const visible = (attrs: string[]) =>
      evaluateAttributeVisibility(
        vocabulary,
        resolveAttributes(vocabulary, attrs).selection,
      ).visible;
    expect(visible(["arms.phone-left"])).toMatchObject({
      hand: true,
      phone: true,
      sleeve: false,
      glove: false,
    });
    expect(visible(["arms.down", "gloves"])).toMatchObject({
      hand: true,
      phone: false,
      sleeve: false,
      glove: true,
    });
    expect(visible(["arms.phone-left", "jacket"])["sleeve"]).toBe(true);
  });

  it("does not warn when an opposite-only switch folder intentionally hides", () => {
    const vocabulary = buildAttributeVocabulary([
      { key: "hair", name: "hair" },
      { key: "top", name: "hair-top:hat.off", parent: "hair" },
      { key: "hat", name: "hat.on" },
    ]);
    const result = evaluateAttributeVisibility(vocabulary, { hat: "on" });
    expect(result.visible).toEqual({ hair: true, top: false, hat: true });
    expect(result.diagnostics).toEqual([]);
  });

  it("shows no option for a named group without a default", () => {
    const vocabulary = buildAttributeVocabulary([
      { key: "up", name: "look.up" },
      { key: "down", name: "look.down" },
    ]);
    expect(evaluateAttributeVisibility(vocabulary, {}).visible).toEqual({
      up: false,
      down: false,
    });
  });

  it("inherits the nearest available ancestor default through plain folders", () => {
    const vocabulary = buildAttributeVocabulary([
      { key: "default", name: "look.camera:default" },
      { key: "face", name: "face.neutral:default" },
      { key: "nested", name: "details", parent: "face" },
      { key: "pupils", name: "look.camera", parent: "nested" },
    ]);
    expect(evaluateAttributeVisibility(vocabulary, {}).visible["pupils"]).toBe(
      true,
    );
  });

  it("reports conflicting defaults and preserves all marked resting layers", () => {
    const vocabulary = buildAttributeVocabulary([
      { key: "up", name: "look.up:default" },
      { key: "down", name: "look.down:default" },
    ]);
    expect(vocabulary.diagnostics).toContainEqual(
      expect.objectContaining({ code: "conflicting-defaults", group: "look" }),
    );
    expect(evaluateAttributeVisibility(vocabulary, {}).visible).toEqual({
      up: true,
      down: true,
    });
    expect(
      evaluateAttributeVisibility(vocabulary, { look: "up" }).visible,
    ).toEqual({ up: true, down: false });
  });

  it("uses the first OR option as the resting option without activating alternatives", () => {
    const vocabulary = buildAttributeVocabulary([
      { key: "hand", name: "hand:arms.down.phone-left:default" },
      { key: "phone", name: "phone:arms.phone-left" },
    ]);
    expect(evaluateAttributeVisibility(vocabulary, {}).visible).toEqual({
      hand: true,
      phone: false,
    });
    expect(
      evaluateAttributeVisibility(vocabulary, { arms: "phone-left" }).visible,
    ).toEqual({ hand: true, phone: true });
    expect(
      vocabulary.diagnostics.some((d) => d.code === "conflicting-defaults"),
    ).toBe(false);
  });

  it("warns when look is selected while the active face's eyes rest closed", () => {
    const vocabulary = buildAttributeVocabulary([
      { key: "face", name: "face.panicking:default" },
      { key: "closed", name: "eyes.closed:default", parent: "face" },
      { key: "pupils", name: "pupils:eyes.open:look.down", parent: "face" },
    ]);
    expect(
      evaluateAttributeVisibility(vocabulary, { look: "down" }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({
        code: "look-with-closed-eyes",
        folder: "face.panicking:default",
      }),
    );
    expect(
      evaluateAttributeVisibility(vocabulary, {
        look: "down",
        eyes: "open",
      }).diagnostics.some((d) => d.code === "look-with-closed-eyes"),
    ).toBe(false);
  });

  it("round-trips the vocabulary through JSON without retaining SVG geometry", () => {
    const vocabulary = buildSVGAttributeVocabulary(portrait);
    const serialized = JSON.stringify(vocabulary);
    expect(
      evaluateAttributeVisibility(JSON.parse(serialized), { face: "happy" }),
    ).toEqual(evaluateAttributeVisibility(vocabulary, { face: "happy" }));
    expect(serialized).not.toContain("<svg");
    expect(vocabulary.groups["hat"]?.switch).toBe(true);
    expect(vocabulary.groups["eyes"]?.switch).toBe(false);
  });

  it("treats object prototype property names as ordinary groups after transport", () => {
    const vocabulary = JSON.parse(
      JSON.stringify(
        buildAttributeVocabulary([
          { key: "folder", name: "details" },
          { key: "plain", name: "constructor.neutral", parent: "folder" },
          { key: "root", name: "constructor.neutral:default" },
        ]),
      ),
    );
    expect(evaluateAttributeVisibility(vocabulary, {}).visible["plain"]).toBe(
      true,
    );
    expect(
      resolveAttributes(vocabulary, ["toString"]).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: "unknown-attribute" }));
  });

  it("does not interpret SVG resources as portrait layers", () => {
    const svg = `<svg><defs><clipPath id="face.happy"><path d="M0 0"/></clipPath></defs><g id="body" clip-path="url(#face.happy)"/></svg>`;
    expect(buildSVGAttributeVocabulary(svg).groups).toEqual({});
    expect(filterSVG(svg, {})).toContain("clipPath");
  });

  it("reads encoded compiler SVG sources and preserves their URL source form", () => {
    const source = `data:image/svg+xml,${encodeURIComponent(portrait)}`;
    expect(buildSVGAttributeVocabulary(source)).toEqual(
      buildSVGAttributeVocabulary(portrait),
    );
    const filtered = filterSVG(source, { face: "happy" });
    expect(filtered).toMatch(/^data:image\/svg\+xml,/);
    expect(ids(decodeSVGSource(filtered))).toContain("face-happy");
    expect(ids(decodeSVGSource(filtered))).not.toContain("face-neutral");
    const base64 = `data:image/svg+xml;base64,${btoa(portrait)}`;
    expect(buildSVGAttributeVocabulary(base64)).toEqual(
      buildSVGAttributeVocabulary(portrait),
    );
    expect(
      decodeSVGSource(
        "data:image/svg+xml,<svg width='100%'><path fill='%23fff'/></svg>",
      ),
    ).toContain("fill='#fff'");
  });

  it("ignores globally absent options even at the direct visibility boundary", () => {
    const vocabulary = buildSVGAttributeVocabulary(portrait);
    expect(
      evaluateAttributeVisibility(vocabulary, { face: "absent" }).visible,
    ).toEqual(evaluateAttributeVisibility(vocabulary, {}).visible);
    expect(
      evaluateAttributeVisibility(vocabulary, { face: "absent" }).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: "unknown-attribute" }));
  });

  it("corroborates rare spellings across character files, once per layer", () => {
    const first = buildAttributeVocabulary([
      { key: "1", name: "eyebrows.angry:eyebrows.angry" },
      { key: "2", name: "eybrows.angry" },
    ]);
    const second = buildAttributeVocabulary([
      { key: "1", name: "eyebrows.angry" },
    ]);
    expect(diagnoseRareAttributeOptions([first, second])).toEqual([
      expect.objectContaining({ code: "rare-attribute-option", group: "eybrows", layer: "eybrows.angry" }),
    ]);
    expect(diagnoseRareAttributeOptions([first])).toEqual([]);
  });

  it("invalidates the cache signature on path, timestamp, or size changes", () => {
    const key = attributeVocabularyCacheKey("portrait.svg", 1, 20);
    expect(key).toBe(attributeVocabularyCacheKey("portrait.svg", 1, 20));
    expect(key).not.toBe(attributeVocabularyCacheKey("other.svg", 1, 20));
    expect(key).not.toBe(attributeVocabularyCacheKey("portrait.svg", 2, 20));
    expect(key).not.toBe(attributeVocabularyCacheKey("portrait.svg", 1, 21));
  });
});
