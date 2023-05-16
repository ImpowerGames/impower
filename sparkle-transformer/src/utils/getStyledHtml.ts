import { STYLE_ALIASES } from "../constants/STYLE_ALIASES";
import { Graphic } from "../types/graphic";
import { configureStyleTransformers } from "./configureStyleTransformers";
import { getCssTextStroke } from "./getCssTextStroke";

const REGEX_ARG_SEPARATOR = /[ \n\r\t]+/;
const QUOTE_REGEX = /([\\]["]|["'`])/g;

const getVariableSetterStyle = (
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

export const getStyledHtml = (
  html: string,
  config: { graphics?: Record<string, Graphic> }
): string => {
  if (!html) {
    return html;
  }
  const parts = html.split(">");
  const styleTransformers: Record<string, (v: string) => string> =
    configureStyleTransformers(config);
  return parts
    .map((part) => {
      let style = "";
      const attributes: Record<string, string> = {};
      part
        .slice(part.lastIndexOf("<") + 1)
        .split(REGEX_ARG_SEPARATOR)
        .filter((p) => p.includes("="))
        .forEach((attr) => {
          const [attrName, attrValue] = attr.split("=");
          if (attrName) {
            const name = attrName.trim() || "";
            const value = attrValue?.trim()?.replace(QUOTE_REGEX, "") || "";
            const aliasedName =
              STYLE_ALIASES[name as keyof typeof STYLE_ALIASES] || name;
            attributes[aliasedName] = value;
          }
        });
      Object.entries(attributes).forEach(([name, value]) => {
        const transformer = styleTransformers[name];
        if (transformer) {
          style += getVariableSetterStyle(name, value, transformer);
          if (name === "text-stroke-width" || name === "text-stroke-color") {
            const width = attributes["text-stroke-width"] || "1";
            style += getVariableSetterStyle(
              "text-stroke",
              width,
              getCssTextStroke
            );
          }
        }
      });
      const suffix = style ? ` style="${style}"` : "";
      const transformedPart = part + suffix;
      return transformedPart;
    })
    .join(">");
};
