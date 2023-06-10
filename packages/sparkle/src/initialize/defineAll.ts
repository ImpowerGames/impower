import type SparkleElement from "../core/sparkle-element";
import { SparkleConstructorType } from "../types/sparkleConstructorType";

const defineAll = async (
  constructors: Record<SparkleConstructorType, typeof SparkleElement>,
  aliases?: Record<SparkleConstructorType, string>,
  useShadowDom = true
): Promise<CustomElementConstructor[]> => {
  return Promise.all(
    Object.entries(constructors).map(([k, v]) =>
      v.define(
        aliases?.[k as SparkleConstructorType] || k,
        aliases,
        useShadowDom
      )
    )
  );
};

export default defineAll;
