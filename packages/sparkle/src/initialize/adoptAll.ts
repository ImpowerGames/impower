import STYLES from "../../../spark-element/src/STYLE_CACHE";
import extractAllGraphics from "../../../sparkle-style-transformer/src/utils/extractAllGraphics";
import Icons from "../configs/icons";
import Patterns from "../configs/patterns";
import { SparkleStyleType } from "../types/sparkleStyleType";

const adoptAll = (styles: Record<SparkleStyleType, string>): void => {
  Object.values(styles).forEach((css) => {
    STYLES.adopt(document, css);
  });
  const patterns = styles["patterns"];
  if (patterns) {
    Patterns.init(extractAllGraphics("--s-pattern-", patterns));
  }
  const icons = styles["icons"];
  if (icons) {
    Icons.init(extractAllGraphics("--s-icon-", icons));
  }
};

export default adoptAll;
