import { type Reference } from "../../../core/types/Reference";

export interface Typewriter extends Reference<"typewriter"> {
  fade_duration: number;
  animation_offset: number;
  letter_pause: number;
  phrase_pause_scale: number;
  em_dash_pause_scale: number;
  stressed_pause_scale: number;
  punctuated_pause_scale: number;
  min_syllable_length: number;
  voiced: string;
  yelled: string;
  punctuated: string;
}
