import { describe, expect, it } from "vitest";
import {
  endings,
  endingsPattern,
  endingsText,
  patternEndings,
  typedPattern,
} from "../../src/modules/spark-editor/workspace/settings/fileEndings";
import { PROJECT_SETTINGS_SCHEMA } from "../../src/modules/spark-editor/workspace/settings/settingsSchema";

describe("file endings", () => {
  it("lower-cases, strips stars and dots, keeps letters and digits only and drops repeats", () => {
    expect(endings("PNG, *.jpg, .Gif; webp  webp, mp3!, a-b, , woff2")).toEqual(["png", "jpg", "gif", "webp", "woff2"]);
  });

  it("reads the endings back out of a pattern, braced or not", () => {
    expect(patternEndings("*.{png,apng,jpeg}")).toEqual(["png", "apng", "jpeg"]);
    expect(patternEndings("*.sd")).toEqual(["sd"]);
  });

  it("writes the endings as the extension's pattern", () => {
    expect(endingsPattern(["png", "avif"])).toBe("*.{png,avif}");
    expect(endingsPattern(["sd"])).toBe("*.{sd}");
  });

  it("turns what was typed into a pattern, falling back to the default when nothing usable was typed", () => {
    const images = PROJECT_SETTINGS_SCHEMA.imageFiles.default;
    expect(typedPattern("png, avif", images)).toBe("*.{png,avif}");
    expect(typedPattern("", images)).toBe(images);
    expect(typedPattern(" , *. ;", images)).toBe(images);
  });

  it("shows each default as the comma list the field holds", () => {
    expect(endingsText(PROJECT_SETTINGS_SCHEMA.imageFiles.default)).toBe("png, apng, jpeg, jpg, gif, bmp, svg, webp");
    expect(endingsText(PROJECT_SETTINGS_SCHEMA.audioFiles.default)).toBe("mid, wav, mp3, mp2, ogg, aac, opus, flac");
    expect(endingsText(PROJECT_SETTINGS_SCHEMA.fontFiles.default)).toBe("ttf, woff, woff2, otf");
    expect(typedPattern(endingsText(PROJECT_SETTINGS_SCHEMA.scriptFiles.default), "")).toBe(
      PROJECT_SETTINGS_SCHEMA.scriptFiles.default,
    );
  });
});
