import { defineAll } from "../../spec-component/src/component";
import Main from "./main/spark-web-player";

export const DEFAULT_CONSTRUCTORS = [Main] as const;

interface InitOptions {
  constructors?: typeof DEFAULT_CONSTRUCTORS;
}

export default abstract class SparkWebPlayer {
  static async init(
    options?: InitOptions
  ): Promise<CustomElementConstructor[]> {
    const constructors = options?.constructors ?? DEFAULT_CONSTRUCTORS;
    return defineAll(constructors);
  }
}
