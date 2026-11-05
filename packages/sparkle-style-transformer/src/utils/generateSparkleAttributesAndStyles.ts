import { CSS_ALIASES } from "../constants/CSS_ALIASES.js";
import { STYLE_ALIASES } from "../constants/STYLE_ALIASES.js";
import { STYLE_TRANSFORMERS } from "../constants/STYLE_TRANSFORMERS.js";
import type {
  StyleTransformer,
  ThemeVariables,
} from "../types/themeVariables.js";
import {
  getCssAnimation,
  getCssColor,
  getCssIcon,
  getCssPattern,
  getCssSize,
} from "./transformers.js";

export const setVariableAndValue = (
  name: string,
  value: string | null,
  valueFormatter: StyleTransformer,
  theme: ThemeVariables,
  styles: Record<string, string> = {},
): Record<string, string> => {
  if (!name) {
    return styles;
  }
  const varName = name.startsWith("--_") ? name : `--_${name}`;
  const formattedValue = value != null ? valueFormatter(value, theme) : value;
  if (!formattedValue) {
    return styles;
  }
  styles[varName] = formattedValue;
  return styles;
};

export const inferTransformer = (
  name: string,
): StyleTransformer | undefined => {
  if (name === "icon" || name.endsWith("-icon")) {
    const getIcon = (v: string) => getCssIcon(v);
    return getIcon;
  }
  if (name === "pattern" || name.endsWith("-pattern")) {
    const getPattern = (v: string) => getCssPattern(v);
    return getPattern;
  }
  if (name === "color" || name.endsWith("-color")) {
    return getCssColor;
  }
  if (name === "size" || name.endsWith("-size")) {
    return getCssSize;
  }
  if (name === "offset" || name.endsWith("-offset")) {
    return getCssSize;
  }
  if (name === "spacing" || name.endsWith("-spacing")) {
    return getCssSize;
  }
  if (name === "hit-area" || name.endsWith("-hit-area")) {
    return getCssSize;
  }
  if (name === "speed" || name.endsWith("-speed")) {
    return (v: string) => v;
  }
  if (name === "enter") {
    return getCssAnimation;
  }
  if (name === "exit") {
    return getCssAnimation;
  }
  if (name === "value") {
    return (v: string) => v;
  }
  return undefined;
};

export const getSparklePropName = (
  propName: string,
  attributePrefix: string,
) => {
  const unprefixedPropName = propName.startsWith(attributePrefix)
    ? propName.slice(attributePrefix.length)
    : propName;
  const normalizedName: string =
    STYLE_ALIASES[unprefixedPropName as keyof typeof STYLE_ALIASES] ??
    CSS_ALIASES[unprefixedPropName as keyof typeof CSS_ALIASES] ??
    unprefixedPropName;
  return normalizedName;
};

export const setSparkleStyle = (
  props: Record<string, string>,
  propName: string,
  propValue: string,
  attributePrefix: string,
  styleTransformers: Record<string, StyleTransformer>,
  theme: ThemeVariables,
  styles: Record<string, string> = {},
): Record<string, string> => {
  const normalizedName = getSparklePropName(propName, attributePrefix);

  const transformer =
    styleTransformers[normalizedName] || inferTransformer(normalizedName);

  if (transformer) {
    setVariableAndValue(normalizedName, propValue, transformer, theme, styles);
  }

  if (!Number.isNaN(Number(props["value"]))) {
    const min = Number(props["min"] ?? 0);
    const max = Number(props["max"] ?? 100);
    const value = Number(props["value"] ?? min);
    const percentage =
      max === min
        ? 0
        : ((value - min) / (max - min)) * 100;
    styles["--_fill-percentage"] = `${percentage}%`;
  }

  return styles;
};

export const getSparkleAttribute = (
  propName: string,
  attributePrefix: string,
): string => {
  const styleTransformers = STYLE_TRANSFORMERS;
  const normalizedName = getSparklePropName(propName, attributePrefix);
  if (normalizedName in styleTransformers) {
    return attributePrefix + normalizedName;
  }
  return propName;
};

export const generateSparkleAttributesAndStyles = (
  props: Record<string, string>,
  options: { attributePrefix?: string; theme: ThemeVariables },
): {
  attributes: Record<string, string>;
  styles: Record<string, string>;
} => {
  const { attributePrefix = "", theme } = options;
  const styleTransformers = STYLE_TRANSFORMERS;
  const attributes: Record<string, string> = {};
  const styles: Record<string, string> = {};
  for (const [propName, propValue] of Object.entries(props)) {
    const attrName = getSparkleAttribute(propName, attributePrefix);
    attributes[attrName] = propValue;
    setSparkleStyle(
      props,
      propName,
      propValue,
      attributePrefix,
      styleTransformers,
      theme,
      styles,
    );
  }
  return {
    attributes,
    styles,
  };
};
