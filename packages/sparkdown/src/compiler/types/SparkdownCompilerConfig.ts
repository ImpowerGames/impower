import { File } from "./File";
import { SparkdownCompilerDefinitions } from "./SparkdownCompilerDefinitions";

export interface SparkdownCompilerConfig {
  definitions?: SparkdownCompilerDefinitions;
  files?: File[];
  skipValidation?: boolean;
  // When true, compile the bundled builtins prelude (builtins.sd) as an implicit
  // include of every program — populating both program.context AND the runtime
  // __def tables — instead of injecting the JS `definitions.builtins` into
  // context via populateBuiltins. Transitional flag for the builtins→prelude
  // migration (lets the golden-master compare both paths).
  useBuiltinsPrelude?: boolean;
  // When true (and useBuiltinsPrelude is on), the builtins prelude is also
  // SOURCE-INJECTED into the program's runtime story as a synthetic leading
  // `include`, so the builtin `__def` global declarations run in the SAME VM as
  // the authored defines — making `buildDefinesContext(story)` resolve authored
  // defines' inheritance from builtin types (e.g. `as animation` → builtin
  // `timing`) via the runtime `__index` chain. This is how the Game sources its
  // define context (the static `program.defines` channel was retired). Only
  // affects `program.compiled` — `program.context` still comes from
  // mergePreludeContext, unchanged. Default OFF (the prelude parse adds cost, so
  // the pure-LSP diagnostics path leaves it off; any compile feeding a Game must
  // turn it on — the player worker and the test harnesses do).
  seedBuiltinsIntoStory?: boolean;
  // When true, the lowerer emits SIMPLE display statements (plain text, single
  // beat, no interpolation/divert/alternator/tag) as a native `display(<table>)`
  // Luau call carrying a pre-parsed `{ target, text }` instruction table,
  // instead of the legacy flat ink text + routing tag. Transitional flag for
  // the display double-parse elimination (see project_display_parse_compiletime):
  // off by default so existing goldens stay byte-identical; complex content
  // always falls back to the legacy path until the table shape grows.
  experimentalDisplayCalls?: boolean;
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
