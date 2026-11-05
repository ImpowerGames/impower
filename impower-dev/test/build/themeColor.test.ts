// @vitest-environment node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  themeColor,
  withManifestColors,
  withThemeColor,
} from "../../src/build/themeColor";
import { readThemeColor } from "../../vite.config";

const read = (relative: string) =>
  fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf-8");

const DOCUMENT_HTML = read("../../src/public/document.html");
const MANIFEST = read("../../src/public/manifest.webmanifest");

describe("theme colour written by the build", () => {
  it("is Midnight's --bg from impower-ui's theme stylesheet as hex", () => {
    expect(readThemeColor()).toBe("#052d57");
  });

  it("converts any opaque CSS colour --bg declares and refuses the rest", () => {
    expect(themeColor(":root { --bg: hsl(210.7 89.1% 18%); }")).toBe("#052d57");
    expect(themeColor(":root { --bg: hsl(210.7deg 89.1% 18%); }")).toBe(
      "#052d57",
    );
    expect(themeColor(":root, [data-theme=x] { --bg: #ABCDEF; }")).toBe(
      "#abcdef",
    );
    expect(themeColor(":root { --bg: rgb(5 45 87); }")).toBe("#052d57");
    expect(themeColor(":root { --bg: hsl(0 0% 100%); }")).toBe("#ffffff");
    expect(() => themeColor(":root { --bg: rgb(5 45 87 / 0.5); }")).toThrow(
      /--bg/,
    );
    expect(() => themeColor(":root { --bg: var(--panel); }")).toThrow(/--bg/);
    expect(() => themeColor(":root { --panel: #000000; }")).toThrow(/--bg/);
  });

  it("fills the document's theme-color meta tag", () => {
    const html = withThemeColor(DOCUMENT_HTML, "#052d57");
    expect(html).toContain('<meta name="theme-color" content="#052d57" />');
    expect(() => withThemeColor("<head></head>", "#052d57")).toThrow(
      /theme-color/,
    );
  });

  it("paints the document body from the --bg variable before any stylesheet", () => {
    expect(DOCUMENT_HTML).toContain('<body style="background-color: var(--bg)">');
    expect(DOCUMENT_HTML).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it("writes both manifest colours and keeps every other field", () => {
    const source = JSON.parse(MANIFEST);
    expect(source).not.toHaveProperty("theme_color");
    expect(source).not.toHaveProperty("background_color");

    const written = JSON.parse(withManifestColors(MANIFEST, "#052d57"));
    expect(written).toEqual({
      ...source,
      theme_color: "#052d57",
      background_color: "#052d57",
    });
  });
});
