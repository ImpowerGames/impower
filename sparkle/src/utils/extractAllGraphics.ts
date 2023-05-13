import { Graphic } from "../types/graphic";
import { parseGraphic } from "./parseGraphic";

export const extractAllGraphics = (
  prefix: string,
  ...sheets: CSSStyleSheet[]
): Record<string, Graphic> => {
  const result: Record<string, Graphic> = {};
  for (let i = 0; i < sheets.length; i += 1) {
    const s = sheets[i];
    if (s?.cssRules) {
      for (let r = 0; r < s.cssRules.length; r += 1) {
        const rule = s.cssRules[r];
        if (rule instanceof CSSStyleRule) {
          Array.from(rule.style).forEach((key) => {
            if (key.startsWith(prefix)) {
              const name = key.replace(prefix, "").trim();
              const value = rule.style.getPropertyValue(key);
              result[name] = parseGraphic(value);
            }
          });
        }
      }
    }
  }
  return result;
};
