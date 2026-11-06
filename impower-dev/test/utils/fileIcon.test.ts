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
import {
  extOf,
  fileCategory,
  iconForPath,
  isImagePath,
  setAssetFiles,
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

describe("fileCategory (Type filter)", () => {
  it("maps extensions to coarse media categories", () => {
    expect(fileCategory("art/forest.png")).toBe("image");
    expect(fileCategory("song.ogg")).toBe("audio");
    expect(fileCategory("beat.mid")).toBe("audio");
    expect(fileCategory("clip.mp4")).toBe("video");
    expect(fileCategory("notes.md")).toBe("text");
    expect(fileCategory("main.sd")).toBe("text");
  });

  it("is 'other' for unmapped / missing extensions", () => {
    expect(fileCategory("bundle.zip")).toBe("other");
    expect(fileCategory("manual.pdf")).toBe("other");
    expect(fileCategory("LICENSE")).toBe("other");
  });
});

describe("the endings configured under File types", () => {
  it("add an image or audio ending to the glyph, the thumbnail and the type filter, leaving the built-in endings", () => {
    expect(isImagePath("assets/lighthouse.avif")).toBe(false);
    try {
      setAssetFiles({ imageFiles: "*.{png,avif}", audioFiles: "*.{ogg,weba}" });
      expect(isImagePath("assets/lighthouse.avif")).toBe(true);
      expect(iconForPath("assets/lighthouse.AVIF", false)).toBe(ImageIcon);
      expect(fileCategory("assets/lighthouse.avif")).toBe("image");
      expect(iconForPath("assets/rain.weba", false)).toBe(MusicIcon);
      expect(fileCategory("assets/rain.weba")).toBe("audio");
      expect(fileCategory("assets/hero.jpg")).toBe("image");
      expect(fileCategory("assets/theme.m4a")).toBe("audio");
    } finally {
      setAssetFiles({ imageFiles: "", audioFiles: "" });
    }
    expect(fileCategory("assets/lighthouse.avif")).toBe("other");
  });
});
