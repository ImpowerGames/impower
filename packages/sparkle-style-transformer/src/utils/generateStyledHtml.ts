import { STYLE_TRANSFORMERS } from "../constants/STYLE_TRANSFORMERS.js";
import {
  getSparkleAttribute,
  getSparklePropName,
  setSparkleStyle,
} from "./generateSparkleAttributesAndStyles.js";

const ATTR_REGEX = /([a-z-]+[=]["][^"]*["])/g;
const QUOTE_REGEX = /([\\]["]|["'`])/g;

const generateStyledHtml = (
  html: string,
  options?: { attributePrefix?: string }
): string => {
  const { attributePrefix = "" } = options || {};
  if (!html) {
    return html;
  }
  const parts = html.split(">");
  const styleTransformers = STYLE_TRANSFORMERS;
  return parts
    .map((part) => {
      const props: Record<string, string> = {};
      const styles: Record<string, string> = {};
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
          setSparkleStyle(
            props,
            propName,
            propValue,
            attributePrefix,
            styleTransformers,
            styles
          );
          const attrName = getSparkleAttribute(propName, attributePrefix);
          props[attrName] = propValue;
        }
      }
      const style = Object.entries(styles)
        .map(([k, v]) => `${k}:${v};`)
        .join("");
      const suffix = style ? ` style="${style}"` : "";
      const transformedPart = part + suffix;
      return transformedPart;
    })
    .join(">");
};

export default generateStyledHtml;
