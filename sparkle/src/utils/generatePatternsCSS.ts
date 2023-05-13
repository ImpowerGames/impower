import { generateGraphicUrl } from "./generateGraphicUrl";

export const generatePatternUrls = (
  patterns: Record<string, string[]>,
  width = 32,
  height = 32
): Record<string, string> => {
  const patternUrls: Record<string, string> = {};
  Object.entries(patterns).forEach(([name, paths]) => {
    patternUrls[name] = generateGraphicUrl(
      { width, height, shapes: paths.map((d) => ({ d })) },
      false
    );
  });
  return patternUrls;
};

export const generatePatternsCSS = (
  patterns: Record<string, string[]>
): string => {
  return `:root,
.s-theme-light,
.s-theme-dark {
  ${Object.entries(generatePatternUrls(patterns))
    .map(([name, pattern]) => `--s-pattern-${name}: ${pattern};`)
    .join("\n  ")}
}`;
};
