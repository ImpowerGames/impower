import { SynthConfig } from "../../sound";

export interface Writer {
  target: string;
  hidden: string;
  letter_delay: number;
  animation_offset: number;
  phrase_pause_scale: number;
  em_dash_pause_scale: number;
  stressed_pause_scale: number;
  punctuated_pause_scale: number;
  floating_animation: string;
  trembling_animation: string;
  fade_duration: number;
  synth: SynthConfig;
  min_syllable_length: number;
  /** Words that are spoken aloud */
  voiced: string;
  /** Words that are pitched up */
  yelled: string;
  /** Phrases where each char is punctuated with the writer's synth sound */
  punctuated: string;
}
