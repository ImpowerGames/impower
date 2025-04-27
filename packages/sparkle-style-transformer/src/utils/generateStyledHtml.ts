import STYLE_TRANSFORMERS from "../constants/STYLE_TRANSFORMERS.js";
import {
  getSparkleAttribute,
  getSparklePropName,
  getSparkleStyle,
} from "./generateSparkleAttributesAndStyle.js";

const ATTR_REGEX = /([a-z-]+[=]["][^"]*["])/g;
const QUOTE_REGEX = /([\\]["]|["'`])/g;

const generateStyledHtml = (
  html: string,
  options?: { attributePrefix?: string }
): string => {
  const { attributePrefix = "-" } = options || {};
  if (!html) {
    return html;
  }
  const parts = html.split(">");
  const styleTransformers = STYLE_TRANSFORMERS;
  return parts
    .map((part) => {
      let style = "";
      const props: Record<string, string> = {};
      const matches = part.slice(part.lastIndexOf("<") + 1).match(ATTR_REGEX);
      if (matches) {
        for (const attr of Array.from(matches)) {
          const [attrName, attrValue] = attr.split("=");
          if (attrName) {
            const name = attrName.trim() || "";
            const value = attrValue?.trim()?.replace(QUOTE_REGEX, "") || "";
            const normalizedName = getSparklePropName(name, attributePrefix);
            props[normalizedName] = value;
          }
        }
        for (const [propName, propValue] of Object.entries(props)) {
          style += getSparkleStyle(
            props,
            propName,
            propValue,
            attributePrefix,
            styleTransformers
          );
          const attrName = getSparkleAttribute(propName, attributePrefix);
          props[attrName] = propValue;
        }
      }
      const suffix = style ? ` style="${style}"` : "";
      const transformedPart = part + suffix;
      return transformedPart;
    })
    .join(">");
};

export default generateStyledHtml;
