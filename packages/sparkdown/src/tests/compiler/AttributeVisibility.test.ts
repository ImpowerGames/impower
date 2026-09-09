import { describe, expect, it } from "vitest";
import { filterSVG } from "../../compiler/utils/filterSVG";

// This file intentionally imports only the existing entry point: its red run
// on the pre-feature source must fail an assertion, never a missing import.
const svg = `<svg><g id="body"/><g id="left" data-name="pupils:eyes.open:look.left"/><g id="camera" data-name="pupils:eyes.open:look.camera:default"/><g id="whites" data-name="whites:eyes.open:default"/></svg>`;

describe("filterSVG attribute visibility regression", () => {
  it("keeps the unconditional body (positive control)", () => {
    expect(filterSVG(svg, { look: "left" } as never)).toContain("id='body'");
  });

  it("selects left pupils with default-open eyes and hides camera pupils", () => {
    const filtered = filterSVG(svg, { look: "left" } as never);
    expect(filtered).toContain("id='left'");
    expect(filtered).toContain("id='whites'");
    expect(filtered).not.toContain("id='camera'");
  });
});
