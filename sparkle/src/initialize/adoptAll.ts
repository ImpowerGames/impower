import extractAllGraphics from "../../../sparkle-style-transformer/src/utils/extractAllGraphics";
import Animations from "../configs/animations";
import Icons from "../configs/icons";
import Patterns from "../configs/patterns";
import Styles from "../configs/styles";
import { SparkleStyleType } from "../types/sparkleStyleType";
import { extractAllAnimationKeyframes } from "../utils/extractAllAnimationKeyframes";

const adoptAll = (styles: Record<SparkleStyleType, string>): void => {
  Styles.init(styles);
  if (!document.adoptedStyleSheets) {
    document.adoptedStyleSheets = [];
  }
  document.adoptedStyleSheets.push(...Styles.getAll());
  const patterns = styles["patterns"];
  if (patterns) {
    Patterns.init(extractAllGraphics("--s-pattern-", patterns));
  }
  const icons = styles["icons"];
  if (icons) {
    Icons.init(extractAllGraphics("--s-icon-", icons));
  }
  const animations = Styles.get("animations");
  if (animations) {
    Animations.init(extractAllAnimationKeyframes(animations));
  }
};

export default adoptAll;
