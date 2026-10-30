import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFileExtension } from "../src/utils/getFileExtension";
import { getName } from "../src/utils/getName";
import { getSrcFromUri } from "../src/utils/getSrcFromUri";

interface CachedFile {
  uri: string;
  name: string;
  ext: string;
  src: string;
  version: number;
  size: number;
  modified: number;
}

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
    expect(queryParam(file.src, "v")).toMatch(/^\d+-2048$/);
  });

  it("nested asset paths keep their full resource path in the busted src", () => {
    const files = new Map<string, CachedFile>();
    const uri = "file://proj/images/ui/btn.png";
    const file = updateFileCache(files, uri, true, 1, 100, 555);
    expect(file.src.startsWith("/file:/proj/images/ui/btn.png?v=")).toBe(true);
  });
});
