import { compile, optimize } from "@tailwindcss/node";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";

type Rule = { selector: string; style: CSSStyleDeclaration; media: string[] };

const styleRules = (
  rules: CSSRuleList,
  media: string[] = [],
  parent = "",
  out: Rule[] = [],
) => {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      const selector = parent
        ? rule.selectorText.includes("&")
          ? rule.selectorText.replace(/&/g, parent)
          : `${parent} ${rule.selectorText}`
        : rule.selectorText;
      out.push({ selector, style: rule.style, media });
      if (rule.cssRules) styleRules(rule.cssRules, media, selector, out);
    } else if (rule instanceof CSSMediaRule) {
      styleRules(rule.cssRules, [...media, rule.conditionText], parent, out);
    } else if ("cssRules" in rule) {
      styleRules((rule as CSSGroupingRule).cssRules, media, parent, out);
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

const matching = (rules: Rule[], element: Element) =>
  rules.filter(({ selector }) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  });

const declaring = (rules: Rule[], property: string) =>
  rules
    .filter(({ style }) => style.getPropertyValue(property))
    .map(({ style, media }) => ({
      value: style.getPropertyValue(property),
      coarse: media.some((m) => m.includes("pointer: coarse")),
    }));

it("centres an inline-hit box's input so the coarse-pointer 44px target overflows it evenly", async () => {
  const box = document.createElement("span");
  box.className = "inline-hit";
  const input = box.appendChild(document.createElement("input"));
  input.type = "text";
  document.body.append(box);

  const rules = await compiled(["inline-hit"]);
  const onBox = matching(rules, box);
  expect(declaring(onBox, "display")).toContainEqual({
    value: "flex",
    coarse: false,
  });
  expect(declaring(onBox, "align-items")).toContainEqual({
    value: "center",
    coarse: false,
  });

  const onInput = matching(rules, input);
  expect(declaring(onInput, "height")).toEqual([
    { value: "100%", coarse: false },
  ]);
  expect(declaring(onInput, "flex").map(({ value }) => value)).toEqual([
    expect.stringMatching(/^(none|0 0 auto)$/),
  ]);
  expect(declaring(onInput, "min-height")).toEqual([
    { value: "44px", coarse: true },
  ]);
  expect(declaring(onInput, "max-height")).toEqual([]);

  box.remove();
});
