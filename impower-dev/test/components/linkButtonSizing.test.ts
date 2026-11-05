import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";

const SIZES = [undefined, "default", "sm", "xs", "lg", "icon", "icon-lg", "fab"] as const;

const BOX_PROPERTIES = [
  "height",
  "width",
  "padding",
  "padding-inline",
  "padding-block",
  "padding-left",
  "padding-right",
  "padding-top",
  "padding-bottom",
];

const themeBlock = (): string => {
  const source = readFileSync(resolve("../packages/impower-ui/src/style.css"), "utf8");
  const start = source.indexOf("@theme {");
  const end = source.indexOf("\n}\n", start);
  if (start < 0 || end < 0) {
    throw new Error("@theme block not found in impower-ui style.css");
  }
  return source.slice(start, end + 2);
};

const boxDeclarations = async (classes: string[]): Promise<string[]> => {
  const input = `@import "tailwindcss/theme";\n@import "tailwindcss/utilities";\n${themeBlock()}`;
  const compiler = await compile(input, { base: process.cwd(), onDependency: () => {} });
  const css = optimize(compiler.build(classes), { minify: false }).code;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const out: string[] = [];
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        if (/:(hover|active|focus)/.test(rule.selectorText) || /::?(before|after)\b/.test(rule.selectorText)) {
          continue;
        }
        for (const property of BOX_PROPERTIES) {
          const value = rule.style.getPropertyValue(property);
          if (value) {
            out.push(`${rule.selectorText} { ${property}: ${value} }`);
          }
        }
      } else if ("cssRules" in rule) {
        walk((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  walk(style.sheet!.cssRules);
  return out;
};

const renderedClasses = async (size: (typeof SIZES)[number]): Promise<string[]> => {
  const { Button } = await import("@impower/impower-ui/components");
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => {
    render(h(Button, size ? { variant: "link", size } : { variant: "link" }, "Text"), host);
  });
  return host.querySelector("button")!.className.split(/\s+/).filter(Boolean);
};

describe("link Button sizing", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  it.each(SIZES)("size %s sizes to its content with no padding", async (size) => {
    const classes = await renderedClasses(size);
    const declarations = await boxDeclarations(classes);
    expect(declarations.length).toBeGreaterThan(0);
    expect(
      declarations.filter((declaration) => !/:\s*(auto|0|0px|calc\(var\(--spacing\)\s*\*\s*0\))\s*}$/.test(declaration)),
    ).toEqual([]);
  });
});
