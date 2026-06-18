import { describe, expect, it } from "vitest";
import { getPathFromUri } from "../src/utils/getPathFromUri";
import { getSrcFromUri } from "../src/utils/getSrcFromUri";
import { getUriFromPath } from "../src/utils/getUriFromPath";

// AREA 6: Asset src derivation + service-worker path resolution.
//
// `getSrcFromUri` IS importable (opfs-workspace util). The service worker
// (impower-dev/src/workers/sw.ts) is a ServiceWorker entry with top-level
// `self.addEventListener(...)` and no exports, so its `splitPath` and the
// `url.pathname.replace(RESOURCE_PROTOCOL, "")` path-derivation are replicated
// verbatim below. The contract under test: an asset uri maps to a
// `/file:/<path>` URL whose pathname round-trips back to the SAME OPFS location
// (the path segments getFileHandleByPath would walk), including for nested
// paths.

const RESOURCE_PROTOCOL = "/file:/"; // sw.ts + getSrcFromUri

// --- replicated verbatim from impower-dev/src/workers/sw.ts ---
function splitPath(path: string) {
  return path
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

// handleLocalAssetRequest derives the OPFS path from the request URL like this:
function pathFromRequestUrl(requestUrl: string) {
  const url = new URL(requestUrl);
  return url.pathname.replace(RESOURCE_PROTOCOL, "");
}
// --- end replication ---

const ORIGIN = "https://example.test";

describe("getSrcFromUri", () => {
  it("maps a flat asset uri to a /file:/ resource URL", () => {
    expect(getSrcFromUri("file://proj/logo.png")).toBe("/file:/proj/logo.png");
  });

  it("preserves nested directories in the resource URL", () => {
    expect(getSrcFromUri("file://proj/images/ui/btn.png")).toBe(
      "/file:/proj/images/ui/btn.png",
    );
  });
});

describe("service-worker path round-trip", () => {
  it("recovers the OPFS path from a flat asset src", () => {
    const uri = "file://proj/logo.png";
    const src = getSrcFromUri(uri); // what the FileData.src points at
    const path = pathFromRequestUrl(ORIGIN + src);
    expect(path).toBe(getPathFromUri(uri));
  });

  it("recovers the OPFS path from a nested asset src", () => {
    const uri = "file://proj/images/ui/btn.png";
    const src = getSrcFromUri(uri);
    const path = pathFromRequestUrl(ORIGIN + src);
    expect(path).toBe(getPathFromUri(uri));
  });

  it("the recovered path round-trips back to the original uri", () => {
    const uri = "file://proj/audio/music/theme.mp3";
    const src = getSrcFromUri(uri);
    const path = pathFromRequestUrl(ORIGIN + src);
    expect(getUriFromPath(path)).toBe(uri);
  });

  it("splitPath walks the same directory segments getFileHandleByPath needs", () => {
    const uri = "file://proj/images/ui/btn.png";
    const src = getSrcFromUri(uri);
    const path = pathFromRequestUrl(ORIGIN + src);
    // getFileHandleByPath pops the filename and walks the parent dirs.
    expect(splitPath(path)).toEqual(["proj", "images", "ui", "btn.png"]);
  });

  it("survives a cache-busting ?v= query on the src (query is not part of pathname)", () => {
    const uri = "file://proj/images/logo.png";
    const src = getSrcFromUri(uri) + "?v=1717171717";
    const path = pathFromRequestUrl(ORIGIN + src);
    expect(path).toBe(getPathFromUri(uri));
    expect(splitPath(path)).toEqual(["proj", "images", "logo.png"]);
  });
});
