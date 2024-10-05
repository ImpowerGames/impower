import { getCSSPropertyKeyValue } from "./getCSSPropertyKeyValue";
import { getCSSPropertyName } from "./getCSSPropertyName";

const CLASS_REGEX = /^[\p{L}0-9_-]+$/u;

export const getStyleContent = (
  styles: Record<string, any>,
  options?: {
    breakpoints?: Record<string, number>;
    scope?: string;
  }
): string => {
  const breakpoints = options?.breakpoints;
  const scope = options?.scope;
  let textContent = "";
  Object.entries(styles).forEach(([name, style]) => {
    let styleContent = "";
    const nestedEntries: [string, any][] = [];
    Object.entries(style).forEach(([k, v]) => {
      if (!k.startsWith("$") && k !== "target") {
        if (v && typeof v === "object" && !("$name" in v)) {
          nestedEntries.push([k, v]);
        } else {
          const [cssProp, cssValue] = getCSSPropertyKeyValue(k, v);
          if (cssValue) {
            styleContent += `\n  ${cssProp}: ${cssValue};`;
          }
        }
      }
    });
    // Process Nested CSS
    nestedEntries.forEach(([k, v]) => {
      const target =
        (v as any)["target"] ||
        (breakpoints?.[k] != null
          ? `@container (max-width: ${breakpoints?.[k]}px)`
          : getCSSPropertyName(k));
      const selector = target.match(CLASS_REGEX) ? `.${target}` : target;
      let nestedStyleContent = "";
      Object.entries(v).forEach(([nk, nv]) => {
        if (!nk.startsWith("$")) {
          const [cssProp, cssValue] = getCSSPropertyKeyValue(nk, nv);
          if (cssValue) {
            nestedStyleContent += `\n    ${cssProp}: ${cssValue};`;
          }
        }
      });
      nestedStyleContent = nestedStyleContent.trim();
      if (nestedStyleContent) {
        styleContent += `\n  ${selector} {\n    ${nestedStyleContent}\n  }\n`;
      }
    });
    // Concatenate all
    styleContent = styleContent.trim();
    if (styleContent) {
      const target = style["target"] || name;
      const selector = target.match(CLASS_REGEX) ? `.${target}` : target;
      textContent += `${scope} ${selector} {\n  ${styleContent}\n}\n`;
    }
  });
  textContent = textContent.trim();
  return textContent;
};
