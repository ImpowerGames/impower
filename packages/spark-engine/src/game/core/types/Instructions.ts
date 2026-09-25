import type {
AudioInstruction,
ImageInstruction,
LoadInstruction,
LayoutInstruction,
TextInstruction,
} from "./Instruction";

export interface Instructions {
  load?: LoadInstruction[];
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
