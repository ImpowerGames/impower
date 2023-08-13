import Main from "./main/spark-web-player";

export const DEFAULT_CONSTRUCTORS = {
  "spark-web-player": Main,
} as const;

interface InitOptions {
  constructors?: typeof DEFAULT_CONSTRUCTORS;
  dependencies?: Record<string, string>;
}

export default abstract class SparkWebPlayer {
  static async init(
    options?: InitOptions
  ): Promise<CustomElementConstructor[]> {
    const constructors = options?.constructors ?? DEFAULT_CONSTRUCTORS;
    return Promise.all(
      Object.entries(constructors).map(([k, v]) => v.define())
    );
  }
}
