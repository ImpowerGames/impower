import { Create } from "../../../core/types/Create";
import { _synth } from "../../../sound/specs/defaults/_synth";
import { Writer } from "../Writer";

export const _writer: Create<Writer> = (obj) => ({
  target: "",
  letter_fade_duration: 0,
  letter_pause: 0.025,
  phrase_pause_scale: 5,
  em_dash_pause_scale: 16,
  stressed_pause_scale: 10,
  punctuated_pause_scale: 20,
  min_syllable_length: 3,
  animation_offset: 0.06,
  voiced: /([\p{L}\p{N}']+)/u.toString(),
  yelled: /^(\p{Lu}[^\p{Ll}\r\n]*)$/u.toString(),
  punctuated: /(?:^|\s)(?:[.?!]\s*?)+(?:$|\s)/u.toString(),
  skipped: "",
  floating_animation: "floating 750ms ease-in-out infinite",
  trembling_animation: "trembling 300ms ease-in-out infinite",
  ...(obj || {}),
  synth: _synth({
    shape: "whitenoise",
    envelope: {
      attack: 0.01,
      decay: 0.003,
      sustain: 0.04,
      release: 0.01,
      level: 0.14,
    },
    pitch: { frequency: 4790 },
    arpeggio: {
      on: true,
      rate: 100,
      levels: [0.05, 0.15, 0.1, 0.01, 0, 0.05, 0],
    },
    ...(obj?.synth || {}),
  }),
});
