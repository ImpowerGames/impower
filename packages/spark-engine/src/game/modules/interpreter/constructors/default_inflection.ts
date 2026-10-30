import type { Inflection } from "../types/Inflection";

export const default_inflection = (obj?: Partial<Inflection>): Inflection => ({
  $link: {
    image: {},
    audio: {},
    synth: {},
    character: {},
    typewriter: {},
    prosody: {},
  },
  lilt_question: [1, 2, 3, 4, 5],
  lilt_exclamation: [3, 4, 5, 6, 7],
  lilt: [1, -2, 7, 10],
  anxious_lilt: [1, -4, 10, 7],
  exclamation: [2, 5],
  resolved_anxious_question: [-1, 0],
  anxious_question: [-1, 2],
  resolved_question: [1, 1],
  anxious: [-1, -1],
  question: [0, 2],
  partial: [1, 1],
  comma: [-1, -1],
  statement: [0, 0],
  ...(obj || {}),
});
