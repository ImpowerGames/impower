import { type File } from "./File";
import { Range, type SparkDiagnostic } from "./SparkDiagnostic";
import { type ComponentNode, type ScreenNode } from "./SparkleNode";

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
  // Dedicated engine-facing channel for the static screen/component structs the
  // UIModule consumes (element trees keyed by name). Derived from `context`
  // after full assembly (prelude builtins + authored + `$extends`/`$default`
  // merges) so the Game runtime can read screens WITHOUT depending on the
  // LSP-only `program.context`. (The reactive Sparkle AST will later add its own
  // channel here; see docs/sparkle/reactive-sparkle-spec.md.)
  screens?: { [name: string]: any };
  components?: { [name: string]: any };
  styles?: { [name: string]: any };
  // Reactive Sparkle UI AST channel (docs/sparkle/reactive-sparkle-spec.md §6).
  // The typed element-tree the reactive runtime will consume, produced by the
  // lowerer alongside the static `screens`/`components` channels above. Carries
  // compiled-Luau `Binding` handles for every dynamic value. Additive in
  // Phase 1 — not yet consumed by the engine (the static channels still drive
  // rendering until Phase 3), so the golden-master stays byte-identical.
  sparkle?: {
    screens?: { [name: string]: ScreenNode };
    components?: { [name: string]: ComponentNode };
  };
  // Dedicated engine-facing channel for file-derived assets (image / audio /
  // font) and compiler-inferred implicit defs (filtered_image), keyed by type
  // then name. Lets the Game runtime read assets without the LSP-only
  // program.context. Derived from `context` after asset population.
  assets?: { [type: string]: { [name: string]: any } };
  // Dedicated engine-facing channel for every remaining define-typed context
  // entry the engine reads (animation/character/ease/color/synth/transition/
  // config/layered_*/…) — i.e. `context` minus the types covered by the
  // screens/components/styles/assets channels above. Carries the fully-merged
  // structs (builtin $defaults already applied), so the Game runtime can build
  // its context entirely from these channels instead of the LSP-only
  // `program.context`. (Transitional: true runtime-`__def` sourcing of defines
  // awaits builtins being instantiated into the story; see buildContextFromStory.)
  defines?: { [type: string]: { [name: string]: any } };
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
