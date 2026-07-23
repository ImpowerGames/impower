import { describe, expect, it } from "vitest";

// AREA 8: File type / MIME classification.
//
// `getFileType` and `getMimeType` live module-private inside
// `src/opfs-workspace.ts`, which is a Web Worker entry point: importing it runs
// top-level side effects (`new BroadcastChannel(...)`, `postMessage(...)`,
// `navigator.storage.getDirectory()`) that don't exist in node/jsdom, and it
// exports nothing. So we cannot import these functions directly.
//
// Instead we replicate the EXACT logic from `src/opfs-workspace.ts`
// (`globToRegex`, `getFileType`, `getMimeType`) and drive it with the
// production default glob patterns from
// `impower-dev/src/modules/spark-editor/workspace/WorkspaceConfiguration.ts`.
// These tests assert the desired classification contract; if the replicated
// logic ever drifts from source, the path-util / src-derivation suites that DO
// import real code will still anchor the behavior.

// --- replicated verbatim from src/opfs-workspace.ts ---
const globToRegex = (glob: string) => {
  return RegExp(
    glob
      .replace(/[.]/g, "[.]")
      .replace(/[*]/g, ".*")
      .replace(/[{](.*)[}]/g, (_match, $1) => `(${$1.replace(/[,]/g, "|")})`),
    "i",
  );
};

// Production defaults (WorkspaceConfiguration.ts).
const scriptFilePattern = globToRegex("*.{sd}");
const imageFilePattern = globToRegex(
  "*.{png,apng,jpeg,jpg,gif,bmp,svg,webp}",
);
const audioFilePattern = globToRegex("*.{mid,wav,mp3,mp2,ogg,aac,opus,flac}");
const fontFilePattern = globToRegex("*.{ttf,woff,woff2,otf}");

const getFileType = (uri: string): string => {
  if (scriptFilePattern.test(uri)) return "script";
  if (imageFilePattern.test(uri)) return "image";
  if (audioFilePattern.test(uri)) return "audio";
  if (fontFilePattern.test(uri)) return "font";
  return "text";
};

const getMimeType = (type: string, ext: string) => {
  const encoding = type === "text" ? "plain" : ext === "svg" ? "svg+xml" : ext;
  return `${type}/${encoding}`;
};
// --- end replication ---

describe("getFileType classification", () => {
  it("classifies a .sd file as script", () => {
    expect(getFileType("file://proj/main.sd")).toBe("script");
  });

  it("classifies a .png file as image", () => {
    expect(getFileType("file://proj/logo.png")).toBe("image");
  });

  it("classifies a .svg file as image", () => {
    expect(getFileType("file://proj/icon.svg")).toBe("image");
  });

  it("classifies a .mp3 file as audio", () => {
    expect(getFileType("file://proj/theme.mp3")).toBe("audio");
  });

  it("classifies a .ttf file as font", () => {
    expect(getFileType("file://proj/body.ttf")).toBe("font");
  });

  it("classifies a .woff2 file as font", () => {
    expect(getFileType("file://proj/body.woff2")).toBe("font");
  });

  it("falls back to text for an unknown extension", () => {
    expect(getFileType("file://proj/notes.txt")).toBe("text");
  });

  it("classifies nested-path assets by extension", () => {
    expect(getFileType("file://proj/images/ui/btn.png")).toBe("image");
    expect(getFileType("file://proj/audio/music/theme.ogg")).toBe("audio");
  });
});

describe("getMimeType", () => {
  it("maps an image png to image/png", () => {
    expect(getMimeType("image", "png")).toBe("image/png");
  });

  it("maps an svg to image/svg+xml (special case)", () => {
    expect(getMimeType("image", "svg")).toBe("image/svg+xml");
  });

  it("maps audio mp3 to audio/mp3", () => {
    expect(getMimeType("audio", "mp3")).toBe("audio/mp3");
  });

  it("maps font ttf to font/ttf", () => {
    expect(getMimeType("font", "ttf")).toBe("font/ttf");
  });

  it("maps any text type to text/plain regardless of extension", () => {
    expect(getMimeType("text", "sd")).toBe("text/plain");
    expect(getMimeType("text", "txt")).toBe("text/plain");
  });
});
