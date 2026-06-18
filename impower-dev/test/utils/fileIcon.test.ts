import {
  Binder,
  FileCode,
  FileText,
  FileTypeHtml,
  FileTypePdf,
  FileZip,
  Link,
  Music,
  Photo,
  Script,
  WaveSaw,
} from "@impower/impower-ui/icons";
import { describe, expect, it } from "vitest";
import { iconForPath } from "../../src/modules/spark-editor/utils/fileIcon";

describe("iconForPath", () => {
  it("returns the Binder glyph for folders regardless of name", () => {
    expect(iconForPath("chapters", true)).toBe(Binder);
    expect(iconForPath("a/b/deeply/nested", true)).toBe(Binder);
    // A directory whose name happens to look like a file still gets Binder.
    expect(iconForPath("weird.png", true)).toBe(Binder);
  });

  it("maps the screenplay script extension to Script", () => {
    expect(iconForPath("main.sd", false)).toBe(Script);
    expect(iconForPath("chapters/intro.sd", false)).toBe(Script);
  });

  it("maps prose/text extensions to FileText", () => {
    expect(iconForPath("notes.txt", false)).toBe(FileText);
    expect(iconForPath("README.md", false)).toBe(FileText);
    expect(iconForPath("credits.name", false)).toBe(FileText);
  });

  it("maps code/data extensions to FileCode", () => {
    expect(iconForPath("data.json", false)).toBe(FileCode);
    expect(iconForPath("script.js", false)).toBe(FileCode);
    expect(iconForPath("module.ts", false)).toBe(FileCode);
    expect(iconForPath("table.csv", false)).toBe(FileCode);
  });

  it("maps image extensions to Photo", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "svg"]) {
      expect(iconForPath(`art.${ext}`, false)).toBe(Photo);
    }
  });

  it("maps audio extensions to Music", () => {
    for (const ext of ["mid", "mp3", "ogg", "wav", "m4a"]) {
      expect(iconForPath(`sound.${ext}`, false)).toBe(Music);
    }
  });

  it("maps the remaining typed media to their glyphs", () => {
    expect(iconForPath("instrument.synth", false)).toBe(WaveSaw);
    expect(iconForPath("link.url", false)).toBe(Link);
    expect(iconForPath("bundle.zip", false)).toBe(FileZip);
    expect(iconForPath("manual.pdf", false)).toBe(FileTypePdf);
    expect(iconForPath("page.html", false)).toBe(FileTypeHtml);
  });

  it("is case-insensitive on the extension", () => {
    expect(iconForPath("ART.PNG", false)).toBe(Photo);
    expect(iconForPath("Main.SD", false)).toBe(Script);
  });

  it("keys off the FINAL extension for multi-dot names", () => {
    expect(iconForPath("archive.tar.gz", false)).toBe(FileText); // gz unknown
    expect(iconForPath("scene.backup.png", false)).toBe(Photo);
  });

  it("falls back to FileText for unknown / missing extensions", () => {
    expect(iconForPath("LICENSE", false)).toBe(FileText);
    expect(iconForPath("weird.xyz", false)).toBe(FileText);
    // A dotfile has no extension (leading dot only) → fallback.
    expect(iconForPath(".folder", false)).toBe(FileText);
  });
});
