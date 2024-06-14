import { getCSSPropertyKeyValue } from "./getCSSPropertyKeyValue";

export const getFontContent = (fonts: Record<string, any>): string => {
  let textContent = "";
  Object.entries(fonts).forEach(([, font]) => {
    const fontContent = Object.entries(font)
      .map(([k, v]) => {
        if (!k.startsWith("$")) {
          const [cssProp, cssValue] = getCSSPropertyKeyValue(k, v);
          if (cssValue) {
            return `\n  ${cssProp}: ${cssValue};`;
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
