import { describe, expect, it } from "vitest";
import {
  collapsibleSize,
  collapsibleSizeAfterKey,
  type CollapsibleLimits,
} from "./collapsibleSize";

const limits: CollapsibleLimits = { min: 180, max: 420, collapsed: 76 };
const keys = { grow: "ArrowRight", shrink: "ArrowLeft" };

describe("collapsibleSize", () => {
  it("snaps a size below the minimum to the collapsed size", () => {
    expect(collapsibleSize(150, limits)).toBe(76);
    expect(collapsibleSize(179, limits)).toBe(76);
    expect(collapsibleSize(10, limits)).toBe(76);
  });

  it("clamps a size past the maximum", () => {
    expect(collapsibleSize(500, limits)).toBe(420);
  });

  it("keeps a size inside the range", () => {
    expect(collapsibleSize(180, limits)).toBe(180);
    expect(collapsibleSize(300.4, limits)).toBe(300);
  });

  it("collapses when the room left is below the minimum", () => {
    expect(collapsibleSize(300, { ...limits, max: 150 })).toBe(76);
  });

  it("holds a fixed size when the minimum and maximum agree", () => {
    const fixed = { min: 190, max: 190, collapsed: 76 };
    expect(collapsibleSize(260, fixed)).toBe(190);
    expect(collapsibleSize(189, fixed)).toBe(76);
  });
});

describe("collapsibleSizeAfterKey", () => {
  it("steps by 16px, or 64px with Shift", () => {
    expect(collapsibleSizeAfterKey("ArrowRight", false, 232, limits, keys)).toBe(248);
    expect(collapsibleSizeAfterKey("ArrowLeft", true, 300, limits, keys)).toBe(236);
  });

  it("goes from the collapsed size to the minimum, and back below it", () => {
    expect(collapsibleSizeAfterKey("ArrowRight", false, 76, limits, keys)).toBe(180);
    expect(collapsibleSizeAfterKey("ArrowLeft", false, 180, limits, keys)).toBe(76);
  });

  it("collapses on Home and grows fully on End", () => {
    expect(collapsibleSizeAfterKey("Home", false, 300, limits, keys)).toBe(76);
    expect(collapsibleSizeAfterKey("End", false, 300, limits, keys)).toBe(420);
  });

  it("reads the grow and shrink keys it is given", () => {
    const vertical = { grow: "ArrowDown", shrink: "ArrowUp" };
    expect(collapsibleSizeAfterKey("ArrowDown", false, 232, limits, vertical)).toBe(248);
    expect(collapsibleSizeAfterKey("ArrowRight", false, 232, limits, vertical)).toBeNull();
  });

  it("ignores other keys", () => {
    expect(collapsibleSizeAfterKey("a", false, 300, limits, keys)).toBeNull();
  });
});
