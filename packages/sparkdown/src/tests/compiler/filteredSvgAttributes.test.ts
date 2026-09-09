import { describe, expect, it } from "vitest";
import {
  buildFilteredSrc,
  parseImageFilterParam,
  serializeImageFilterParam,
} from "../../filters/filteredSvg";

describe("attribute selection route", () => {
  it("serializes selections canonically without changing a group's choice", () => {
    const first = serializeImageFilterParam({ look: "left", eyes: "open" });
    const second = serializeImageFilterParam({ eyes: "open", look: "left" });
    expect(first).toBe(second);
    expect(parseImageFilterParam(first!)).toEqual({ eyes: "open", look: "left" });
  });

  it("keeps the empty selection because it still applies the art's defaults", () => {
    const param = serializeImageFilterParam({});
    expect(param).toBe("{}");
    expect(parseImageFilterParam(param!)).toEqual({});
    const url = buildFilteredSrc({ src: "/file:/local/assets/mia.svg?v=1" }, {})!;
    expect(new URL(url, "https://example.test").searchParams.get("attributes")).toBe("{}");
  });

  it("rejects arrays, legacy filters and invalid selection values", () => {
    for (const input of ["null", "[]", '{"i":[],"e":[]}', '{"eyes":["open"]}', '{"eyes":"open.closed"}', '{"bad name":"on"}']) {
      expect(parseImageFilterParam(input), input).toBeUndefined();
    }
  });

  it("round trips group names that are also Object properties safely", () => {
    const selection = JSON.parse('{"constructor":"on","__proto__":"off"}');
    const param = serializeImageFilterParam(selection);
    // Invalid grammar is rejected; prototype properties must never leak into a selection.
    expect(param).toBeUndefined();
    expect({}.hasOwnProperty("polluted")).toBe(false);
  });

  it("preserves the plain source for raster and remote images", () => {
    for (const src of ["https://[invalid/mia.svg", "https://example.test/mia.svg", "/file:/local/assets/mia.png?v=1"]) {
      expect(buildFilteredSrc({ src }, { hat: "on" })).toBe(src);
    }
  });

  it("replaces an existing selection parameter and preserves other URL parts", () => {
    const src = "/file:/local/assets/mia.svg?v=2&attributes=old#portrait";
    const url = buildFilteredSrc({ src }, { hat: "on" })!;
    const parsed = new URL(url, "https://example.test");
    expect(parsed.searchParams.getAll("attributes")).toEqual(['{"hat":"on"}']);
    expect(parsed.searchParams.get("v")).toBe("2");
    expect(parsed.hash).toBe("#portrait");
  });
});
