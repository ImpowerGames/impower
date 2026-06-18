import {
  AudioInstruction,
  ImageInstruction,
  LoadInstruction,
  ScreenInstruction,
  TextInstruction,
} from "./Instruction";

export interface Instructions {
  load?: LoadInstruction[];
  text?: Record<string, TextInstruction[]>;
  image?: Record<string, ImageInstruction[]>;
  audio?: Record<string, AudioInstruction[]>;
  /** `[[open SCREEN]]` / `[[close SCREEN]]` screen-lifecycle directives, in
   *  source order. Keyed by screen name so multiple opens/closes of distinct
   *  screens in one beat all survive a merge. */
  screen?: Record<string, ScreenInstruction[]>;
  choices?: string[];
  uuids?: string[];
  auto?: boolean;
  end: number;
}
