// What survives a service-worker version transition.
//
// The activate sweep drops caches belonging to superseded sw versions. The
// generated-thumbnail bucket must survive it: thumbnails are keyed by file
// signature, so they stay valid across a deploy, and wiping them would silently
// make every asset row and asset preview regenerate on the next launch.
//
// This is a PERFORMANCE invariant, not a correctness one — nothing breaks if it
// regresses, which is why it needs a test rather than a code review.

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
    // The whole point of a fixed, non-version-scoped bucket name.
    const existing = ["cache-v1", THUMBS];
    expect(getStaleCacheNames(existing, ["cache-v2", THUMBS])).toEqual([
      "cache-v1",
    ]);
  });

  it("preserves the thumbnail bucket even on a first activation", () => {
    // The opfs-workspace worker can populate thumbnails at import time, before
    // any sw version has activated — so they can predate the current cache.
    const existing = [THUMBS];
    expect(getStaleCacheNames(existing, ["cache-v1", THUMBS])).toEqual([]);
  });

  it("keeps the currently-active cache", () => {
    const existing = ["cache-v2"];
    expect(getStaleCacheNames(existing, ["cache-v2", THUMBS])).toEqual([]);
  });

  it("drops unrelated leftovers", () => {
    // An abandoned bucket from an older scheme should not linger forever.
    const existing = ["cache-v2", THUMBS, "old-experiment"];
    expect(getStaleCacheNames(existing, ["cache-v2", THUMBS])).toEqual([
      "old-experiment",
    ]);
  });

  it("does nothing when there is nothing to sweep", () => {
    expect(getStaleCacheNames([], ["cache-v1", THUMBS])).toEqual([]);
  });
});
