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
   * Serialize the compiled program at all (#345).
   *
   * Defaults to on. Hosts that never read the bytecode turn it OFF: the
   * language-server instance relays a slim projection that excludes `compiled`,
   * so serializing it costs ~25-30ms per keystroke on a large project for data
   * that is discarded, and the full program still rides the compile response
   * across the worker boundary.
   *
   * Only SERIALIZATION is skipped. `ExportRuntime` still runs, because
   * generation-time diagnostics come out of it and `populateAllLocations`
   * walks the runtime tree for `pathLocations`. Orthogonal to
   * {@link binaryProgram}, which selects the FORM when something is emitted.
   */
  emitCompiledProgram?: boolean;
  /**
   * Serialize the compiled program to the binary format (#314) instead of a
   * JSON object tree, exposing it as `program.compiledBuffer`.
   *
   * Off by default: the JSON path stays the default and the fallback, so a
   * regression in the binary path can be bisected without a revert. Not a
   * speed win — measured, it is a wash end to end and ~10% on payload; it
   * exists because a binary program is wanted for its own sake (obfuscation,
   * a self-contained artifact). Ignored when {@link emitCompiledProgram} is
   * off, since then nothing is emitted in either form.
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
