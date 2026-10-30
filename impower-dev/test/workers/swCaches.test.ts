import { describe, expect, it } from "vitest";
import { getStaleCacheNames } from "../../src/workers/swCaches";

const THUMBS = "asset-thumbnails";

describe("service worker cache sweep", () => {
  it("drops caches from superseded versions", () => {
    const existing = ["cache-v1", "cache-v2", "cache-v3"];
    expect(getStaleCacheNames(existing, ["cache-v3", THUMBS])).toEqual([
      "cache-v1",
      "cache-v2",
    ]);
  });

  it("preserves generated thumbnails across a version bump", () => {
    const existing = ["cache-v1", THUMBS];
    expect(getStaleCacheNames(existing, ["cache-v2", THUMBS])).toEqual([
      "cache-v1",
    ]);
  });

  it("preserves the thumbnail bucket even on a first activation", () => {
    const existing = [THUMBS];
    expect(getStaleCacheNames(existing, ["cache-v1", THUMBS])).toEqual([]);
  });

  it("keeps the currently-active cache", () => {
    const existing = ["cache-v2"];
    expect(getStaleCacheNames(existing, ["cache-v2", THUMBS])).toEqual([]);
  });

  it("drops unrelated leftovers", () => {
    const existing = ["cache-v2", THUMBS, "old-experiment"];
    expect(getStaleCacheNames(existing, ["cache-v2", THUMBS])).toEqual([
      "old-experiment",
    ]);
  });

  it("does nothing when there is nothing to sweep", () => {
    expect(getStaleCacheNames([], ["cache-v1", THUMBS])).toEqual([]);
  });
});
