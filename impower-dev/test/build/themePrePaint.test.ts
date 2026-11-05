// @vitest-environment node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import staticallyRenderPage from "../../src/build/staticallyRenderPage";
import { themeColors, withThemeColor } from "../../src/build/themeColor";
import {
  LIGHT_SCHEME_QUERY,
  resolveAppearance,
  resolveTheme,
  THEMES,
} from "../../src/modules/spark-editor/workspace/settings/applyTheme";
import { PREFERENCES_STORAGE_KEY } from "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings";
import { readThemeColors, staticallyStylePage } from "../../vite.config";

const THEME_CSS = fs.readFileSync(
  fileURLToPath(
    new URL("../../../packages/impower-ui/src/theme.css", import.meta.url),
  ),
  "utf-8",
);

const COLORS = readThemeColors();

const DOCUMENT_HTML = fs.readFileSync(
  fileURLToPath(new URL("../../src/public/document.html", import.meta.url)),
  "utf-8",
);

const servedPage = () =>
  staticallyStylePage(
    staticallyRenderPage(withThemeColor(DOCUMENT_HTML, COLORS), {
      html: '<div id="root"></div>',
      mjsPath: "/src/pages/index.ts",
    }),
    THEME_CSS,
  );

const rootBackground = (dom: JSDOM) => {
  const { document } = dom.window;
  const value = dom.window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--bg")
    .trim();
  return themeColors(`[data-theme="charcoal"] { --bg: ${value}; }`).charcoal;
};

const load = (stored: string | null, prefersLight: boolean) => {
  const seen: { stylesheetsWhenRead?: number } = {};
  const dom = new JSDOM(servedPage(), {
    url: "http://localhost/",
    runScripts: "dangerously",
    beforeParse(win) {
      if (stored != null) {
        win.localStorage.setItem(PREFERENCES_STORAGE_KEY, stored);
      }
      win.matchMedia = ((query: string) => ({
        media: query,
        matches: query === LIGHT_SCHEME_QUERY && prefersLight,
      })) as typeof win.matchMedia;
      const getItem = win.Storage.prototype.getItem;
      win.Storage.prototype.getItem = function (key: string) {
        seen.stylesheetsWhenRead ??= win.document.querySelectorAll(
          'link[rel="stylesheet"], style',
        ).length;
        return getItem.call(this, key);
      };
    },
  });
  return { dom, seen };
};

const STORED: [string, string | null, string][] = [
  ["nothing stored", null, "automatic"],
  ["Automatic", JSON.stringify({ theme: "automatic" }), "automatic"],
  ["Charcoal", JSON.stringify({ theme: "charcoal" }), "charcoal"],
  ["Chalk", JSON.stringify({ theme: "chalk" }), "chalk"],
  ...THEMES.map((theme): [string, string, string] => [
    theme,
    JSON.stringify({ theme }),
    theme,
  ]),
  [
    "a theme the editor does not offer",
    JSON.stringify({ theme: "sepia" }),
    "sepia",
  ],
  ["malformed preferences", "{", ""],
  ["a non-object", "null", ""],
];

describe("the document's theme before first paint", () => {
  for (const [label, stored, preference] of STORED) {
    for (const prefersLight of [true, false]) {
      it(`with ${label} and a ${prefersLight ? "light" : "dark"} device, sets the theme the editor resolves, its theme-color and its background`, () => {
        const { dom } = load(stored, prefersLight);
        const { document } = dom.window;
        const theme = resolveTheme(preference, prefersLight);
        expect(document.documentElement.dataset["theme"]).toBe(theme);
        expect(
          document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!
            .content,
        ).toBe(COLORS[theme]);
        expect(document.body.getAttribute("style")).toBe(
          "background-color: var(--bg)",
        );
        expect(rootBackground(dom)).toBe(COLORS[theme]);
      });
    }
  }

  it.each([
    [{ theme: "graphite" }, "unified", "softened"],
    [{ theme: "warm", surfaces: "layered", syntaxPalette: "original" }, "layered", "original"],
    [{ theme: "graphite", surfaces: "lighter", syntaxPalette: 3 }, "unified", "softened"],
    [{ theme: "charcoal", surfaces: "layered", syntaxPalette: "original" }, undefined, undefined],
    [{ theme: "midnight", surfaces: "layered" }, undefined, undefined],
  ])(
    "with %j stored, sets data-surfaces %s and data-syntax %s as the editor does",
    (stored, surfaces, syntax) => {
      const root = load(JSON.stringify(stored), false).dom.window.document
        .documentElement;
      expect(root.dataset["surfaces"]).toBe(surfaces);
      expect(root.dataset["syntax"]).toBe(syntax);
      const appearance = resolveAppearance(
        resolveTheme(stored.theme, false),
        stored.surfaces === "layered" ? "layered" : "unified",
        stored.syntaxPalette === "original" ? "original" : "softened",
      );
      expect(appearance.surfaces).toBe(surfaces);
      expect(appearance.syntax).toBe(syntax);
    },
  );

  it("reads the preference and sets data-theme before any stylesheet is in the document", () => {
    const { dom, seen } = load(JSON.stringify({ theme: "chalk" }), false);
    expect(dom.window.document.documentElement.dataset["theme"]).toBe("chalk");
    expect(seen.stylesheetsWhenRead).toBe(0);
  });

  it("runs its script ahead of every stylesheet and style in document order", () => {
    const doc = new JSDOM(servedPage()).window.document;
    const script = doc.getElementById("theme-pre-paint")!;
    expect(script).toBeTruthy();
    const styles = [...doc.querySelectorAll('link[rel="stylesheet"], style')];
    expect(styles.length).toBeGreaterThan(1);
    for (const style of styles) {
      expect(
        script.compareDocumentPosition(style) &
          doc.defaultView!.Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("leaves the colour scheme to the theme stylesheet", () => {
    expect(DOCUMENT_HTML).not.toMatch(/name="color-scheme"/);
  });
});
