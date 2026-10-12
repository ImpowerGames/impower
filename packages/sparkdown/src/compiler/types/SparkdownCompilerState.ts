import type { StructDefinitionTable } from "../../runtime/StructDefinition";

export interface SparkdownCompilerState {
  defaultDefinitions?: { [type: string]: any };
  /** Whether the last compile produced a program that runs: its statement
   *  chunks. */
  produced?: boolean;
  /** The struct definitions of the last compile that produced a program, by
   *  type and name: its root's (`ProgramRoot.tables`). */
  structDefinitions?: StructDefinitionTable;
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
   *
   * `includedUris` holds the entry script and every script an `include` has
   * reached in this compile. A script is included once: a later `include` of
   * a script already in the set adds nothing, so the flows it declares are
   * declared once and an include cycle ends.
   */
  fileResolutionState?: {
    currentParentUri: string;
    runStack?: string[];
    includedUris: Set<string>;
  };
}
