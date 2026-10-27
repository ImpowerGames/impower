import type {
AudioInstruction,
CutsceneInstruction,
ImageInstruction,
LoadInstruction,
LayoutInstruction,
TextInstruction,
} from "./Instruction";

export interface Instructions {
  load?: LoadInstruction[];
  /** `[[play NAME]]` cutscenes. The interpreter queues each one as a beat of
   *  its own, so a beat the Coordinator runs holds at most one. */
  cutscene?: CutsceneInstruction[];
  text?: Record<string, TextInstruction[]>;
  image?: Record<string, ImageInstruction[]>;
  audio?: Record<string, AudioInstruction[]>;
  /** `[[open LAYOUT]]` / `[[close LAYOUT]]` / `[[navigate SCREEN to LAYOUT]]`
   *  layout-lifecycle directives, in source order. Keyed by layout name so
   *  multiple opens/closes of distinct layouts in one beat all survive a merge. */
  layout?: Record<string, LayoutInstruction[]>;
  choices?: string[];
  uuids?: string[];
  auto?: boolean;
  /** Present on a beat queued again for a run that starts on it (#1606):
   *  it waits for the player whatever it holds, though the beat as it first
   *  ran may have advanced on its own. */
  hold?: boolean;
  /** Present on a beat that carries on in the box the beat before it left
   *  (`A .. >` then `.. B`): for each text target, how many of its leading events that
   *  box already shows. They are written at once, and only the rest is
   *  revealed with the typewriter. The beat keeps the pictures and the `sound`
   *  and `voice` audio already playing. Empty on a beat with no text of its
   *  own (pictures, sound or a load while the box waits), which leaves the
   *  box's text on the page. */
  extended?: Record<string, number>;
  end: number;
}
