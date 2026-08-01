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
   * Serialize the compiled program into `program.compiled` (#345).
   *
   * Defaults to on. Hosts that never read the bytecode turn it OFF: the
   * language-server instance relays a slim projection that excludes `compiled`,
   * so serializing it costs ~25-30ms per keystroke on a large project for data
   * that is discarded, and the full program still rides the compile response
   * across the worker boundary.
   *
   * Only SERIALIZATION is skipped. `ExportRuntime` still runs, because
   * generation-time diagnostics come out of it and `populateAllLocations`
   * walks the runtime tree for `pathLocations`.
   */
  emitCompiledProgram?: boolean;
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
