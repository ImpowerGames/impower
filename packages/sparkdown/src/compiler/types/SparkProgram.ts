import type { ProgramBuffer } from "../../binary/programBinary";
import { type File } from "./File";
import type { ProgramChangeSummary } from "./ProgramChangeSummary";
import { type SceneAssets } from "./SceneAssets";
import type { Range,SparkDiagnostic } from "./SparkDiagnostic";
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

/**
 * Every runtime path that carries a source range, in columns.
 *
 * A long script has tens of thousands of them, so they travel and are searched
 * in this form from the compiler to the worker's game and the page's: the rows
 * are ordered by script, then start line, then start column, which lets a
 * source line be resolved by binary search, and the numbers are one typed
 * array, which crosses a worker boundary as a block of bytes.
 */
export interface PathLocationTable {
  /** The paths, ordered by script, then start line, then start column. */
  paths: string[];
  /** Five numbers per path — a {@link ScriptLocation} — in `paths` order. */
  values: Int32Array;
}

export interface SparkProgram {
  uri: string;
  scripts: Record<string, number>;
  files: Record<string, Omit<File, "src" | "text" | "data">>;
  compiled?: Record<string, any>;
  /**
   * The compiled program as binary buffer PIECES (#314), set INSTEAD of
   * `compiled` when `SparkdownCompilerConfig.binaryProgram` is on.
   *
   * Deliberately not packed into one self-describing blob. Packing costs ~10ms
   * per compile (it re-encodes the whole string table to UTF-8) and buys
   * nothing for a worker hop: `nodes` and `numbers` are typed arrays that
   * TRANSFER in O(1), and only `strings` is structured-cloned. Packing is for
   * persistence and `SharedArrayBuffer` — use `encodeProgramBuffer` when a
   * single self-describing blob is actually what is needed.
   */
  compiledBuffer?: ProgramBuffer;
  workspace?: string;
  startFrom?: { file: string; line: number };
  /** Where this compile can differ from the one before it, and whether that is
   *  the whole difference. Read by a client holding work planned against the
   *  previous program; see {@link ProgramChangeSummary}. */
  changes?: ProgramChangeSummary;
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
  /**
   * Identifies the assembled `context` (#654). Two programs carrying the same
   * revision carry the same context, so a consumer that derived something from
   * it — the engine channels below, the Game's runtime define tables — can keep
   * what it derived instead of deriving it again. It moves whenever a
   * definition, a declaration, a file or the compiler configuration changes,
   * and whenever this compile's own implicit definitions differ.
   */
  contextRevision?: string;
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
  pathLocations?: PathLocationTable;
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
  // Per top-level flow (a scene, a function, or `0` for root content): the
  // asset names its beats reference in document order, plus the flows it can
  // reach. Read by the engine's asset module for prediction and explicit
  // loads (docs/engine/asset-preloading-spec.md). Absent when the compile
  // threw.
  sceneAssets?: { [flowName: string]: SceneAssets };
  version?: number;
}
