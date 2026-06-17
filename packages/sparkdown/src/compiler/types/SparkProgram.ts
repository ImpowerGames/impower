import { SparkleNode } from "@impower/sparkle-screen-renderer/src/parser/parser";
import { type File } from "./File";
import { Range, type SparkDiagnostic } from "./SparkDiagnostic";

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
  ui?: {
    screen?: Record<string, SparkleNode>;
    component?: Record<string, SparkleNode>;
    style?: Record<string, SparkleNode>;
    animation?: Record<string, SparkleNode>;
    theme?: Record<string, SparkleNode>;
  };
  context?: {
    [type: string]: { [name: string]: any };
  };
  // Dedicated engine-facing channel for the static screen/component structs the
  // UIModule consumes (element trees keyed by name). Derived from `context`
  // after full assembly (prelude builtins + authored + `$extends`/`$default`
  // merges) so the Game runtime can read screens WITHOUT depending on the
  // LSP-only `program.context`. (Distinct from the future reactive `ui`
  // SparkleNode channel above.)
  screens?: { [name: string]: any };
  components?: { [name: string]: any };
  styles?: { [name: string]: any };
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
