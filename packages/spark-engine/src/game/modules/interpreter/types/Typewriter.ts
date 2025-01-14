import { Reference } from "../../../core/types/Reference";

export interface Typewriter extends Reference<"typewriter"> {
  clear_on_continue: boolean;
  fade_duration: number;
  animation_offset: number;
  letter_pause: number;
  phrase_pause_scale: number;
  em_dash_pause_scale: number;
  stressed_pause_scale: number;
  punctuated_pause_scale: number;
  min_syllable_length: number;
  /** Words that are spoken aloud */
  voiced: string;
  /** Words that are pitched up */
  yelled: string;
  /** Phrases where each char is punctuated with the typewriter's synth sound */
  punctuated: string;
}
