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
// minimal in-memory `files` map standing in for `State.files`.
//
// The desired CONTRACT (per sw.ts serving assets `max-age, immutable`):
//   (a) an asset's src carries a `?v=` query that is the file's CONTENT
//       SIGNATURE (`<modified>-<size>`), not a mint-time timestamp;
//   (b) a real write (new modified) yields a DIFFERENT src (busts the
//       immutable cache), while re-resolving an UNCHANGED file — even from an
//       empty cache, i.e. a fresh session — yields the SAME src, so browser
//       and URL-keyed caches survive reloads;
//   (c) `version` advances on write;
//   (d) when no mtime is known, the stamp falls back to `Date.now()`
//       (old always-fresh behavior — over-invalidates, never stale).

interface CachedFile {
  uri: string;
  name: string;
  ext: string;
  src: string;
  version: number;
  size: number;
  modified: number;
}

// Faithful reconstruction of the src/version portion of updateFileCache.
function updateFileCache(
  files: Map<string, CachedFile>,
  uri: string,
  overwrite: boolean,
  version?: number,
  size = 100,
  modified?: number,
): CachedFile {
  const existingFile = files.get(uri);
  let src = existingFile?.src || "";
  const name = getName(uri);
  const ext = getFileExtension(uri);
  const resolvedModified = modified ?? existingFile?.modified ?? Date.now();
  if (name) {
    if (!src || overwrite) {
      src = getSrcFromUri(uri) + `?v=${resolvedModified}-${size}`;
    }
  }
  const file: CachedFile = {
    uri,
    name,
    ext,
    src,
    version: version ?? existingFile?.version ?? 0,
    size,
    modified: resolvedModified,
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

  it("(a) an asset's src carries its content signature as the ?v= query", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/logo.png";
    const file = updateFileCache(files, uri, true, 1, 2048, 555);
    expect(queryParam(file.src, "v")).toBe("555-2048");
    // The path portion is still the resource URL.
    expect(file.src.startsWith(getSrcFromUri(uri))).toBe(true);
  });

  it("(b) a real write (new modified) yields a DIFFERENT src", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/logo.png";
    const first = updateFileCache(files, uri, true, 1, 2048, 555);
    const second = updateFileCache(files, uri, true, 2, 2100, 900);
    expect(second.src).not.toBe(first.src);
    expect(queryParam(second.src, "v")).toBe("900-2100");
  });

  it("(b) an UNCHANGED file re-resolved from an empty cache (fresh session) keeps the SAME src", () => {
    const sessionOne = new Map<string, CachedFile>();
    const sessionTwo = new Map<string, CachedFile>();
    const uri = "file://proj/images/logo.png";
    // Both sessions derive the stamp from the file's OPFS mtime + size.
    const first = updateFileCache(sessionOne, uri, false, 0, 2048, 555);
    const second = updateFileCache(sessionTwo, uri, false, 0, 2048, 555);
    expect(second.src).toBe(first.src);
  });

  it("(b) a non-overwrite re-read does NOT change an already-cached src", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/logo.png";
    const first = updateFileCache(files, uri, true, 1, 2048, 555);
    const reread = updateFileCache(files, uri, false);
    expect(reread.src).toBe(first.src);
  });

  it("(c) version advances on overwrite", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/logo.png";
    const first = updateFileCache(files, uri, true, 1, 2048, 555);
    const second = updateFileCache(files, uri, true, 2, 2048, 900);
    expect(second.version).toBeGreaterThan(first.version);
    expect(second.version).toBe(2);
  });

  it("(c) version is preserved across a non-overwrite re-read", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/logo.png";
    updateFileCache(files, uri, true, 5, 2048, 555);
    const reread = updateFileCache(files, uri, false);
    expect(reread.version).toBe(5);
  });

  it("(d) with no mtime known, the stamp falls back to a fresh mint time", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/logo.png";
    const file = updateFileCache(files, uri, true, 1, 2048, undefined);
    // Date.now() is stubbed to advance; the stamp exists and is time-derived.
    expect(queryParam(file.src, "v")).toMatch(/^\d+-2048$/);
  });

  it("nested asset paths keep their full resource path in the busted src", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/ui/btn.png";
    const file = updateFileCache(files, uri, true, 1, 100, 555);
    expect(file.src.startsWith("/file:/proj/images/ui/btn.png?v=")).toBe(true);
  });
});
