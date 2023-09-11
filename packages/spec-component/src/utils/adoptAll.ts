import extractAllGraphics from "../../../sparkle-style-transformer/src/utils/extractAllGraphics";
import STYLES from "../caches/STYLE_CACHE";

const adoptAll = (styles: Record<string, string>): void => {
  Object.values(styles).forEach((css) => {
    STYLES.adoptStyle(document, css);
  });
  const patterns = styles["patterns"];
  if (patterns) {
    STYLES.adoptPatterns(extractAllGraphics("--s-pattern-", patterns));
  }
  const icons = styles["icons"];
  if (icons) {
    STYLES.adoptIcons(extractAllGraphics("--s-icon-", icons));
  }
};

export default adoptAll;
