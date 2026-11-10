import {
  BracketsIcon,
  FolderIcon,
  ImageIcon,
  LinkIcon,
  MusicIcon,
  OtherIcon,
  SoundSpeakerIcon,
  StoryIcon,
  TextIcon,
} from "@impower/impower-ui/icons";
import { describe, expect, it } from "vitest";
import { setAssetFiles } from "../../src/modules/spark-editor/utils/assetTypes";
import {
  extOf,
  iconForPath,
} from "../../src/modules/spark-editor/utils/fileIcon";

describe("iconForPath", () => {
  it("returns the folder glyph for folders, regardless of name", () => {
    expect(iconForPath("chapters", true)).toBe(FolderIcon);
    expect(iconForPath("a/b/deeply/nested", true)).toBe(FolderIcon);
    expect(iconForPath("weird.png", true)).toBe(FolderIcon);
  });

  it("maps the script extension to the story glyph", () => {
    expect(iconForPath("main.sd", false)).toBe(StoryIcon);
    expect(iconForPath("chapters/intro.sd", false)).toBe(StoryIcon);
  });

  it("maps prose and text extensions to the text glyph", () => {
    expect(iconForPath("notes.txt", false)).toBe(TextIcon);
    expect(iconForPath("README.md", false)).toBe(TextIcon);
    expect(iconForPath("credits.name", false)).toBe(TextIcon);
  });

  it("maps code and data extensions to the brackets glyph", () => {
    expect(iconForPath("data.json", false)).toBe(BracketsIcon);
    expect(iconForPath("script.js", false)).toBe(BracketsIcon);
    expect(iconForPath("module.ts", false)).toBe(BracketsIcon);
    expect(iconForPath("view.jsx", false)).toBe(BracketsIcon);
    expect(iconForPath("view.tsx", false)).toBe(BracketsIcon);
    expect(iconForPath("table.csv", false)).toBe(BracketsIcon);
    expect(iconForPath("data.xml", false)).toBe(BracketsIcon);
  });

  it("maps image extensions to the image glyph", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "svg"]) {
      expect(iconForPath(`art.${ext}`, false)).toBe(ImageIcon);
    }
  });

  it("maps audio extensions to the music glyph", () => {
    for (const ext of ["mid", "mp3", "ogg", "wav", "m4a"]) {
      expect(iconForPath(`sound.${ext}`, false)).toBe(MusicIcon);
    }
  });

  it("maps the remaining typed media to their glyphs", () => {
    expect(iconForPath("instrument.synth", false)).toBe(SoundSpeakerIcon);
    expect(iconForPath("link.url", false)).toBe(LinkIcon);
    expect(iconForPath("bundle.zip", false)).toBe(OtherIcon);
    expect(iconForPath("manual.pdf", false)).toBe(OtherIcon);
    expect(iconForPath("page.html", false)).toBe(BracketsIcon);
  });

  it("is case-insensitive on the extension", () => {
    expect(iconForPath("ART.PNG", false)).toBe(ImageIcon);
    expect(iconForPath("Main.SD", false)).toBe(StoryIcon);
  });

  it("keys off the FINAL extension for multi-dot names", () => {
    expect(iconForPath("archive.tar.gz", false)).toBe(TextIcon);
    expect(iconForPath("scene.backup.png", false)).toBe(ImageIcon);
  });

  it("falls back to the text glyph for unknown / missing extensions", () => {
    expect(iconForPath("LICENSE", false)).toBe(TextIcon);
    expect(iconForPath("weird.xyz", false)).toBe(TextIcon);
    expect(iconForPath(".folder", false)).toBe(TextIcon);
  });
});

describe("extOf", () => {
  it("returns the lowercased final extension", () => {
    expect(extOf("a/b.PNG")).toBe("png");
    expect(extOf("multi.dot.name.sd")).toBe("sd");
  });

  it("is empty for dotfiles and extension-less names", () => {
    expect(extOf(".folder")).toBe("");
    expect(extOf("LICENSE")).toBe("");
    expect(extOf("")).toBe("");
  });
});

describe("the endings configured under File types", () => {
  const NONE = { imageFiles: "", audioFiles: "", videoFiles: "", fontFiles: "" };

  it("add an image or audio ending to the glyph, leaving the built-in endings", () => {
    expect(iconForPath("assets/lighthouse.avif", false)).toBe(TextIcon);
    try {
      setAssetFiles({ ...NONE, imageFiles: "*.{png,avif}", audioFiles: "*.{ogg,weba}" });
      expect(iconForPath("assets/lighthouse.AVIF", false)).toBe(ImageIcon);
      expect(iconForPath("assets/rain.weba", false)).toBe(MusicIcon);
      expect(iconForPath("assets/hero.jpg", false)).toBe(ImageIcon);
      expect(iconForPath("assets/theme.m4a", false)).toBe(MusicIcon);
    } finally {
      setAssetFiles(NONE);
    }
    expect(iconForPath("assets/lighthouse.avif", false)).toBe(TextIcon);
  });
});
