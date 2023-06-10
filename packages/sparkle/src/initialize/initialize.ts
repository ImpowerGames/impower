import type SparkleElement from "../core/sparkle-element";
import { SparkleConstructorType } from "../types/sparkleConstructorType";
import { SparkleStyleType } from "../types/sparkleStyleType";
import adoptAll from "./adoptAll";
import defineAll from "./defineAll";

const initialize = (
  styles: Record<SparkleStyleType, string>,
  constructors: Record<SparkleConstructorType, typeof SparkleElement>,
  aliases?: Record<SparkleConstructorType, string>,
  useShadowDom = true
): Promise<CustomElementConstructor[]> => {
  adoptAll(styles);
  return defineAll(constructors, aliases, useShadowDom);
};

export default initialize;
