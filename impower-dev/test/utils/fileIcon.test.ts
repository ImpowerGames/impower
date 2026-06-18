import {
  FileCode,
  FileText,
  FileTypeCsv,
  FileTypeHtml,
  FileTypeJs,
  FileTypeJsx,
  FileTypePdf,
  FileTypeTs,
  FileTypeXml,
  FileZip,
  Folder,
  FolderOpen,
  Link,
  Music,
  Photo,
  Script,
  WaveSaw,
} from "@impower/impower-ui/icons";
import { describe, expect, it } from "vitest";
import {
  iconForPath,
  isImagePath,
} from "../../src/modules/spark-editor/utils/fileIcon";

describe("iconForPath", () => {
  it("returns a folder glyph for folders (open when expanded), regardless of name", () => {
    expect(iconForPath("chapters", true)).toBe(Folder);
    expect(iconForPath("chapters", true, false)).toBe(Folder);
    expect(iconForPath("chapters", true, true)).toBe(FolderOpen);
    expect(iconForPath("a/b/deeply/nested", true)).toBe(Folder);
    // A directory whose name happens to look like a file still gets a folder.
    expect(iconForPath("weird.png", true)).toBe(Folder);
    expect(iconForPath("weird.png", true, true)).toBe(FolderOpen);
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

  it("maps code/data extensions to their specific glyphs (json → generic)", () => {
    expect(iconForPath("data.json", false)).toBe(FileCode);
    expect(iconForPath("script.js", false)).toBe(FileTypeJs);
    expect(iconForPath("module.ts", false)).toBe(FileTypeTs);
    expect(iconForPath("view.jsx", false)).toBe(FileTypeJsx);
    expect(iconForPath("view.tsx", false)).toBe(FileTypeJsx);
    expect(iconForPath("table.csv", false)).toBe(FileTypeCsv);
    expect(iconForPath("data.xml", false)).toBe(FileTypeXml);
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

describe("isImagePath", () => {
  it("is true for image extensions (case-insensitive, nested, multi-dot)", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "svg"]) {
      expect(isImagePath(`art.${ext}`)).toBe(true);
    }
    expect(isImagePath("backgrounds/forest.PNG")).toBe(true);
    expect(isImagePath("scene.backup.webp")).toBe(true);
  });

  it("is false for non-image files and folders' names", () => {
    expect(isImagePath("main.sd")).toBe(false);
    expect(isImagePath("song.mp3")).toBe(false);
    expect(isImagePath("data.json")).toBe(false);
    expect(isImagePath("LICENSE")).toBe(false);
    expect(isImagePath("archive.tar.gz")).toBe(false);
    expect(isImagePath("")).toBe(false);
  });
});
