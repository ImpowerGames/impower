import Graphic from "./types/graphic";
import extractAllGraphics from "./utils/extractAllGraphics";
import generateStyledHtml from "./utils/generateStyledHtml";

/**
 * Transforms sparkle styling attributes into inline styles that set the appropriate css variables.
 *
 * This facilitates SSG (static site generation) by allowing the component
 * to appear styled even when no javascript is loaded.
 *
 * @param component - the component to apply inline styles to.
 * @param config - specifies the css data which static graphics (like patterns and icons) should be extracted from.
 * @returns A component that will return html with the necessary inline styles.
 */
const transformer = (
  html: string,
  config: {
    patterns?: string[] | undefined;
    icons?: string[] | undefined;
  }
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
        extractAllGraphics("---theme_pattern-", patternFile)
      ).forEach(([key, value]) => {
        patterns[key] = value;
      });
    }
  }
  const iconFiles = config?.icons;
  if (iconFiles) {
    for (let i = 0; i < iconFiles.length; i += 1) {
      const iconFile = iconFiles[i] || "";
      Object.entries(extractAllGraphics("---theme_icon-", iconFile)).forEach(
        ([key, value]) => {
          icons[key] = value;
        }
      );
    }
  }
  return generateStyledHtml(html, { patterns, icons });
};
export default transformer;
