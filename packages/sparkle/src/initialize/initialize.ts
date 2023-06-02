import type SparkleElement from "../core/sparkle-element";
import { SparkleElementTag } from "../types/sparkleElementTag";
import { SparkleStyleType } from "../types/sparkleStyleType";
import adoptAll from "./adoptAll";
import defineAll from "./defineAll";

const initialize = (
  styles: Record<SparkleStyleType, string>,
  constructors: Record<SparkleElementTag, typeof SparkleElement>,
  aliases?: Record<SparkleElementTag, string>,
  useShadowDom = true,
  useInlineStyles = true
): Promise<CustomElementConstructor[]> => {
  adoptAll(styles, useInlineStyles);
  return defineAll(constructors, aliases, useShadowDom, useInlineStyles);
};

export default initialize;
