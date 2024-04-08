import {
  adoptAll,
  defineAll,
  DefineOptions,
} from "../../spec-component/src/component";
import DEFAULT_SPARKLE_CONSTRUCTORS from "./constants/DEFAULT_SPARKLE_CONSTRUCTORS";
import DEFAULT_SPARKLE_STYLES from "./constants/DEFAULT_SPARKLE_STYLES";

interface InitOptions extends DefineOptions {
  styles?: typeof DEFAULT_SPARKLE_STYLES;
  constructors?: typeof DEFAULT_SPARKLE_CONSTRUCTORS;
}

export default abstract class Sparkle {
  static async init(
    options?: InitOptions
  ): Promise<CustomElementConstructor[]> {
    const styles = options?.styles ?? DEFAULT_SPARKLE_STYLES;
    const constructors = options?.constructors ?? DEFAULT_SPARKLE_CONSTRUCTORS;
    adoptAll(styles);
    return defineAll(constructors, options);
  }
}
