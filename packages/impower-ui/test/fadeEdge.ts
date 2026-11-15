import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const IMPOWER_UI_SRC = join(dirname(fileURLToPath(import.meta.url)), "../src");

const flattenRules = (rules: CSSRuleList, out: CSSStyleRule[] = []) => {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      out.push(rule);
    } else if ("cssRules" in rule) {
      flattenRules((rule as CSSGroupingRule).cssRules, out);
    }
  }
  return out;
};

export const compiledRules = async (elements: Element[]) => {
  const compiler = await compile(
    readFileSync(join(IMPOWER_UI_SRC, "style.css"), "utf8"),
    { base: IMPOWER_UI_SRC, onDependency: () => {} },
  );
  const classes = elements.flatMap((element) => Array.from(element.classList));
  const style = document.createElement("style");
  style.textContent = optimize(compiler.build(classes), { minify: false }).code;
  document.head.append(style);
  const rules = flattenRules(style.sheet!.cssRules);
  style.remove();
  return rules;
};

export const applied = (rules: CSSStyleRule[], element: Element, property: string) =>
  rules
    .filter((rule) => {
      try {
        return element.matches(rule.selectorText);
      } catch {
        return false;
      }
    })
    .map((rule) => rule.style.getPropertyValue(property))
    .filter(Boolean);

export const edgeTreatment = async (elements: Element[]) => {
  const rules = await compiledRules(elements);
  return elements.map((element) => ({
    text: element.textContent,
    masked: applied(rules, element, "mask-image").some((value) => value.includes("gradient")),
    ellipsis: applied(rules, element, "text-overflow").includes("ellipsis"),
  }));
};

export const byText = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll<HTMLElement>("*")).findLast(
    (element) => element.textContent?.trim() === text,
  );
