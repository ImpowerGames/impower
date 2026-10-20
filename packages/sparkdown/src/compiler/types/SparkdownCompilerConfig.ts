import type { File } from "./File";
import type { SparkdownCompilerDefinitions } from "./SparkdownCompilerDefinitions";

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
  // affects the program's declarations — `program.context` still comes from
  // mergePreludeContext, unchanged. Default OFF (the prelude parse adds cost, so
  // the pure-LSP diagnostics path leaves it off; any compile feeding a Game must
  // turn it on — the player worker and the test harnesses do).
  seedBuiltinsIntoStory?: boolean;
  /**
   * Omit the inlined SVG source (`data`) from image structs in
   * `program.context`. Hosts that serve `/file:/` through a service worker
   * (the impower web editor + its player) opt in: their `filtered_image`s
   * resolve to on-demand `?attributes=` URLs instead (#299), and the raw source
   * dominated the program payload (7.5MB of 8.9MB on a large project). Hosts
   * with no service worker (VS Code's webviews) must NOT set this — their
   * filtering depends on the inlined source.
   */
  stripImageData?: boolean;
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
