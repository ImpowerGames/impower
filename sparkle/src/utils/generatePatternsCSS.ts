import { DEFAULT_PATTERNS } from "../constants/DEFAULT_PATTERNS";
import { generatePatternUrl } from "./generatePatternUrl";

const ANGLES: Record<string, number> = {
  w: 0,
  nw: 45,
  n: 90,
  ne: 135,
  e: 180,
};
const WEIGHTS = [1, 2, 3, 4, 5];

export const generatePatternUrls = (): Record<string, string> => {
  const patternUrls: Record<string, string> = {};
  Object.entries(DEFAULT_PATTERNS).forEach(([name, paths]) => {
    Object.entries(ANGLES).forEach(([angleName, angle]) => {
      WEIGHTS.forEach((strokeWeight) => {
        const angleSuffix = angleName ? `-${angleName}` : "";
        const weightSuffix = `-${strokeWeight}`;
        patternUrls[`${name}${angleSuffix}${weightSuffix}`] =
          generatePatternUrl(
            paths.map((d) => ({ d, strokeWeight })),
            angle
          );
      });
    });
  });
  return patternUrls;
};

export const generatePatternsCSS = (): string => {
  return `:root,
.s-theme-light,
.s-theme-dark {
  ${Object.entries(generatePatternUrls())
    .map(([name, pattern]) => `--s-pattern-${name}: ${pattern};`)
    .join("\n  ")}
}`;
};
