import { Create } from "../../../../core/types/Create";
import { Writer } from "../Writer";

export const _writer: Create<Writer> = (obj) => ({
  target: "",
  fade_duration: 0,
  letter_pause: 0,
  phrase_pause_scale: 5,
  em_dash_pause_scale: 16,
  stressed_pause_scale: 10,
  punctuated_pause_scale: 15,
  min_syllable_length: 3,
  animation_offset: 0.06,
  voiced: /([\p{L}\p{N}']+)/u.toString(),
  yelled: /^(\p{Lu}[^\p{Ll}\r\n]*)$/u.toString(),
  punctuated: /(?:^|\s)(?:[.]\s*?)+(?:$|\s)/u.toString(),
  skipped: "",
  ...(obj || {}),
});
