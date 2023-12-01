import { Create } from "../../../core/types/Create";
import { Prosody } from "../Prosody";

export const _prosody: Create<Prosody> = () => ({
  /** Yes(~?) */
  lilt_question: /(?:^|\b)[~]+([!?]*[?][!?]*)[ "']*$/.source,
  /** Yes(~!) */
  lilt_exclamation: /(?:^|\b)[~]+([!]+)[ "']*$/.source,
  /** Yes(~) */
  lilt: /(?:^|\b)([~]+)[ ]*$/.source,
  /** Yes(~...) */
  anxious_lilt: /(?:^|\b)([~]+)[.][.][.]+[ "']*$/.source,
  /** Yes(!) */
  exclamation: /(?:^|\b)([!?]*[!][!?]*)[ "']*$/.source,
  /** Who's that(...?) */
  resolved_anxious_question:
    /(?:^|\b)(?:who|whose|what|when|where|why|which|how)\b.*\b[^\t\n\r !?]+[.][.][.]+([!?]*[?][!?]*)[ "']*$/
      .source,
  /** Who's that(?) */
  resolved_question:
    /(?:^|\b)(?:who|whose|what|when|where|why|which|how)\b.*\b[^\t\n\r !?]+([!?]*[?][!?]*)[ "']*$/
      .source,
  /** Yes(...?) */
  anxious_question: /(?:^|\b)[.][.][.]+([?]+)[ "']*$/.source,
  /** Yes(?) */
  question: /(?:^|\b)([!?]*[?][!?]*)[ "']*$/.source,
  /** Yes(,) */
  comma: /(?:^|\b)([,])[ "']*$/.source,
  /** Yes(--) */
  partial: /(?:^|\b)[-]([-]+)[ "']*$/.source,
  /** Yes(...) */
  anxious: /(?:^|\b)[.][.]([.]+)[ "']*$/.source,
  /** Yes(.) */
  statement: /(?:^|\b)([.])[ "']*$/.source,
});
