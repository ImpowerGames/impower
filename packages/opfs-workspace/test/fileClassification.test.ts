import { describe, expect, it } from "vitest";

const globToRegex = (glob: string) => {
  return RegExp(
    glob
      .replace(/[.]/g, "[.]")
      .replace(/[*]/g, ".*")
      .replace(/[{](.*)[}]/g, (_match, $1) => `(${$1.replace(/[,]/g, "|")})`),
    "i",
  );
};

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
