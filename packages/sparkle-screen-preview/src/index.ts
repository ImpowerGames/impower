import { defineAll, DefineOptions } from "../../spec-component/src/component";
import Main from "./main/sparkle-screen-preview";

export const DEFAULT_CONSTRUCTORS = [Main] as const;

interface InitOptions extends DefineOptions {
  constructors?: typeof DEFAULT_CONSTRUCTORS;
}

export default abstract class SparkdownScreenPreview {
  static async init(
    options?: InitOptions
  ): Promise<CustomElementConstructor[]> {
    const constructors = options?.constructors ?? DEFAULT_CONSTRUCTORS;
    return defineAll(constructors, options);
  }
}
