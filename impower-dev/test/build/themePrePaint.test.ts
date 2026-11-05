// @vitest-environment node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import staticallyRenderPage from "../../src/build/staticallyRenderPage";
import { withThemeColor } from "../../src/build/themeColor";
import {
  LIGHT_SCHEME_QUERY,
  resolveTheme,
} from "../../src/modules/spark-editor/workspace/settings/applyTheme";
import { PREFERENCES_STORAGE_KEY } from "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings";
import { staticallyStylePage } from "../../vite.config";

const DOCUMENT_HTML = fs.readFileSync(
  fileURLToPath(new URL("../../src/public/document.html", import.meta.url)),
  "utf-8",
);

const servedPage = () =>
  staticallyStylePage(
    staticallyRenderPage(withThemeColor(DOCUMENT_HTML, "#000000"), {
      html: '<div id="root"></div>',
      mjsPath: "/src/pages/index.ts",
    }),
    ':root, [data-theme="midnight"] { --bg: #000000; }',
  );

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
  ["Midnight", JSON.stringify({ theme: "midnight" }), "midnight"],
  ["a theme the editor does not offer", JSON.stringify({ theme: "ink" }), "ink"],
  ["malformed preferences", "{", ""],
  ["a non-object", "null", ""],
];

describe("the document's theme before first paint", () => {
  for (const [label, stored, preference] of STORED) {
    for (const prefersLight of [true, false]) {
      it(`with ${label} and a ${prefersLight ? "light" : "dark"} device, sets the theme the editor resolves`, () => {
        const { dom } = load(stored, prefersLight);
        expect(dom.window.document.documentElement.dataset["theme"]).toBe(
          resolveTheme(preference, prefersLight),
        );
      });
    }
  }

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
