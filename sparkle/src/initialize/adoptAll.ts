import Animations from "../helpers/animations";
import Patterns from "../helpers/patterns";
import { SparkleStyleType } from "../types/sparkleStyleType";
import { extractAllAnimationKeyframes } from "../utils/extractAllAnimationKeyframes";
import { extractAllPatternShapes } from "../utils/extractAllPatternShapes";

const adoptAll = (styles: Record<SparkleStyleType, CSSStyleSheet>): void => {
  if (!document.adoptedStyleSheets) {
    document.adoptedStyleSheets = [];
  }
  document.adoptedStyleSheets.push(...Object.values(styles));
  const patterns = styles["patterns"];
  if (patterns) {
    Patterns.init(extractAllPatternShapes(patterns));
  }
  const animations = styles["animations"];
  if (animations) {
    Animations.init(extractAllAnimationKeyframes(animations));
  }
};

export default adoptAll;
