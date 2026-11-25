import {
  DATA_ATTRIBUTE_PROPS,
  ARIA_ATTRIBUTE_ALIASES,
} from "../../../sparkdown/src/compiler/constants/dataAttributeProps";
import { getCssEquivalent } from "../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import type { ThemeVariables } from "../../../sparkle-style-transformer/src/types/themeVariables";
import { getCssPropertyName } from "../../../sparkle-style-transformer/src/utils/getCssPropertyName";
import {
  anchorSelfTargeted,
  COLOR_SCHEME_ATTRIBUTE,
  SHOWING_ATTRIBUTE,
  writeSparkleSelector,
  writeSparkleSelectorChecked,
} from "../../../sparkle-style-transformer/src/utils/sparkleSelector";
import { escapeCssIdentifier } from "../../../sparkle-style-transformer/src/utils/themeVariableName";
import { getCssTokenValue } from "./getCssTokenValue";

export { anchorSelfTargeted, COLOR_SCHEME_ATTRIBUTE, SHOWING_ATTRIBUTE };

const attributeName = (name: string): string =>
  ARIA_ATTRIBUTE_ALIASES.get(name) ?? (DATA_ATTRIBUTE_PROPS.has(name) ? `data-${name}` : name);

export function getCSSSelector(
  selector: string,
  breakpoints: Record<string, number>,
): string {
  return writeSparkleSelector(selector, { breakpoints, colorScheme: "attribute", attributeName });
}

export const getStyleContent = (
  styles: Record<string, any>,
  options: {
    breakpoints: Record<string, number>;
    scope?: string;
    theme: ThemeVariables;
  },
): string => {
  const scope = options.scope;
  const scopeSelector = scope ? scope + " " : "";
  let textContent = "";
  Object.entries(styles).forEach(([name, style]) => {
    let styleContent = "";
    let level = 1;
    const process = (k: string, v: unknown, afterCombinator = false) => {
      const indent = "  ".repeat(level);
      if (!k.startsWith("$")) {
        if (v && typeof v === "object" && !("$name" in v)) {
          const written = writeSparkleSelectorChecked(k, {
            breakpoints: options.breakpoints,
            colorScheme: "attribute",
            attributeName,
            afterCombinator,
          });
          if (written.refusals.length > 0) {
            return;
          }
          const selfTargetedSelector = anchorSelfTargeted(written.css);
          styleContent += `\n${indent}${selfTargetedSelector} {`;
          level++;
          Object.entries(v).forEach(([nk, nv]) => {
            process(nk, nv, written.afterCombinator);
          });
          level--;
          styleContent += `\n${indent}}`;
        } else {
          const value = getCssTokenValue(v);
          if (
            (value != null && String(value) !== "") ||
            getCssPropertyName(k) === "content"
          ) {
            const cssEntries = getCssEquivalent(k, value, options.theme);
            for (const [k, v] of cssEntries) {
              styleContent += `\n${indent}${escapeCssIdentifier(k)}: ${v};`;
            }
          }
        }
      }
    };
    Object.entries(style).forEach(([k, v]) => {
      process(k, v);
    });
    styleContent = styleContent.trim();
    if (styleContent) {
      const elementSelector = getCSSSelector(name, options.breakpoints);
      textContent += `${scopeSelector}${elementSelector} {\n  ${styleContent}\n}\n`;
    }
  });
  textContent = textContent.trim();
  return textContent;
};
