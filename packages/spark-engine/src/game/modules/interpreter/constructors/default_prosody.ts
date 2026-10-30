import type { Prosody } from "../types/Prosody";

export const default_prosody = (obj?: Partial<Prosody>): Prosody => ({
  $link: {
    image: {},
    audio: {},
    synth: {},
    character: {},
    typewriter: {},
    inflection: {},
  },
  lilt_question: /(?:^|\b)[~]+([!?]*[?][!?]*)[ "']*$/.toString(),
  lilt_exclamation: /(?:^|\b)[~]+([!]+)[ "']*$/.toString(),
  lilt: /(?:^|\b)([~]+)[ ]*$/.toString(),
  anxious_lilt: /(?:^|\b)([~]+)[.][.][.]+[ "']*$/.toString(),
  exclamation: /(?:^|\b)([!?]*[!][!?]*)[ "']*$/.toString(),
  resolved_anxious_question:
    /(?:^|\b)(?:who|whose|what|when|where|why|which|how)\b.*\b[^\t\n\r !?]+[.][.][.]+([!?]*[?][!?]*)[ "']*$/.toString(),
  resolved_question:
    /(?:^|\b)(?:who|whose|what|when|where|why|which|how)\b.*\b[^\t\n\r !?]+([!?]*[?][!?]*)[ "']*$/.toString(),
  anxious_question: /(?:^|\b)[.][.][.]+([?]+)[ "']*$/.toString(),
  question: /(?:^|\b)([!?]*[?][!?]*)[ "']*$/.toString(),
  comma: /(?:^|\b)([,])[ "']*$/.toString(),
  partial: /(?:^|\b)[-]([-]+)[ "']*$/.toString(),
  anxious: /(?:^|\b)[.][.]([.]+)[ "']*$/.toString(),
  statement: /(?:^|\b)([.])[ "']*$/.toString(),
  ...(obj || {}),
});
