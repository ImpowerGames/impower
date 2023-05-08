import { Pattern } from "../types/pattern";

export const getAttribute = (str: string, name: string): string | undefined => {
  const regex = new RegExp(
    `${name}[ ]*=[ ]*'([^']+)'|${name}[ ]*=[ ]*"([^"]+)"`
  );
  const matches = str.match(regex);
  if (!matches) {
    return undefined;
  }
  return matches[1] || matches[2];
};

export const extractAllPatternShapes = (
  ...sheets: CSSStyleSheet[]
): Record<string, Pattern> => {
  const result: Record<string, Pattern> = {};
  for (let i = 0; i < sheets.length; i += 1) {
    const s = sheets[i];
    if (s?.cssRules) {
      for (let r = 0; r < s.cssRules.length; r += 1) {
        const rule = s.cssRules[r];
        if (rule instanceof CSSStyleRule) {
          Array.from(rule.style).forEach((key) => {
            const prefix = "--s-pattern-";
            if (key.startsWith(prefix)) {
              const name = key.replace(prefix, "").trim();
              const value = rule.style.getPropertyValue(key);
              const svgString = value.slice(
                value.indexOf("<svg "),
                value.indexOf("</svg>") + 1
              );
              const pattern: Pattern = {};
              svgString.split("<path ").forEach((line) => {
                if (line.startsWith("<svg ")) {
                  const width = getAttribute(line, "width");
                  const height = getAttribute(line, "height");
                  pattern.width = width;
                  pattern.height = height;
                } else {
                  const d = getAttribute(line, "d");
                  const fill = getAttribute(line, "fill");
                  const stroke = getAttribute(line, "stroke");
                  const strokeWidth = getAttribute(line, "stroke-width");
                  const strokeLinejoin = getAttribute(line, "stroke-linejoin");
                  const strokeLinecap = getAttribute(line, "stroke-linecap");
                  if (!pattern.shapes) {
                    pattern.shapes = [];
                  }
                  pattern.shapes.push({
                    d,
                    fill,
                    stroke,
                    strokeWidth,
                    strokeLinejoin,
                    strokeLinecap,
                  });
                }
              });
              result[name] = pattern;
            }
          });
        }
      }
    }
  }
  return result;
};
