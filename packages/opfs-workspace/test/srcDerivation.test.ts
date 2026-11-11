import { getResourcePathFromUrl } from "@impower/sparkdown/src/workspace/utils/resourceUrl";
import { describe, expect, it } from "vitest";
import { getPathFromUri } from "../src/utils/getPathFromUri";
import { getSrcFromUri } from "../src/utils/getSrcFromUri";
import { getUriFromPath } from "../src/utils/getUriFromPath";

function splitPath(path: string) {
  return path
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pathFromRequestUrl(requestUrl: string) {
  return getResourcePathFromUrl(new URL(requestUrl));
}

const ORIGIN = "https://example.test";

describe("asset src round-trip through the browser's URL parse", () => {
  it.each([
    ["ASCII", "local/assets/Backdrops/beach.png"],
    ["non-ASCII", "local/assets/Backdrops/café.png"],
    ["non-ASCII folder", "local/assets/Fonds/été/plage.png"],
    ["space", "local/assets/Backdrops/my pic.png"],
    ["percent sign", "local/assets/Backdrops/100% done.png"],
    ["percent escape lookalike", "local/assets/Backdrops/caf%C3%A9.png"],
    ["plus sign", "local/assets/Sounds/a+b.mp3"],
    ["question mark and hash", "local/assets/Backdrops/what?#1.png"],
    ["nested folders", "local/assets/Portraits/cast/hero/smile.png"],
  ])("%s: %s", (_label, path) => {
    const src = getSrcFromUri(getUriFromPath(path)) + "?v=1-2";
    const requested = new URL(src, ORIGIN);
    expect(getResourcePathFromUrl(requested)).toBe(path);
    expect(getResourcePathFromUrl(requested.href)).toBe(path);
  });
});

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
    const src = getSrcFromUri(uri);
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
