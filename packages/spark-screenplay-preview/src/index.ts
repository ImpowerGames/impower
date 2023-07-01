import Main from "./main/spark-screenplay-preview";

export const DEFAULT_CONSTRUCTORS = {
  "spark-screenplay-preview": Main,
} as const;

interface InitOptions {
  useShadowDom?: boolean;
  constructors?: typeof DEFAULT_CONSTRUCTORS;
  dependencies?: Record<string, string>;
}

export default abstract class SparkScreenplayPreview {
  static async init(
    options?: InitOptions
  ): Promise<CustomElementConstructor[]> {
    const useShadowDom = options?.useShadowDom ?? true;
    const constructors = options?.constructors ?? DEFAULT_CONSTRUCTORS;
    const dependencies = options?.dependencies ?? {};
    return Promise.all(
      Object.entries(constructors).map(([k, v]) =>
        v.define(dependencies?.[k] || k, dependencies as any, useShadowDom)
      )
    );
  }
}
