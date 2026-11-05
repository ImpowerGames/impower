import { compile, optimize } from "@tailwindcss/node";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../src");
const IMPOWER_UI_SRC = path.resolve(HERE, "../../../packages/impower-ui/src");

const PAGE_STYLESHEETS = [
  path.join(SRC, "public/document.css"),
  path.join(SRC, "modules/spark-editor/styles/normalize/normalize.css"),
  path.join(SRC, "modules/spark-editor/styles/theme/theme.css"),
  path.join(IMPOWER_UI_SRC, "theme.css"),
];

const ROOT_FONT_SIZE_PX = 16;

const compiledImpowerUi = async (classes: string[]): Promise<string> => {
  const source = fs.readFileSync(path.join(IMPOWER_UI_SRC, "style.css"), "utf8");
  const compiler = await compile(source, { base: IMPOWER_UI_SRC, onDependency: () => {} });
  return optimize(compiler.build(classes), { minify: false }).code;
};

const styleRules = (rules: CSSRuleList, out: CSSStyleRule[] = []): CSSStyleRule[] => {
  for (const rule of Array.from(rules)) {
    if ("selectorText" in rule && "style" in rule) {
      out.push(rule as CSSStyleRule);
    } else if ("cssRules" in rule) {
      styleRules((rule as CSSGroupingRule).cssRules, out);
    }
  }
  return out;
};

const rootFontSizes = (css: string): { selector: string; fontSize: string }[] => {
  const dom = new JSDOM(`<!doctype html><html><head><style></style></head><body></body></html>`);
  const style = dom.window.document.querySelector("style")!;
  style.textContent = css;
  const root = dom.window.document.documentElement;
  const rules = styleRules(style.sheet!.cssRules);
  return THEMES.flatMap((theme) => {
    root.setAttribute("data-theme", theme);
    return rules
      .filter((rule) => {
        try {
          return root.matches(rule.selectorText);
        } catch {
          return false;
        }
      })
      .map((rule) => ({
        selector: rule.selectorText,
        fontSize: rule.style.getPropertyValue("font-size") || rule.style.getPropertyValue("font"),
      }))
      .filter(({ fontSize }) => fontSize !== "");
  });
};

const THEMES = ["charcoal", "chalk", "ink", "paper", "graphite", "warm", "midnight", "dusk"];

describe("the editor document's root font size", () => {
  it.each(PAGE_STYLESHEETS.map((file) => [path.relative(path.resolve(HERE, "../../.."), file).split(path.sep).join("/"), file]))(
    "is left at 16px by %s",
    (_name, file) => {
      const offending = rootFontSizes(fs.readFileSync(file, "utf8")).filter(
        ({ fontSize }) => fontSize !== `${ROOT_FONT_SIZE_PX}px` && fontSize !== "100%",
      );
      expect(offending).toEqual([]);
    },
  );

  it("is left at 16px by impower-ui's compiled stylesheet", async () => {
    const css = await compiledImpowerUi(["min-h-11", "size-11"]);
    const rootBlocks = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
      .filter(([, selectors]) =>
        selectors!.split(",").some((selector) => /^\s*(html|:root)\b/.test(selector.trim()) || /^\s*:where\(:root/.test(selector.trim())),
      )
      .map(([, selectors, body]) => ({ selectors: selectors!.trim(), fontSize: /(?:^|;)\s*font-size:\s*([^;]+)/.exec(body!)?.[1]?.trim() }))
      .filter(({ fontSize }) => fontSize !== undefined);
    expect(rootBlocks.filter(({ fontSize }) => fontSize !== `${ROOT_FONT_SIZE_PX}px` && fontSize !== "100%")).toEqual([]);
    expect(css).toMatch(/(^|[\s,])(html|:root)[^{]*\{/);
  });

  it("keeps the interface type at 14px on body, as #990 set it", () => {
    const dom = new JSDOM(`<!doctype html><html><head><style></style></head><body></body></html>`);
    const style = dom.window.document.querySelector("style")!;
    style.textContent = fs.readFileSync(PAGE_STYLESHEETS[0]!, "utf8");
    const body = dom.window.document.body;
    const sizes = styleRules(style.sheet!.cssRules)
      .filter((rule) => {
        try {
          return body.matches(rule.selectorText) && !dom.window.document.documentElement.matches(rule.selectorText);
        } catch {
          return false;
        }
      })
      .map((rule) => rule.style.getPropertyValue("font-size"))
      .filter(Boolean);
    expect(sizes).toContain("14px");
  });

  it("resolves Tailwind's min-h-11 and size-11 to 44px against that root", async () => {
    const css = await compiledImpowerUi(["min-h-11", "size-11"]);
    const spacing = /--spacing:\s*([\d.]+)rem/.exec(css);
    expect(spacing, "the --spacing theme variable").not.toBeNull();
    const spacingPx = Number(spacing![1]) * ROOT_FONT_SIZE_PX;
    const minHeight = /\.min-h-11\s*\{\s*min-height:\s*calc\(var\(--spacing\)\s*\*\s*11\)/.exec(css);
    const size = /\.size-11\s*\{\s*width:\s*calc\(var\(--spacing\)\s*\*\s*11\);\s*height:\s*calc\(var\(--spacing\)\s*\*\s*11\)/.exec(css);
    expect(minHeight, "min-h-11 as 11 spacing steps").not.toBeNull();
    expect(size, "size-11 as 11 spacing steps").not.toBeNull();
    expect(spacingPx * 11).toBe(44);
  });
});
