import { compile, optimize } from "@tailwindcss/node";

const SPACING_PX = 4;
const REM_PX = 16;

const resolveLength = (value: string): number | null => {
  const text = value.trim();
  const spacing = /^calc\(var\(--spacing\)\s*\*\s*([\d.]+)\)$/.exec(text);
  if (spacing) {
    return Number(spacing[1]) * SPACING_PX;
  }
  const px = /^([\d.]+)px$/.exec(text);
  if (px) {
    return Number(px[1]);
  }
  const rem = /^([\d.]+)rem$/.exec(text);
  if (rem) {
    return Number(rem[1]) * REM_PX;
  }
  return null;
};

const styleRules = (rules: CSSRuleList, out: CSSStyleRule[] = []): CSSStyleRule[] => {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      out.push(rule);
    } else if ("cssRules" in rule) {
      styleRules((rule as CSSGroupingRule).cssRules, out);
    }
  }
  return out;
};

const compileFor = async (classes: string[]): Promise<CSSStyleRule[]> => {
  const compiler = await compile(
    '@import "tailwindcss/theme";\n@import "tailwindcss/utilities";',
    { base: process.cwd(), onDependency: () => {} },
  );
  const css = optimize(compiler.build(classes), { minify: false }).code;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const rules = styleRules(style.sheet!.cssRules);
  style.remove();
  return rules;
};

export type HitArea = { width: number; height: number };

export const hitArea = async (element: Element): Promise<HitArea> => {
  const classes = Array.from(element.classList);
  const rules = (await compileFor(classes)).filter((rule) => {
    if (/:|\[/.test(rule.selectorText.replace(/\\./g, ""))) {
      return false;
    }
    try {
      return element.matches(rule.selectorText);
    } catch {
      return false;
    }
  });
  const largest = (properties: string[]): number => {
    let best = 0;
    for (const rule of rules) {
      for (const property of properties) {
        const length = resolveLength(rule.style.getPropertyValue(property));
        if (length !== null && length > best) {
          best = length;
        }
      }
    }
    return best;
  };
  return {
    width: largest(["width", "min-width"]),
    height: largest(["height", "min-height"]),
  };
};
