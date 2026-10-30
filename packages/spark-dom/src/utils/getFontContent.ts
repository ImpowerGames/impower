import { getCssPropertyName } from "../../../sparkle-style-transformer/src/utils/getCssPropertyName";
import { getCssTokenValue } from "./getCssTokenValue";

const getFontDescriptorValue = (name: string, value: unknown): string => {
  if (value == null || value === "" || typeof value === "object") {
    return "";
  }
  if (name === "src" && typeof value === "string") {
    const src = value.trim();
    return src.includes("(") ? src : `url('${encodeURI(src)}')`;
  }
  return String(value);
};

export const getFontContent = (fonts: Record<string, any>): string => {
  let textContent = "";
  Object.entries(fonts).forEach(([, font]) => {
    const fontContent = Object.entries(font)
      .map(([k, v]) => {
        if (!k.startsWith("$")) {
          const name = getCssPropertyName(k);
          const value = getFontDescriptorValue(name, getCssTokenValue(v));
          if (value) {
            return `\n  ${name}: ${value};`;
          }
        }
        return "";
      })
      .join("")
      .trim();
    if (fontContent) {
      textContent += `@font-face {\n  ${fontContent}\n}\n`;
    }
  });
  textContent = textContent.trim();
  return textContent;
};
