import { Create } from "../../core/types/Create";
import { Writer } from "../types/Writer";

export const _writer: Create<Writer> = (obj?: Partial<Writer>) => ({
  className: "",
  letterDelay: 0.025,
  animationOffset: 0.06,
  phrasePauseScale: 5,
  emDashPauseScale: 16,
  stressPauseScale: 10,
  punctuatePauseScale: 20,
  fadeDuration: 0,
  clackSound: {
    shape: "whitenoise",
    envelope: {
      attack: 0.01,
      decay: 0.003,
      sustain: 0.04,
      release: 0.01,
      level: 0.14,
    },
    pitch: { frequency: 9790 },
    arpeggio: {
      on: true,
      rate: 100,
      levels: [0.05, 0.15, 0.1, 0.01, 0, 0.05, 0],
    },
  },
  hidden: "(beat)",
  minSyllableLength: 3,
  floatingAnimation: "floating 750ms ease-in-out infinite",
  tremblingAnimation: "trembling 300ms ease-in-out infinite",
  voiced: /([\p{L}\p{N}']+)/u.source,
  yelled: /^(\p{Lu}[^\p{Ll}\r\n]*)$/u.source,
  punctuated: /(?:^|\s)[.?!]{3,}(?:$|\s)/u.source,
  ...(obj || {}),
});
