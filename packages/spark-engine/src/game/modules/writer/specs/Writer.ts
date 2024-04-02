export interface Writer {
  skipped: string;
  letter_pause: number;
  animation_offset: number;
  phrase_pause_scale: number;
  em_dash_pause_scale: number;
  stressed_pause_scale: number;
  punctuated_pause_scale: number;
  fade_duration: number;
  min_syllable_length: number;
  /** Words that are spoken aloud */
  voiced: string;
  /** Words that are pitched up */
  yelled: string;
  /** Phrases where each char is punctuated with the writer's synth sound */
  punctuated: string;
  preserve_text: boolean;
  preserve_image: boolean;
}
