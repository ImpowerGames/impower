import { compile, optimize } from "@tailwindcss/node";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMPOWER_UI_SRC = path.resolve(HERE, "../../../packages/impower-ui/src");

const THEMES = ["charcoal", "chalk", "ink", "paper", "graphite", "warm", "midnight", "dusk"];

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

const sheet = (css: string) => {
  const dom = new JSDOM(`<!doctype html><html><head><style></style></head><body><div></div></body></html>`);
  const style = dom.window.document.querySelector("style")!;
  style.textContent = css;
  return { dom, rules: styleRules(style.sheet!.cssRules) };
};

const compiled = async (classes: string[]) => {
  const source = fs.readFileSync(path.join(IMPOWER_UI_SRC, "style.css"), "utf8");
  const compiler = await compile(source, { base: IMPOWER_UI_SRC, onDependency: () => {} });
  return optimize(compiler.build(classes), { minify: false }).code;
};

const utilityValue = (css: string, className: string, property: string) => {
  const block = new RegExp(`(?:^|[\\s}])\\.${className}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  return new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+);`).exec(block)?.[1].trim() ?? "";
};

const resolve = (value: string, theme: string, depth = 0): string => {
  const match = /^var\((--[\w-]+)\)$/.exec(value);
  if (!match || depth > 8) return value;
  const { dom, rules } = sheet(fs.readFileSync(path.join(IMPOWER_UI_SRC, "theme.css"), "utf8"));
  const root = dom.window.document.documentElement;
  root.setAttribute("data-theme", theme);
  let found = "";
  for (const rule of rules) {
    let applies = false;
    try {
      applies = root.matches(rule.selectorText);
    } catch {
      applies = false;
    }
    const declared = rule.style.getPropertyValue(match[1]).trim();
    if (applies && declared) found = declared;
  }
  return found ? resolve(found, theme, depth + 1) : value;
};

describe("the preview card's inset and radius tokens", () => {
  it("compiles px-preview-inline to 10px of inline padding in every theme", async () => {
    const css = await compiled(["px-preview-inline"]);
    const value = utilityValue(css, "px-preview-inline", "padding-inline");
    expect(value).not.toBe("");
    for (const theme of THEMES) {
      expect(resolve(value, theme), theme).toBe("10px");
    }
  });

  it("compiles rounded-preview-frame to a 10px radius in every theme", async () => {
    const css = await compiled(["rounded-preview-frame"]);
    const value = utilityValue(css, "rounded-preview-frame", "border-radius");
    expect(value).not.toBe("");
    for (const theme of THEMES) {
      expect(resolve(value, theme), theme).toBe("10px");
    }
  });

  it("compiles pt-preview-stage-gap to an 8px gap above the card in every theme", async () => {
    const css = await compiled(["pt-preview-stage-gap"]);
    const value = utilityValue(css, "pt-preview-stage-gap", "padding-top");
    expect(value).not.toBe("");
    for (const theme of THEMES) {
      expect(resolve(value, theme), theme).toBe("8px");
    }
  });

  it("compiles shadow-preview-frame to the prototype's frame shadow in Chalk and Paper and to none elsewhere", async () => {
    const css = await compiled(["shadow-preview-frame"]);
    const value = utilityValue(css, "shadow-preview-frame", "--tw-shadow");
    expect(value).not.toBe("");
    const shadow = /var\((--[\w-]+)\)/.exec(value)?.[0] ?? value;
    for (const theme of THEMES) {
      const lit = theme === "chalk" || theme === "paper";
      expect(resolve(shadow, theme), theme).toBe(lit ? "0 10px 30px rgb(0 0 0 / 0.16)" : "none");
    }
  });
});
