import type { ProgramBuffer } from "../../binary/programBinary";
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
