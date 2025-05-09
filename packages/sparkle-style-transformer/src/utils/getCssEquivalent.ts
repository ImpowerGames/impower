import CSS_UTILITIES from "../constants/CSS_UTILITIES.js";
import STYLE_ALIASES from "../constants/STYLE_ALIASES.js";
import STYLE_TRANSFORMERS from "../constants/STYLE_TRANSFORMERS.js";

export const getCssEquivalent = (
  key: string,
  value: unknown,
  includeUnrecognized = true
): [cssPropName: string, cssPropValue: string][] => {
  const styleAliases: Record<string, string> = STYLE_ALIASES;

  const styleTransformers: Record<string, (v: string) => string> =
    STYLE_TRANSFORMERS;

  const cssUtilities: Record<
    string,
    Record<string, Record<string, string>>
  > = CSS_UTILITIES;

  const entries: [string, string][] = [];

  const sparklePropName: string = styleAliases[key] ?? key;
  const cssUtility = cssUtilities[sparklePropName];
  if (cssUtility) {
    const defaultSelector = cssUtility[""];
    if (defaultSelector) {
      for (let [k, v] of Object.entries(defaultSelector)) {
        if (v === "") {
          const transformer = styleTransformers[sparklePropName];
          if (transformer) {
            v = transformer(String(value));
          }
        }
        if (v) {
          entries.push([k, v]);
        }
      }
    }
    const valueSelector = cssUtility[String(value)];
    if (valueSelector) {
      for (let [k, v] of Object.entries(valueSelector)) {
        if (v === "") {
          const transformer = styleTransformers[sparklePropName];
          if (transformer) {
            v = transformer(String(value));
          }
        }
        if (v) {
          entries.push([k, v]);
        }
      }
    }
  } else if (includeUnrecognized) {
    entries.push([key, String(value)]);
  }

  return entries;
};
