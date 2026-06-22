import { type File } from "./File";
import { Range, type SparkDiagnostic } from "./SparkDiagnostic";
import {
  type ComponentNode,
  type LayoutNode,
  type ScreenNode,
} from "./SparkleNode";

export type ScriptLocation = [
  scriptIndex: number,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
];

export interface SparkProgram {
  uri: string;
  scripts: Record<string, number>;
  files: Record<string, Omit<File, "src" | "text" | "data">>;
  compiled?: Record<string, any>;
  workspace?: string;
  startFrom?: { file: string; line: number };
  simulationOptions?: Record<
    string,
    {
      favoredConditions?: (boolean | undefined)[];
      favoredChoices?: (number | undefined)[];
    }
  >;
  context?: {
    [type: string]: { [name: string]: any };
  };
  // Dedicated engine-facing channel for the static UI structs the UIModule
  // consumes: `layouts` (element trees keyed by name), `screens` (navigation
  // group defs), `components`. Derived from `context` after full assembly
  // (prelude builtins + authored + `$extends`/`$default` merges) so the Game
  // runtime can read them WITHOUT depending on the LSP-only `program.context`.
  layouts?: { [name: string]: any };
  screens?: { [name: string]: any };
  components?: { [name: string]: any };
  styles?: { [name: string]: any };
  // Reactive Sparkle UI AST channel (docs/sparkle/reactive-sparkle-spec.md §6).
  // The typed element-tree the reactive runtime consumes, produced by the
  // lowerer alongside the static `layouts`/`screens`/`components` channels above.
  // Carries compiled-Luau `Binding` handles for every dynamic value.
  sparkle?: {
    layouts?: { [name: string]: LayoutNode };
    screens?: { [name: string]: ScreenNode };
    components?: { [name: string]: ComponentNode };
  };
  // Dedicated engine-facing channel for file-derived assets (image / audio /
  // font) and compiler-inferred implicit defs (filtered_image), keyed by type
  // then name. Lets the Game runtime read assets without the LSP-only
  // program.context. Derived from `context` after asset population.
  assets?: { [type: string]: { [name: string]: any } };
  // NOTE: there is intentionally no `defines` channel. Define-typed entries
  // (animation/character/ease/config/…) are sourced by the Game from the live
  // runtime `__def` tables (buildDefinesContext), which resolve authored→builtin
  // inheritance via the VM __index chain — richer and byte-identical to the
  // retired compile-time snapshot. Requires the program to be compiled with
  // `seedBuiltinsIntoStory`.
  diagnostics?: {
    [uri: string]: SparkDiagnostic[];
  };
  colorAnnotations?: {
    [uri: string]: Range[];
  };
  pathLocations?: {
    [path: string]: ScriptLocation;
  };
  functionLocations?: {
    [name: string]: ScriptLocation;
  };
  sceneLocations?: {
    [name: string]: ScriptLocation;
  };
  branchLocations?: {
    [name: string]: ScriptLocation;
  };
  knotLocations?: {
    [name: string]: ScriptLocation;
  };
  stitchLocations?: {
    [name: string]: ScriptLocation;
  };
  labelLocations?: {
    [name: string]: ScriptLocation;
  };
  dataLocations?: {
    [name: string]: ScriptLocation;
  };
  version?: number;
}
