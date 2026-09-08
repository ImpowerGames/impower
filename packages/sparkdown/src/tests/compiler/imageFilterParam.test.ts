// The canonical on-demand attribute selection must preserve layer visibility
// through both a JSON and a URL round trip, including the empty resting look.
import { describe, expect, it } from "vitest";
import {
  buildAttributeVocabulary,
  evaluateAttributeVisibility,
  type AttributeSelection,
} from "../../attributes";
import {
  buildFilteredSrc,
  parseImageFilterParam,
  serializeImageFilterParam,
} from "../../filters/filteredSvg";

const NAMES = [
  "coat.on",
  "gloves.on",
  "hat.on",
  "sleeve:coat.on:gloves.on",
  "hair:hat.off",
  "body",
  "face.neutral:default",
  "face.happy",
  "hand:arms.down.phone-left:default",
  "phone:arms.phone",
  "phone-left:arms.phone-left",
];
const vocabulary = buildAttributeVocabulary(
  NAMES.map((name) => ({ key: name, name })),
);
const SELECTIONS: Record<string, AttributeSelection> = {
  resting: {},
  coatOff: { coat: "off" },
  coatOn: { coat: "on" },
  glovesOn: { gloves: "on" },
  bothOn: { coat: "on", gloves: "on" },
  coatOnGlovesOff: { coat: "on", gloves: "off" },
  hatOn: { hat: "on" },
  happy: { face: "happy" },
  phoneLeft: { arms: "phone-left" },
  combined: { face: "happy", arms: "phone-left", hat: "on" },
};
const truthRow = (selection: AttributeSelection) => {
  const { visible } = evaluateAttributeVisibility(vocabulary, selection);
  return NAMES.map((name) => visible[name]);
};

describe("serializeImageFilterParam round trip", () => {
  for (const [label, selection] of Object.entries(SELECTIONS)) {
    it(`preserves attribute visibility: ${label}`, () => {
      const param = serializeImageFilterParam(selection);
      expect(param).toBeDefined();
      const parsed = parseImageFilterParam(param!);
      expect(parsed).toEqual(selection);
      expect(truthRow(parsed!)).toEqual(truthRow(selection));
    });
  }

  it("canonicalizes group-key order without changing a choice", () => {
    const first = serializeImageFilterParam({
      coat: "on",
      gloves: "off",
      hat: "on",
    });
    const second = serializeImageFilterParam({
      hat: "on",
      gloves: "off",
      coat: "on",
    });
    expect(first).toBe('{"coat":"on","gloves":"off","hat":"on"}');
    expect(first).toBe(second);
  });

  it("distinguishes on and off selections", () => {
    const on = serializeImageFilterParam({ hat: "on" });
    const off = serializeImageFilterParam({ hat: "off" });
    expect(on).toBeDefined();
    expect(off).toBeDefined();
    expect(on).not.toBe(off);
    expect(truthRow(parseImageFilterParam(on!)!)).not.toEqual(
      truthRow(parseImageFilterParam(off!)!),
    );
  });

  it("retains an empty selection because it applies defaults and switch-off", () => {
    expect(serializeImageFilterParam({})).toBe("{}");
    expect(truthRow(parseImageFilterParam("{}")!)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      false,
      true,
      false,
      false,
    ]);
  });

  it("rejects garbage and the removed include/exclude wire shapes", () => {
    for (const param of [
      "not json",
      "null",
      "[]",
      '{"i":5,"e":[]}',
      '{"i":[],"e":"x"}',
      '{"hat":5}',
      '{"hat":"on.off"}',
      '{"hat":""}',
    ]) {
      expect(parseImageFilterParam(param)).toBeUndefined();
    }
  });
});

describe("buildFilteredSrc", () => {
  const selection = { hat: "off" };

  it("joins with & when the src already carries a query", () => {
    expect(
      buildFilteredSrc(
        { src: "/file:/local/assets/x.svg?v=123", ext: "svg" },
        selection,
      ),
    ).toMatch(/^\/file:\/local\/assets\/x\.svg\?v=123&attributes=/);
  });

  it("joins with ? when the src has no query", () => {
    expect(
      buildFilteredSrc(
        { src: "/file:/local/assets/x.svg", ext: "svg" },
        selection,
      ),
    ).toMatch(/^\/file:\/local\/assets\/x\.svg\?attributes=/);
  });

  it("falls back to the plain src for non-/file:/ roots (remote assets)", () => {
    expect(
      buildFilteredSrc(
        { src: "https://cdn.example/x.svg", ext: "svg" },
        selection,
      ),
    ).toEqual("https://cdn.example/x.svg");
  });

  it("falls back to the plain src for raster roots", () => {
    expect(
      buildFilteredSrc(
        { src: "/file:/local/assets/x.webp?v=1", ext: "webp" },
        selection,
      ),
    ).toEqual("/file:/local/assets/x.webp?v=1");
  });

  it("requests an on-demand variant for an empty selection", () => {
    expect(
      buildFilteredSrc(
        { src: "/file:/local/assets/x.svg?v=1", ext: "svg" },
        {},
      ),
    ).toEqual("/file:/local/assets/x.svg?v=1&attributes=%7B%7D");
  });

  it("returns undefined only when there is no src at all", () => {
    expect(buildFilteredSrc({ ext: "svg" }, selection)).toBeUndefined();
  });

  it("its param survives URLSearchParams and re-parses to the same behavior", () => {
    const selected = { coat: "on", gloves: "on", arms: "phone-left" };
    const src = buildFilteredSrc(
      { src: "/file:/local/assets/x.svg?v=123", ext: "svg" },
      selected,
    )!;
    const params = new URL(src, "http://localhost").searchParams;
    expect(params.get("v")).toEqual("123");
    const parsed = parseImageFilterParam(params.get("attributes")!);
    expect(parsed).toEqual(selected);
    expect(truthRow(parsed!)).toEqual(truthRow(selected));
  });
});
