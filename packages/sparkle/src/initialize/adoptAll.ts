import STYLES from "../../../spark-element/src/caches/STYLE_CACHE";
import extractAllGraphics from "../../../sparkle-style-transformer/src/utils/extractAllGraphics";
import { SparkleStyleType } from "../types/sparkleStyleType";

const adoptAll = (styles: Record<SparkleStyleType, string>): void => {
  Object.values(styles).forEach((css) => {
    STYLES.adoptStyles(document, css);
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
