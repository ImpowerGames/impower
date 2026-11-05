// @vitest-environment node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  themeColors,
  withManifestColors,
  withThemeColor,
} from "../../src/build/themeColor";
import { readManifestColor, readThemeColors } from "../../vite.config";

const read = (relative: string) =>
  fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf-8");

const DOCUMENT_HTML = read("../../src/public/document.html");
const MANIFEST = read("../../src/public/manifest.webmanifest");

const COLORS = { midnight: "#052d57", charcoal: "#202123", chalk: "#ececee" };

describe("theme colours written by the build", () => {
  it("are every theme's --bg from impower-ui's theme stylesheet as hex", () => {
    expect(readThemeColors()).toEqual(COLORS);
  });

  it("give the manifest Charcoal's colour, the default dark theme", () => {
    expect(readManifestColor()).toBe("#202123");
  });

  it("convert any opaque CSS colour --bg declares and refuse the rest", () => {
    const charcoal = (bg: string) =>
      themeColors(`[data-theme="charcoal"] { --bg: ${bg}; }`).charcoal;
    expect(charcoal("hsl(210.7 89.1% 18%)")).toBe("#052d57");
    expect(charcoal("hsl(210.7deg 89.1% 18%)")).toBe("#052d57");
    expect(charcoal("#ABCDEF")).toBe("#abcdef");
    expect(charcoal("rgb(5 45 87)")).toBe("#052d57");
    expect(charcoal("hsl(0 0% 100%)")).toBe("#ffffff");
    expect(() => charcoal("rgb(5 45 87 / 0.5)")).toThrow(/--bg/);
    expect(() => charcoal("var(--panel)")).toThrow(/--bg/);
    expect(() =>
      themeColors(':root, [data-theme="midnight"] { --bg: #000000; }'),
    ).toThrow(/charcoal/);
    expect(
      themeColors(
        ':root, [data-theme="midnight"] { --bg: #000001; } [data-theme="charcoal"], [data-theme="chalk"] { --bg: #000002; --ink: #fff; } [data-theme="chalk"] { --ink: #000; }',
      ),
    ).toEqual({ midnight: "#000001", charcoal: "#000002", chalk: "#000002" });
  });

  it("fill the theme-color meta tag with Charcoal and every theme's colour", () => {
    const html = withThemeColor(DOCUMENT_HTML, COLORS);
    expect(html).toContain(
      `<meta name="theme-color" content="#202123" data-theme-colors='${JSON.stringify(COLORS)}' />`,
    );
    expect(() => withThemeColor("<head></head>", COLORS)).toThrow(
      /theme-color/,
    );
  });

  it("paint the document body from the --bg variable before any stylesheet", () => {
    expect(DOCUMENT_HTML).toContain(
      '<body style="background-color: var(--bg)">',
    );
    expect(DOCUMENT_HTML).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it("write both manifest colours and keep every other field", () => {
    const source = JSON.parse(MANIFEST);
    expect(source).not.toHaveProperty("theme_color");
    expect(source).not.toHaveProperty("background_color");

    const written = JSON.parse(withManifestColors(MANIFEST, "#202123"));
    expect(written).toEqual({
      ...source,
      theme_color: "#202123",
      background_color: "#202123",
    });
  });
});
