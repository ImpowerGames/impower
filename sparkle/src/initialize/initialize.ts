import type SparkleElement from "../core/sparkle-element";
import { SparkleElementTag } from "../types/sparkleElementTag";
import { SparkleStyleType } from "../types/sparkleStyleType";
import adoptAll from "./adoptAll";
import defineAll from "./defineAll";

const initialize = (
  styles: Record<SparkleStyleType, CSSStyleSheet>,
  constructors: Record<SparkleElementTag, typeof SparkleElement>,
  aliases?: Record<SparkleElementTag, string>
): Promise<CustomElementConstructor[]> => {
  adoptAll(styles);
  return defineAll(constructors, aliases);
};

export default initialize;
