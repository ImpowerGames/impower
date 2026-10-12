import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";

/** What the game showing the preview remembers of the last one. */
export interface PreviewingGame {
  state: string;
  previewFrom: { file: string; line: number } | undefined;
  previewAddress: ProgramAddress | undefined;
  previewedAddress: ProgramAddress | undefined;
}

export interface PreviewPoint {
  /** The point to preview: the cursor, or the remembered one. */
  from: { file: string; line: number };
  /** The address that point resolves to against this program, which the
   *  mark names; nothing when it resolves to none. */
  address: ProgramAddress | null | undefined;
  /** The address to compare against what the game last displayed, which
   *  keeps a point's old address so a repeat can be told from a first
   *  preview. */
  validAddress: ProgramAddress | null | undefined;
  /** This is the preview that already ran, so it only has to be awaited
   *  again rather than replayed. */
  repeat: boolean;
}

/** Where a preview at `from` lands, for a game holding `program`. The point
 *  resolves through the program's accessor (`ProgramLocator.addressAt`). */
export function resolvePreviewPoint(
  program: SparkProgram,
  from: { file: string; line: number },
  programChanged: boolean,
  game: PreviewingGame | undefined,
): PreviewPoint {
  const locator = programLocator(program);
  // A line that `>` breaks holds several beats, and a preview shows its last;
  // PLAY from the line starts at its first (#721).
  const address = locator.addressAt(from.file, from.line, { beat: "last" });

  // When the cursor sits on a line that resolves to no address we keep the
  // game's LAST valid preview point rather than resetting (sticky preview).
  // But a pure UI-only project — a `layout` whose only flows are the
  // synthetic `__binding$*` evaluators, which no address names — never
  // resolves one at all, so the game would never have a remembered point and
  // `game.preview()` would never be called even once. Its layouts are mounted
  // at connect but the layouts LAYER stays at `opacity:0`, so the whole UI
  // renders invisibly. Fall back to the cursor itself so the engine always
  // gets its preview call and can reveal the UI (Game.preview's no-address
  // branch).
  const validFrom = (address != null ? from : game?.previewFrom) ?? from;
  // The address `game.preview()` will resolve for that point against THIS
  // program: the cursor's own, or the remembered point's, which is the game's
  // own address for it while the program stands and is resolved again after
  // a recompile, which can move it. The mark names this address, so the
  // asset module centres its prediction window on the beat the preview
  // displays, and a point that no longer resolves (its script renamed, its
  // line deleted) marks nothing.
  const resolved =
    address != null
      ? address
      : programChanged
        ? locator.addressAt(validFrom.file, validFrom.line, { beat: "last" })
        : game?.previewAddress;
  // A point that no longer resolves keeps its old address for the repeat
  // below, which needs it to tell a repeat from a first preview.
  const validAddress = resolved ?? game?.previewAddress;

  // Only a repeat of a preview that actually ran. A UI-only project resolves
  // no address at all, so both sides of the comparison are undefined there —
  // matching on that would treat "we have never previewed anything" as
  // "already done" and skip the reconnect that re-evaluates its bindings.
  const repeat =
    game != null &&
    game.state === "previewing" &&
    validAddress != null &&
    game.previewedAddress === validAddress &&
    !programChanged;

  return { from: validFrom, address: resolved, validAddress, repeat };
}
