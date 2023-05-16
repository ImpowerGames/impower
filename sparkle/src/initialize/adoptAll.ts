import { configureStyleTransformers } from "../../../sparkle-transformer/src/utils/configureStyleTransformers";
import Animations from "../helpers/animations";
import Icons from "../helpers/icons";
import Patterns from "../helpers/patterns";
import Styles from "../helpers/styles";
import Transformers from "../helpers/transformers";
import { SparkleStyleType } from "../types/sparkleStyleType";
import { extractAllAnimationKeyframes } from "../utils/extractAllAnimationKeyframes";
import { extractAllGraphics } from "../utils/extractAllGraphics";

const adoptAll = (styles: Record<SparkleStyleType, CSSStyleSheet>): void => {
  Styles.init(styles);
  if (!document.adoptedStyleSheets) {
    document.adoptedStyleSheets = [];
  }
  document.adoptedStyleSheets.push(...Object.values(styles));
  const patterns = styles["patterns"];
  if (patterns) {
    Patterns.init(extractAllGraphics("--s-pattern-", patterns));
  }
  const icons = styles["icons"];
  if (icons) {
    Icons.init(extractAllGraphics("--s-icon-", icons));
  }
  const animations = styles["animations"];
  if (animations) {
    Animations.init(extractAllAnimationKeyframes(animations));
  }
  Transformers.init(
    configureStyleTransformers({
      graphics: { ...Patterns.all(), ...Icons.all() },
    })
  );
};

export default adoptAll;
