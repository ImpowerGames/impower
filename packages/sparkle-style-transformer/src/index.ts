import Graphic from "./types/graphic";
import extractAllGraphics from "./utils/extractAllGraphics";
import generateStyledHtml from "./utils/generateStyledHtml";

const transformer = (
  html: string,
  config: {
    patterns?: string[] | undefined;
    icons?: string[] | undefined;
  },
): string => {
  if (!html) {
    return html;
  }
  const patternFiles = config?.patterns;
  const patterns: Record<string, Graphic> = {};
  const icons: Record<string, Graphic> = {};
  if (patternFiles) {
    for (let i = 0; i < patternFiles.length; i += 1) {
      const patternFile = patternFiles[i] || "";
      Object.entries(
        extractAllGraphics("--theme-pattern-", patternFile),
      ).forEach(([key, value]) => {
        patterns[key] = value;
      });
    }
  }
  const iconFiles = config?.icons;
  if (iconFiles) {
    for (let i = 0; i < iconFiles.length; i += 1) {
      const iconFile = iconFiles[i] || "";
      Object.entries(extractAllGraphics("--theme-icon-", iconFile)).forEach(
        ([key, value]) => {
          icons[key] = value;
        },
      );
    }
  }
  return generateStyledHtml(html, { patterns, icons });
};
export default transformer;
