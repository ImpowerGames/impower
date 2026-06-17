import { Story } from "../../inkjs/engine/Story";

export interface SparkdownCompilerState {
  contextPropertyRegistry?: {
    [type: string]: {
      [name: string]: {
        [propertyPath: string]: any;
      };
    };
  };
  defaultDefinitions?: { [type: string]: any };
  story?: Story;
  /**
   * Shared mutable container holding the URI of the file whose `include`
   * statements are currently being resolved. The `IFileHandler.
   * ResolveInkFilename` closure reads this so nested includes pick the
   * correct resolution base (a file's `include other.sd` resolves
   * relative to ITS URI, not the entry-point's URI). Updated and restored
   * by `SparkdownCompiler.parseIncrementally` around each recursive
   * descent.
   *
   * `runStack` tracks the resolved URIs of `.luau` files currently being
   * loaded by `run` statements. If a `run` resolution finds its target
   * URI already on the stack, that's a cycle and the compiler errors
   * instead of recursing forever. Pushed before recursive descent and
   * popped on return.
   */
  fileResolutionState?: { currentParentUri: string; runStack?: string[] };
}
