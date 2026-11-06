import { compile, optimize } from "@tailwindcss/node";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const styleRules = (
  rules: CSSRuleList,
  media: string[] = [],
  out: { rule: CSSStyleRule; media: string[] }[] = [],
) => {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      out.push({ rule, media });
      if (rule.cssRules) styleRules(rule.cssRules, media, out);
    } else if (rule instanceof CSSMediaRule) {
      styleRules(rule.cssRules, [...media, rule.conditionText], out);
    } else if ("cssRules" in rule) {
      styleRules((rule as CSSGroupingRule).cssRules, media, out);
    }
  }
  return out;
};

const compiled = async (classes: string[]) => {
  const source = await readFile(resolve(__dirname, "../src/style.css"), "utf8");
  const compiler = await compile(source, {
    base: resolve(__dirname, "../src"),
    onDependency: () => {},
  });
  const css = optimize(compiler.build(classes), { minify: false }).code;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const rules = styleRules(style.sheet!.cssRules);
  style.remove();
  return rules;
};

it("centres a 44px coarse-pointer input over a smaller inline-hit box", async () => {
  const rules = await compiled(["inline-hit"]);
  const box = rules.find(
    ({ rule }) => rule.selectorText === ".inline-hit",
  )!.rule;
  expect(box.style.getPropertyValue("display")).toBe("flex");
  expect(box.style.getPropertyValue("align-items")).toBe("center");
  expect(box.style.getPropertyValue("position")).toBe("relative");

  const input = rules.find(({ rule }) =>
    /^(\.inline-hit\s*>\s*input|&\s*>\s*input)$/.test(rule.selectorText),
  )!.rule;
  expect(input.style.getPropertyValue("height")).toBe("100%");
  expect(input.style.getPropertyValue("flex")).toMatch(/^none|0 0 auto$/);
  expect(input.style.getPropertyValue("max-width")).toBe("100%");

  const target = rules.find(
    ({ rule, media }) =>
      media.some((m) => m.includes("pointer: coarse")) &&
      rule.style.getPropertyValue("min-height") === "44px" &&
      rule.selectorText.includes("input:not("),
  );
  expect(target).toBeDefined();
});
