import {
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
  end: number;
}
