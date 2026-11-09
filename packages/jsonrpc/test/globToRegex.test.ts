import { describe, expect, it } from "vitest";
import { globToRegex } from "../src/common/utils/globToRegex";

const matches = (glob: string, uri: string) => globToRegex(glob).test(uri);

describe("globToRegex", () => {
  it("does not match a file whose extension merely starts with a listed one", () => {
    expect(matches("*.{sd,luau}", "file:///p/notes.sdx")).toBe(false);
    expect(matches("*.{sd}", "file:///p/notes.sdx")).toBe(false);
  });

  it("does not match a listed extension in the middle of a name", () => {
    expect(matches("*.{png}", "file:///p/a.png.txt")).toBe(false);
  });

  it("does not match a listed extension on a directory", () => {
    expect(matches("*.{sd}", "file:///p/chapter.sd/notes.txt")).toBe(false);
  });

  it("spans the directory part with the leading star", () => {
    expect(matches("*.{sd,luau}", "file:///p/scripts/deep/util.luau")).toBe(
      true,
    );
  });

  it("anchors a glob with no star at both ends of the URI", () => {
    expect(matches("main.sd", "main.sd")).toBe(true);
    expect(matches("main.sd", "file:///p/scripts/domain.sd")).toBe(false);
    expect(matches("main.sd", "main.sd.bak")).toBe(false);
  });

  it("matches in any case", () => {
    expect(matches("*.{png}", "file:///p/HERO.PNG")).toBe(true);
  });

  it("treats a regular-expression character in a glob literally", () => {
    expect(matches("*.{c++}", "file:///p/a.c++")).toBe(true);
    expect(matches("*.{c++}", "file:///p/a.ccc")).toBe(false);
    expect(matches("a(1).{png}", "a(1).png")).toBe(true);
    expect(matches("a$b.png", "a$b.png")).toBe(true);
    expect(matches("[ab].png", "a.png")).toBe(false);
    expect(matches("[ab].png", "[ab].png")).toBe(true);
    expect(matches("a?.png", "a.png")).toBe(false);
    expect(matches("a|b.png", "a")).toBe(false);
  });

  it("matches the dot literally", () => {
    expect(matches("*.{sd}", "file:///p/notes_sd")).toBe(false);
  });

  it("expands each brace group on its own", () => {
    expect(matches("{a,b}.{png,jpg}", "b.jpg")).toBe(true);
    expect(matches("{a,b}.{png,jpg}", "c.jpg")).toBe(false);
  });

  it("keeps a star inside a brace alternative", () => {
    expect(matches("*.{te*,sd}", "file:///p/a.text")).toBe(true);
    expect(matches("*.{te*,sd}", "file:///p/a.sdx")).toBe(false);
  });

  it("matches everything with a lone star", () => {
    expect(matches("*", "file:///p/anything.at.all")).toBe(true);
  });

  const realPatterns: [string, string, string[], string][] = [
    ["script", "*.{sd,luau}", ["sd", "luau"], "sdx"],
    [
      "image",
      "*.{png,apng,jpeg,jpg,gif,bmp,svg,webp}",
      ["png", "apng", "jpeg", "jpg", "gif", "bmp", "svg", "webp"],
      "pngx",
    ],
    [
      "audio",
      "*.{mid,wav,mp3,mp2,ogg,aac,opus,flac}",
      ["mid", "wav", "mp3", "mp2", "ogg", "aac", "opus", "flac"],
      "mp34",
    ],
    [
      "video",
      "*.{mp4,webm,mov,m4v,ogv,mkv}",
      ["mp4", "webm", "mov", "m4v", "ogv", "mkv"],
      "mp4a",
    ],
    ["font", "*.{ttf,woff,woff2,otf}", ["ttf", "woff", "woff2", "otf"], "ttfx"],
    ["world", "*.{js}", ["js"], "json"],
  ];

  it.each(realPatterns)(
    "classifies by the whole name for the %s pattern",
    (_type, glob, extensions, wrong) => {
      for (const extension of extensions) {
        expect(matches(glob, `file:///p/dir/a.${extension}`)).toBe(true);
      }
      expect(matches(glob, `file:///p/dir/a.${wrong}`)).toBe(false);
      expect(matches(glob, `file:///p/dir/a.${extensions[0]}.txt`)).toBe(false);
    },
  );
});
