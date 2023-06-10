import DEFAULT_SPARKLE_CONSTRUCTORS from "./constants/DEFAULT_SPARKLE_CONSTRUCTORS";
import DEFAULT_SPARKLE_STYLES from "./constants/DEFAULT_SPARKLE_STYLES";
import initialize from "./initialize/initialize";

interface InitOptions {
  useShadowDom?: boolean;
  styles?: typeof DEFAULT_SPARKLE_STYLES;
  constructors?: typeof DEFAULT_SPARKLE_CONSTRUCTORS;
  dependencies?: Record<string, string>;
}

export default abstract class Sparkle {
  static async init(
    options?: InitOptions
  ): Promise<CustomElementConstructor[]> {
    const useShadowDom = options?.useShadowDom ?? true;
    const styles = options?.styles ?? DEFAULT_SPARKLE_STYLES;
    const constructors = options?.constructors ?? DEFAULT_SPARKLE_CONSTRUCTORS;
    const dependencies = options?.dependencies ?? {};
    return initialize(styles, constructors, dependencies, useShadowDom);
  }
}
