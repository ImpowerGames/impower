import Animations from "../helpers/animations";
import { SparkleStyleType } from "../types/sparkleStyleType";
import { getAllAnimations } from "../utils/getAllAnimations";

const adoptAll = (styles: Record<SparkleStyleType, CSSStyleSheet>): void => {
  if (!document.adoptedStyleSheets) {
    document.adoptedStyleSheets = [];
  }
  document.adoptedStyleSheets.push(...Object.values(styles));
  const animations = styles["animations"];
  if (animations) {
    Animations.init(getAllAnimations(animations));
  }
};

export default adoptAll;
