import Editor from "./components/editor/editor";

export const DEFAULT_SPARKDOWN_EDITOR_CONSTRUCTORS = {
  "sparkdown-script-editor": Editor,
} as const;

interface InitOptions {
  useShadowDom?: boolean;
  constructors?: typeof DEFAULT_SPARKDOWN_EDITOR_CONSTRUCTORS;
  dependencies?: Record<string, string>;
}

export default abstract class SparkEditor {
  static async init(
    options?: InitOptions
  ): Promise<CustomElementConstructor[]> {
    const useShadowDom = options?.useShadowDom ?? true;
    const constructors =
      options?.constructors ?? DEFAULT_SPARKDOWN_EDITOR_CONSTRUCTORS;
    const dependencies = options?.dependencies ?? {};
    return Promise.all(
      Object.entries(constructors).map(([k, v]) =>
        v.define(dependencies?.[k] || k, dependencies as any, useShadowDom)
      )
    );
  }
}
