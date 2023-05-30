import type SparkleElement from "../core/sparkle-element";
import { SparkleElementTag } from "../types/sparkleElementTag";

const defineAll = async (
  constructors: Record<SparkleElementTag, typeof SparkleElement>,
  aliases?: Record<SparkleElementTag, string>,
  useShadowDom = true
): Promise<CustomElementConstructor[]> => {
  return Promise.all(
    Object.entries(constructors).map(([k, v]) =>
      v.define(aliases?.[k as SparkleElementTag] || k, aliases, useShadowDom)
    )
  );
};

export default defineAll;
