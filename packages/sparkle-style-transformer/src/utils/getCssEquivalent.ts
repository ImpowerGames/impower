import { CSS_ALIASES } from "../constants/CSS_ALIASES.js";
import { CSS_UTILITIES } from "../constants/CSS_UTILITIES.js";
import { STYLE_ALIASES } from "../constants/STYLE_ALIASES.js";
import { STYLE_TRANSFORMERS } from "../constants/STYLE_TRANSFORMERS.js";
import { getCssPropertyName } from "./getCssPropertyName.js";

const LENGTH_PROPERTY_SUFFIX = /-(width|height|top|bottom|left|right)$/;

const CSS_WIDE_KEYWORDS = new Set([
  "initial",
  "inherit",
  "unset",
  "revert",
  "revert-layer",
]);

const keep = (v: string) => v;

const isNumber = (value: unknown): boolean => !Number.isNaN(Number(value));

const getCssValueText = (value: unknown): string => {
  if (value == null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(" ");
  }
  if (typeof value === "object") {
    return "";
  }
  return String(value);
};

const getUnrecognizedCssValue = (name: string, value: unknown): string => {
  if (LENGTH_PROPERTY_SUFFIX.test(name)) {
    if (Array.isArray(value)) {
      return value.map((x) => (isNumber(x) ? `${x}px` : x)).join(" ");
    }
    if (
      typeof value === "number" ||
      (typeof value === "string" && value && isNumber(value))
    ) {
      return `${value}px`;
    }
  }
  return getCssValueText(value);
};

export const getSparklePropertyName = (key: string): string => {
  const aliases: Record<string, string> = {
    ...STYLE_ALIASES,
    ...CSS_ALIASES,
  };
  const name = getCssPropertyName(key);
  return aliases[name] ?? name;
};

export const getCssEquivalent = (
  key: string,
  value: unknown,
  includeUnrecognized = true,
): [cssPropName: string, cssPropValue: string][] => {
  const styleTransformers: Record<string, (v: string) => string> =
    STYLE_TRANSFORMERS;

  const cssUtilities: Record<
    string,
    Record<string, Record<string, string>>
  > = CSS_UTILITIES;

  const entries: [string, string][] = [];

  const sparklePropName = getSparklePropertyName(key);
  const cssUtility = cssUtilities[sparklePropName];
  const text = getCssValueText(value);
  const resolve = CSS_WIDE_KEYWORDS.has(text)
    ? keep
    : (styleTransformers[sparklePropName] ?? keep);
  if (cssUtility) {
    const defaultSelector = cssUtility[""];
    if (defaultSelector) {
      for (let [k, v] of Object.entries(defaultSelector)) {
        if (v === "") {
          v = resolve(text);
        }
        if (v) {
          entries.push([k, v]);
        }
      }
    }
    const valueSelector = cssUtility[text];
    if (valueSelector && valueSelector !== defaultSelector) {
      for (let [k, v] of Object.entries(valueSelector)) {
        if (v === "") {
          v = resolve(text);
        }
        if (v) {
          entries.push([k, v]);
        }
      }
    }
  } else if (includeUnrecognized) {
    const name = getCssPropertyName(key);
    entries.push([name, getUnrecognizedCssValue(name, value)]);
  }

  return entries;
};
