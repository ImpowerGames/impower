import { compile, optimize } from "@tailwindcss/node";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const SRC = path.resolve(HERE, "../../src");
const IMPOWER_UI_SRC = path.resolve(REPO, "packages/impower-ui/src");

const PAGE_STYLESHEETS = [
  path.join(SRC, "public/document.css"),
  path.join(SRC, "modules/spark-editor/styles/normalize/normalize.css"),
  path.join(SRC, "modules/spark-editor/styles/theme/theme.css"),
  path.join(IMPOWER_UI_SRC, "theme.css"),
];

const PAGE_ROOTS = ["html", "body", "main"];

const PLAIN_ELEMENTS = ["div", "span", "p", "h3", "li", "button", "img", "input", "textarea", "nav", "section"];

const OVERSCROLL = /^overscroll-behavior(-[xy]|-block|-inline)?$/;

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

const overscrollRules = (css: string) => {
  const dom = new JSDOM(
    `<!doctype html><html><head><style></style></head><body><main>${PLAIN_ELEMENTS.map((tag) => `<${tag}></${tag}>`).join("")}</main></body></html>`,
  );
  const document = dom.window.document;
  document.querySelector("style")!.textContent = css;
  const plain = PLAIN_ELEMENTS.map((tag) => document.querySelector(`main > ${tag}`)!);
  const roots = PAGE_ROOTS.map((tag) => document.querySelector(tag)!);
  return styleRules(document.querySelector("style")!.sheet!.cssRules)
    .filter((rule) => Array.from(rule.style).some((property) => OVERSCROLL.test(property)))
    .map((rule) => {
      const matches = (el: Element) => {
        try {
          return el.matches(rule.selectorText);
        } catch {
          return false;
        }
      };
      return {
        selector: rule.selectorText,
        value: rule.style.getPropertyValue("overscroll-behavior"),
        plain: plain.filter(matches).map((el) => el.tagName.toLowerCase()),
        roots: roots.filter(matches).map((el) => el.tagName.toLowerCase()),
      };
    });
};

const relative = (file: string) => path.relative(REPO, file).split(path.sep).join("/");

describe("where the editor page sets overscroll-behavior", () => {
  it.each(PAGE_STYLESHEETS.map((file) => [relative(file), file]))(
    "%s sets it on no universal or element-wide selector, so a clipped box inside a list never ends the list's scroll chain",
    (_name, file) => {
      const offending = overscrollRules(fs.readFileSync(file, "utf8")).filter(({ plain }) => plain.length > 0);
      expect(offending).toEqual([]);
    },
  );

  it("keeps the page itself from bouncing: html, body and main stop the chain", () => {
    const rules = overscrollRules(fs.readFileSync(PAGE_STYLESHEETS[0]!, "utf8"));
    for (const root of PAGE_ROOTS) {
      expect(
        rules.some((rule) => rule.roots.includes(root) && rule.value === "none"),
        `${root} has overscroll-behavior: none`,
      ).toBe(true);
    }
  });

  it("impower-ui's compiled stylesheet sets it on no universal or bare element selector", async () => {
    const source = fs.readFileSync(path.join(IMPOWER_UI_SRC, "style.css"), "utf8");
    const compiler = await compile(source, { base: IMPOWER_UI_SRC, onDependency: () => {} });
    const css = optimize(compiler.build(["overscroll-contain", "overflow-y-auto", "truncate"]), { minify: false }).code;
    const selectors = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /(^|[;\s])overscroll-behavior(-[a-z]+)?\s*:/.test(body!))
      .flatMap(([, list]) => list!.split(",").map((selector) => selector.trim()));
    const lastCompound = (selector: string) =>
      selector
        .split(/[\s>+~]+/)
        .pop()!
        .replace(/::?[a-z-]+(\([^)]*\))?/g, "");
    const offending = selectors.filter((selector) => {
      const compound = lastCompound(selector);
      return (compound === "" || compound === "*" || /^[a-z][a-z0-9-]*$/.test(compound)) && ![...PAGE_ROOTS, ":root"].includes(selector);
    });
    expect(offending).toEqual([]);
    expect(selectors).toContain(".overscroll-contain");
  });
});
