import STYLE_ALIASES from "../constants/STYLE_ALIASES.js";
import STYLE_TRANSFORMERS from "../constants/STYLE_TRANSFORMERS.js";
import Graphic from "../types/graphic.js";
import getCssColor from "./getCssColor.js";
import getCssIcon from "./getCssIcon.js";
import getCssPattern from "./getCssPattern.js";
import getCssSize from "./getCssSize.js";
import getCssTextStroke from "./getCssTextStroke.js";

const ATTR_REGEX = /([a-z-]+[=]["][^"]*["])/g;
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

const inferTransformer = (
  name: string,
  config: {
    patterns?: Record<string, Graphic>;
    icons?: Record<string, Graphic>;
  }
): ((v: string) => string) | undefined => {
  const patterns = config?.patterns || {};
  const icons = config?.icons || {};
  if (name === "icon" || name.endsWith("-icon")) {
    const getIcon = (v: string) => getCssIcon(v, icons);
    return getIcon;
  }
  if (name === "pattern" || name.endsWith("-pattern")) {
    const getPattern = (v: string) => getCssPattern(v, patterns);
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

const generateStyledHtml = (
  html: string,
  config: {
    patterns?: Record<string, Graphic>;
    icons?: Record<string, Graphic>;
  }
): string => {
  if (!html) {
    return html;
  }
  const parts = html.split(">");
  const patterns = config?.patterns || {};
  const styleTransformers: Record<string, (v: string) => string> = {
    ...STYLE_TRANSFORMERS,
    "background-pattern": (v: string) => getCssPattern(v, patterns),
  };
  return parts
    .map((part) => {
      let style = "";
      const attributes: Record<string, string> = {};
      const matches = part.slice(part.lastIndexOf("<") + 1).match(ATTR_REGEX);
      if (matches) {
        Array.from(matches).forEach((attr) => {
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
          const transformer =
            styleTransformers[name] || inferTransformer(name, config);
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
      }
      const suffix = style ? ` style="${style}"` : "";
      const transformedPart = part + suffix;
      return transformedPart;
    })
    .join(">");
};

export default generateStyledHtml;
