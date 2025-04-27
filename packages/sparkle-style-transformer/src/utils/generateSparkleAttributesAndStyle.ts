import STYLE_ALIASES from "../constants/STYLE_ALIASES.js";
import STYLE_TRANSFORMERS from "../constants/STYLE_TRANSFORMERS.js";
import {
  getCssColor,
  getCssIcon,
  getCssPattern,
  getCssSize,
  getCssTextStroke,
} from "./transformers.js";

export const getVariableSetterStyle = (
  name: string,
  value: string | null,
  valueFormatter?: (v: string) => string
) => {
  if (!name) {
    return "";
  }
  const varName = name.startsWith("--") ? name : `--${name}`;
  const formattedValue =
    valueFormatter && value != null ? valueFormatter(value) : value;
  if (formattedValue) {
    return `${varName}:${formattedValue};`;
  } else {
    return "";
  }
};

export const inferTransformer = (
  name: string
): ((v: string) => string) | undefined => {
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
  if (name === "value") {
    return (v: string) => v;
  }
  return undefined;
};

export const getSparklePropName = (
  propName: string,
  attributePrefix: string
) => {
  const unprefixedPropName = propName.startsWith(attributePrefix)
    ? propName.slice(attributePrefix.length)
    : propName;
  const normalizedName: string =
    STYLE_ALIASES[unprefixedPropName as keyof typeof STYLE_ALIASES] ??
    unprefixedPropName;
  return normalizedName;
};

export const getSparkleStyle = (
  props: Record<string, string>,
  propName: string,
  propValue: string,
  attributePrefix: string,
  styleTransformers: Record<string, (v: string) => string>
): string => {
  const normalizedName = getSparklePropName(propName, attributePrefix);

  const transformer =
    styleTransformers[normalizedName] || inferTransformer(normalizedName);

  let style = "";
  if (transformer) {
    style += getVariableSetterStyle(normalizedName, propValue, transformer);
    if (
      normalizedName === "text-stroke-width" ||
      normalizedName === "text-stroke-color"
    ) {
      const width =
        props["text-stroke-width"] ??
        props[attributePrefix + "text-stroke-width"] ??
        "1";
      style += getVariableSetterStyle("text-stroke", width, getCssTextStroke);
    }
  }
  return style;
};

export const getSparkleAttribute = (
  propName: string,
  attributePrefix: string
): string => {
  const normalizedName = getSparklePropName(propName, attributePrefix);
  const attrName = attributePrefix + normalizedName;
  return attrName;
};

export const generateSparkleAttributesAndStyle = (
  props: Record<string, string>,
  options?: { attributePrefix?: string }
): { attributes: Record<string, string>; style: string } => {
  const { attributePrefix = "" } = options || {};
  const styleTransformers = STYLE_TRANSFORMERS;
  const attributes: Record<string, string> = {};
  let style = "";
  for (const [propName, propValue] of Object.entries(props)) {
    const attrName = getSparkleAttribute(propName, attributePrefix);
    attributes[attrName] = propValue;
    style += getSparkleStyle(
      props,
      propName,
      propValue,
      attributePrefix,
      styleTransformers
    );
  }
  return {
    attributes,
    style,
  };
};
