import { Create } from "../../../core/types/Create";
import { Typewriter } from "../types/Typewriter";

export const default_typewriter: Create<Typewriter> = (obj) => ({
  $type: "typewriter",
  $name: "$default",
  $link: {
    synth: {},
  },
  clear_on_continue: true,
  fade_duration: 0,
  animation_offset: 0.06,
  letter_pause: 0,
  phrase_pause_scale: 5,
  em_dash_pause_scale: 16,
  stressed_pause_scale: 10,
  punctuated_pause_scale: 15,
  min_syllable_length: 3,
  voiced: /([\p{L}\p{N}']+)/u.toString(),
  yelled: /^([\p{Lu}]{2,}[^\p{Ll}\r\n]*)$/u.toString(),
  punctuated: /(?:^|\s)(?:[.]\s*?)+(?:$|\s)/u.toString(),
  ...obj,
});
