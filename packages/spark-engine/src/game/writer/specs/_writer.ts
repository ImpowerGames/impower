import { Create } from "../../core/types/Create";
import { Writer } from "../types/Writer";

export const _writer: Create<Writer> = (obj?: Partial<Writer>) => ({
  className: "",
  letterDelay: 0.02,
  phrasePauseScale: 5,
  stressPauseScale: 15,
  yellPauseScale: 8,
  punctuatePauseScale: 20,
  fadeDuration: 0,
  clackSound: {
    shape: "brownnoise",
    envelope: {
      attack: 0.007,
      decay: 0.003,
      sustain: 0.04,
      release: 0.01,
      level: 0.2,
    },
    pitch: { frequency: 9790 },
    arpeggio: { on: true, rate: 100, levels: [0.2, 0.1, 0.01] },
  },
  hidden: "beat",
  minSyllableLength: 4,
  voiced: /([\p{L}\p{N}'.?!]+)/u.source,
  yelled: /^(\p{Lu}[^\p{Ll}\r\n]*)$/u.source,
  punctuated: /(?:^|\s)[.]{3,}(?:$|\s)/u.source,
  ...(obj || {}),
});
