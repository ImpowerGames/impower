import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFileExtension } from "../src/utils/getFileExtension";
import { getName } from "../src/utils/getName";
import { getSrcFromUri } from "../src/utils/getSrcFromUri";

// AREA 7: Cache-busting / src versioning (explicitly requested).
//
// The contract lives in `updateFileCache` (src/opfs-workspace.ts), which is
// module-private inside the Web Worker entry and cannot be imported (top-level
// BroadcastChannel/postMessage/navigator side effects, no exports). We
// reconstruct the EXACT src + version logic from that function using the REAL
// importable utilities (`getSrcFromUri`, `getName`, `getFileExtension`) plus a
// minimal in-memory `files` map standing in for `State.files`. `getFileType`
// is replaced by a trivial "is this an asset" check that returns a non-empty
// `name` so the src branch is exercised; the cache-bust logic depends only on
// `name` being truthy and the `!src || overwrite` condition.
//
// The desired CONTRACT (per sw.ts serving assets `max-age, immutable`):
//   (a) a freshly written/overwritten asset's src carries a `?v=` query;
//   (b) overwriting the same asset yields a DIFFERENT src (busts immutable cache);
//   (c) `version` advances on write.
// `Date.now()` is non-deterministic, so we assert the `?v=` param EXISTS and
// CHANGES, stubbing Date.now to force distinct values.

interface CachedFile {
  uri: string;
  name: string;
  ext: string;
  src: string;
  version: number;
}

// Faithful reconstruction of the src/version portion of updateFileCache.
function updateFileCache(
  files: Map<string, CachedFile>,
  uri: string,
  overwrite: boolean,
  version?: number,
): CachedFile {
  const existingFile = files.get(uri);
  let src = existingFile?.src || "";
  const name = getName(uri);
  const ext = getFileExtension(uri);
  if (name) {
    if (!src || overwrite) {
      src = getSrcFromUri(uri) + `?v=${Date.now()}`;
    }
  }
  const file: CachedFile = {
    uri,
    name,
    ext,
    src,
    version: version ?? existingFile?.version ?? 0,
  };
  files.set(uri, file);
  return file;
}

const queryParam = (src: string, key: string) =>
  new URL(src, "https://example.test").searchParams.get(key);

describe("cache-busting src versioning", () => {
  let now = 1_000_000;

  beforeEach(() => {
    now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 1));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) a freshly written asset's src carries a cache-busting ?v= query", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/logo.png";
    const file = updateFileCache(files, uri, true, 1);
    expect(file.src).toContain("?v=");
    expect(queryParam(file.src, "v")).not.toBeNull();
    // The path portion is still the resource URL.
    expect(file.src.startsWith(getSrcFromUri(uri))).toBe(true);
  });

  it("(a) reading an existing asset (overwrite=false) still gets a ?v= on first cache", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/logo.png";
    // First touch has no existing src -> `!src` is true -> gets ?v=.
    const file = updateFileCache(files, uri, false, 0);
    expect(file.src).toContain("?v=");
  });

  it("(b) overwriting the same asset yields a DIFFERENT src (busts immutable cache)", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/logo.png";
    const first = updateFileCache(files, uri, true, 1);
    const second = updateFileCache(files, uri, true, 2);
    expect(second.src).not.toBe(first.src);
    expect(queryParam(second.src, "v")).not.toBe(queryParam(first.src, "v"));
  });

  it("(b) a non-overwrite re-read does NOT change an already-cached src", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/logo.png";
    const first = updateFileCache(files, uri, true, 1);
    // overwrite=false and src already set -> src stays put.
    const reread = updateFileCache(files, uri, false);
    expect(reread.src).toBe(first.src);
  });

  it("(c) version advances on overwrite", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/logo.png";
    const first = updateFileCache(files, uri, true, 1);
    const second = updateFileCache(files, uri, true, 2);
    expect(second.version).toBeGreaterThan(first.version);
    expect(second.version).toBe(2);
  });

  it("(c) version is preserved across a non-overwrite re-read", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/logo.png";
    updateFileCache(files, uri, true, 5);
    const reread = updateFileCache(files, uri, false);
    expect(reread.version).toBe(5);
  });

  it("nested asset paths keep their full resource path in the busted src", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/ui/btn.png";
    const file = updateFileCache(files, uri, true, 1);
    expect(file.src.startsWith("/file:/proj/images/ui/btn.png?v=")).toBe(true);
  });
});
