import { File } from "./File";
import { SparkdownCompilerDefinitions } from "./SparkdownCompilerDefinitions";

export interface SparkdownCompilerConfig {
  definitions?: SparkdownCompilerDefinitions;
  files?: File[];
  skipValidation?: boolean;
  /**
   * Omit the inlined SVG source (`data`) from image structs in
   * `program.context`. Hosts that serve `/file:/` through a service worker
   * (the impower web editor + its player) opt in: their `filtered_image`s
   * resolve to on-demand `?filters=` URLs instead (#299), and the raw source
   * dominated the program payload (7.5MB of 8.9MB on a large project). Hosts
   * with no service worker (VS Code's webviews) must NOT set this — their
   * filtering depends on the inlined source.
   */
  stripImageData?: boolean;
  /**
   * Serialize the compiled program to the binary format (#314) instead of a
   * JSON object tree, exposing it as `program.compiledBinary`.
   *
   * Off by default: the JSON path stays the default and the fallback, so a
   * regression in the binary path can be bisected without a revert. Hosts opt
   * in when they can carry an `ArrayBuffer` across their worker boundary,
   * where the win is — the encoder itself is not faster than
   * `JSON.stringify`; skipping the structured clone and the re-parse is.
   */
  binaryProgram?: boolean;
  workspace?: string;
  startFrom?: { file: string; line: number };
  simulationOptions?: Record<
    string,
    {
      favoredConditions?: (boolean | undefined)[];
      favoredChoices?: (number | undefined)[];
    }
  >;
}
