import { Prosody } from "../types/Prosody";

export const default_prosody = (obj?: Partial<Prosody>): Prosody => ({
  /** Yes(~?) */
  lilt_question: /(?:^|\b)[~]+([!?]*[?][!?]*)[ "']*$/.toString(),
  /** Yes(~!) */
  lilt_exclamation: /(?:^|\b)[~]+([!]+)[ "']*$/.toString(),
  /** Yes(~) */
  lilt: /(?:^|\b)([~]+)[ ]*$/.toString(),
  /** Yes(~...) */
  anxious_lilt: /(?:^|\b)([~]+)[.][.][.]+[ "']*$/.toString(),
  /** Yes(!) */
  exclamation: /(?:^|\b)([!?]*[!][!?]*)[ "']*$/.toString(),
  /** Who's that(...?) */
  resolved_anxious_question:
    /(?:^|\b)(?:who|whose|what|when|where|why|which|how)\b.*\b[^\t\n\r !?]+[.][.][.]+([!?]*[?][!?]*)[ "']*$/.toString(),
  /** Who's that(?) */
  resolved_question:
    /(?:^|\b)(?:who|whose|what|when|where|why|which|how)\b.*\b[^\t\n\r !?]+([!?]*[?][!?]*)[ "']*$/.toString(),
  /** Yes(...?) */
  anxious_question: /(?:^|\b)[.][.][.]+([?]+)[ "']*$/.toString(),
  /** Yes(?) */
  question: /(?:^|\b)([!?]*[?][!?]*)[ "']*$/.toString(),
  /** Yes(,) */
  comma: /(?:^|\b)([,])[ "']*$/.toString(),
  /** Yes(--) */
  partial: /(?:^|\b)[-]([-]+)[ "']*$/.toString(),
  /** Yes(...) */
  anxious: /(?:^|\b)[.][.]([.]+)[ "']*$/.toString(),
  /** Yes(.) */
  statement: /(?:^|\b)([.])[ "']*$/.toString(),
  ...(obj || {}),
});
