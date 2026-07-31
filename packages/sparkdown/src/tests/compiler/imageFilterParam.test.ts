// The canonical filter serialization for on-demand filtered SVGs (#299) must
// reproduce filterMatchesName's behavior EXACTLY after a round trip — its
// semantics defeat set intuition (a falsy include DISABLES include-removal,
// while an EMPTY includes array removes everything), so these tests pin the
// truth table rather than trusting normalization instincts.

import { describe, expect, it } from "vitest";
import { filterMatchesName } from "../../compiler/utils/filterMatchesName";
import {
  buildFilteredSrc,
  parseImageFilterParam,
  serializeImageFilterParam,
  type ImageFilter,
} from "../../filters/filteredSvg";

// Node ids in the style filterSVG sees: `filter` marks filterable nodes,
// `default` marks always-kept nodes, other words are the filter tags.
const NAMES = [
  "filter coat",
  "filter gloves",
  "filter hat",
  "filter coat gloves",
  "filter default coat",
  "filter default",
  "filter plain",
  "unfilterable coat",
];

const FILTERS: Record<string, ImageFilter> = {
  excludesOnly: { includes: [""], excludes: ["coat"] },
  excludesOnlyNoIncludeEntry: { includes: [], excludes: ["coat"] },
  includesDisabledEmptyString: { includes: [""], excludes: [] },
  removeEverything: { includes: [], excludes: [] },
  includesSome: { includes: ["coat", "gloves"], excludes: [] },
  includesAndExcludes: { includes: ["coat"], excludes: ["hat"] },
  allGroup: { includes: [{ all: ["coat", "gloves"] }], excludes: [] },
  allGroupExclude: { includes: [""], excludes: [{ all: ["coat", "gloves"] }] },
  falsyAmongIncludes: { includes: ["coat", ""], excludes: ["hat"] },
  falsyAmongExcludes: { includes: ["coat"], excludes: [null, "hat"] },
};

const truthRow = (filter: ImageFilter) =>
  NAMES.map((name) => filterMatchesName(name, filter));

describe("serializeImageFilterParam round trip", () => {
  for (const [label, filter] of Object.entries(FILTERS)) {
    it(`preserves filterMatchesName behavior: ${label}`, () => {
      const param = serializeImageFilterParam(filter);
      if (param === undefined) {
        // Only allowed when the filter genuinely removes nothing.
        expect(truthRow(filter)).toEqual(NAMES.map(() => false));
        return;
      }
      const parsed = parseImageFilterParam(param);
      expect(parsed).toBeDefined();
      expect(truthRow(parsed!)).toEqual(truthRow(filter));
    });
  }

  it("is order- and duplicate-insensitive", () => {
    const a = serializeImageFilterParam({
      includes: ["coat", "gloves", "coat"],
      excludes: ["hat", { all: ["x", "y"] }],
    });
    const b = serializeImageFilterParam({
      includes: ["gloves", "coat"],
      excludes: [{ all: ["y", "x", "y"] }, "hat", "hat"],
    });
    expect(a).toBeDefined();
    expect(a).toEqual(b);
  });

  it("distinguishes disabled includes ([\"\"]) from remove-everything ([])", () => {
    const disabled = serializeImageFilterParam({
      includes: [""],
      excludes: ["hat"],
    });
    const removeEverything = serializeImageFilterParam({
      includes: [],
      excludes: ["hat"],
    });
    expect(disabled).toBeDefined();
    expect(removeEverything).toBeDefined();
    expect(disabled).not.toEqual(removeEverything);
  });

  it("treats a fully-disabled filter as a no-op (undefined)", () => {
    expect(
      serializeImageFilterParam({ includes: [""], excludes: [] }),
    ).toBeUndefined();
    // A falsy entry disables include-removal even when real tags are present
    // alongside it, so with no excludes this is ALSO a no-op.
    expect(
      serializeImageFilterParam({ includes: [null, "coat"], excludes: [] }),
    ).toBeUndefined();
  });

  it("rejects garbage params", () => {
    expect(parseImageFilterParam("not json")).toBeUndefined();
    expect(parseImageFilterParam('{"i":5,"e":[]}')).toBeUndefined();
    expect(parseImageFilterParam('{"i":[],"e":"x"}')).toBeUndefined();
  });
});

describe("buildFilteredSrc", () => {
  const filter: ImageFilter = { includes: [""], excludes: ["hat"] };

  it("joins with & when the src already carries a query", () => {
    const src = buildFilteredSrc(
      { src: "/file:/local/assets/x.svg?v=123", ext: "svg" },
      filter,
    );
    expect(src).toMatch(/^\/file:\/local\/assets\/x\.svg\?v=123&filters=/);
  });

  it("joins with ? when the src has no query", () => {
    const src = buildFilteredSrc(
      { src: "/file:/local/assets/x.svg", ext: "svg" },
      filter,
    );
    expect(src).toMatch(/^\/file:\/local\/assets\/x\.svg\?filters=/);
  });

  it("falls back to the plain src for non-/file:/ roots (remote assets)", () => {
    expect(
      buildFilteredSrc({ src: "https://cdn.example/x.svg", ext: "svg" }, filter),
    ).toEqual("https://cdn.example/x.svg");
  });

  it("falls back to the plain src for raster roots", () => {
    expect(
      buildFilteredSrc(
        { src: "/file:/local/assets/x.webp?v=1", ext: "webp" },
        filter,
      ),
    ).toEqual("/file:/local/assets/x.webp?v=1");
  });

  it("falls back to the plain src for a no-op filter", () => {
    expect(
      buildFilteredSrc(
        { src: "/file:/local/assets/x.svg?v=1", ext: "svg" },
        { includes: [""], excludes: [] },
      ),
    ).toEqual("/file:/local/assets/x.svg?v=1");
  });

  it("returns undefined only when there is no src at all", () => {
    expect(buildFilteredSrc({ ext: "svg" }, filter)).toBeUndefined();
  });

  it("its param survives URLSearchParams and re-parses to the same behavior", () => {
    const src = buildFilteredSrc(
      { src: "/file:/local/assets/x.svg?v=123", ext: "svg" },
      { includes: ["coat", "gloves"], excludes: [{ all: ["b", "a"] }] },
    )!;
    const params = new URL(src, "http://localhost").searchParams;
    expect(params.get("v")).toEqual("123");
    const parsed = parseImageFilterParam(params.get("filters")!);
    expect(parsed).toBeDefined();
    expect(NAMES.map((n) => filterMatchesName(n, parsed!))).toEqual(
      NAMES.map((n) =>
        filterMatchesName(n, {
          includes: ["coat", "gloves"],
          excludes: [{ all: ["b", "a"] }],
        }),
      ),
    );
  });
});
