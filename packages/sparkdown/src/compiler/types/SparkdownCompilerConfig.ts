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
  // `timing`) via the runtime `__index` chain. P5 prerequisite for true
  // runtime-sourcing of defines. Only affects `program.compiled` — `program.context`
  // (and the derived `program.defines` channel) still come from mergePreludeContext,
  // unchanged. Default OFF (the prelude parse adds cost; see the perf-cache follow-up).
  seedBuiltinsIntoStory?: boolean;
  // When true, the lowerer emits SIMPLE display statements (plain text, single
  // beat, no interpolation/divert/alternator/tag) as a native `display(<table>)`
  // Luau call carrying a pre-parsed `{ target, text }` instruction table,
  // instead of the legacy flat ink text + routing tag. Transitional flag for
  // the display double-parse elimination (see project_display_parse_compiletime):
  // off by default so existing goldens stay byte-identical; complex content
  // always falls back to the legacy path until the table shape grows.
  experimentalDisplayCalls?: boolean;
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
