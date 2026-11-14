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

const compileText = async (classes: string[]): Promise<string> => {
  const compiler = await compile(
    '@import "tailwindcss/theme";\n@import "tailwindcss/utilities";',
    { base: process.cwd(), onDependency: () => {} },
  );
  return optimize(compiler.build(classes), { minify: false }).code;
};

const compileFor = async (classes: string[]): Promise<CSSStyleRule[]> => {
  const css = await compileText(classes);
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const rules = styleRules(style.sheet!.cssRules);
  style.remove();
  return rules;
};

export type HitArea = { width: number; height: number };

export type BlockExtent = { height: number; marginTop: number; marginBottom: number };

const resolveMargin = (value: string | undefined): number => {
  const text = (value ?? "").trim();
  const negated = /^calc\((.+?)\s*\*\s*-1\)$/.exec(text);
  if (negated) {
    return -(resolveLength(negated[1]!) ?? 0);
  }
  if (text.startsWith("-")) {
    return -(resolveLength(text.slice(1)) ?? 0);
  }
  return resolveLength(text) ?? 0;
};

export const blockExtent = async (element: Element): Promise<BlockExtent> => {
  const classes = Array.from(element.classList);
  const own = new Set(classes.map((name) => `.${name}`));
  const declared = new Map<string, string>();
  for (const [, selector, body] of (await compileText(classes)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!own.has(selector!.trim().replace(/\\/g, ""))) {
      continue;
    }
    for (const declaration of body!.split(";")) {
      const colon = declaration.indexOf(":");
      if (colon > 0) {
        declared.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
      }
    }
  }
  const cascaded = (property: string) => declared.get(property);
  const block = cascaded("margin-block");
  const height = resolveLength(cascaded("height") ?? "") ?? 0;
  const min = resolveLength(cascaded("min-height") ?? "") ?? 0;
  return {
    height: Math.max(height, min),
    marginTop: resolveMargin(cascaded("margin-top") ?? block),
    marginBottom: resolveMargin(cascaded("margin-bottom") ?? block),
  };
};

const cascadeOf =
  (rules: CSSStyleRule[]) =>
  (property: string): string | undefined => {
    let value: string | undefined;
    for (const rule of rules) {
      const declared = rule.style.getPropertyValue(property);
      if (declared) {
        value = declared;
      }
    }
    return value;
  };

const matchingRules = async (element: Element): Promise<CSSStyleRule[]> =>
  (await compileFor(Array.from(element.classList))).filter((rule) => {
    if (/:|\[/.test(rule.selectorText.replace(/\\./g, ""))) {
      return false;
    }
    try {
      return element.matches(rule.selectorText);
    } catch {
      return false;
    }
  });

export const hitArea = async (element: Element): Promise<HitArea> => {
  const cascaded = cascadeOf(await matchingRules(element));
  const used = (axis: "width" | "height"): number => {
    const size = resolveLength(cascaded(axis) ?? "") ?? 0;
    const min = resolveLength(cascaded(`min-${axis}`) ?? "") ?? 0;
    const max = resolveLength(cascaded(`max-${axis}`) ?? "") ?? Number.POSITIVE_INFINITY;
    return Math.max(min, Math.min(size, max));
  };
  return {
    width: used("width"),
    height: used("height"),
  };
};
