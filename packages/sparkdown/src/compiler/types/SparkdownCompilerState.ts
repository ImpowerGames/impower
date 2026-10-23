import type { SourceMetadata } from "../../runtime/Error";
import type { StructDefinitionTable } from "../../runtime/StructDefinition";

export interface SparkdownCompilerState {
  defaultDefinitions?: { [type: string]: any };
  /** Whether the last compile produced a program that runs: its statement
   *  chunks. */
  produced?: boolean;
  /** The struct definitions of the last compile that produced a program, by
   *  type and name: its root's (`ProgramRoot.tables`). */
  structDefinitions?: StructDefinitionTable;
  /** The scripts of the compile's project other than the one it starts from,
   *  in the order their declarations register (`projectScripts`). Each holds
   *  declarations only. */
  projectScripts?: string[];
  /** Where this compile met each layout and component, by its kind and name
   *  (`layouts:hud`): the script that declares it first, and the first line
   *  of that script's last declaration of it. A second script that declares
   *  one is a collision. */
  sparkleDeclaredAt?: Map<string, { uri: string; source: SourceMetadata }>;
  /**
   * Shared mutable container holding the URI of the file whose `run`
   * statements are currently being resolved. The `IFileHandler.
   * ResolveInkFilename` closure reads this so a `run` resolves its path
   * relative to the script that writes it. Updated and restored by
   * `SparkdownCompiler.parseIncrementally` around each recursive descent.
   *
   * `runStack` tracks the resolved URIs of `.luau` files currently being
   * loaded by `run` statements. If a `run` resolution finds its target
   * URI already on the stack, that's a cycle and the compiler errors
   * instead of recursing forever. Pushed before recursive descent and
   * popped on return.
   *
   * `runDeclared` holds the resolved URIs of the `.luau` files whose wrapper
   * function this compile has declared: the first `run` of a file the
   * compile reaches declares it, and every `run` of the file calls it.
   *
   * `runFiles` is the record of those wrappers: each wrapper's name and the
   * resolved URI of the file it wraps, which the program shows the wrapper
   * by (`runFileRecord`).
   */
  fileResolutionState?: {
    currentParentUri: string;
    runStack?: string[];
    runDeclared?: Set<string>;
    runFiles?: Map<string, string>;
  };
}
