import { Create } from "../../core/types/Create";
import { Prosody } from "../types/Prosody";

export const _prosody: Create<Prosody> = () => ({
  /** Yes(!) */
  exclamation: /(?:^|\b)([!?]*[!][!?]*)[ "']*$/.source,
  /** Yes(~?) */
  liltQuestion: /(?:^|\b)[~]+([!?]*[?][!?]*)[ "']*$/.source,
  /** Yes(~!) */
  liltExclamation: /(?:^|\b)[~]+([!]+)[ "']*$/.source,
  /** Yes(~) */
  lilt: /(?:^|\b)([~]+)[ ]*$/.source,
  /** Who's that(...?) */
  resolvedAnxiousQuestion:
    /(?:^|\b)(?:who|whose|what|when|where|why|which|how)\b.*\b[^\t\n\r !?]+[.][.][.]+([!?]*[?][!?]*)[ "']*$/
      .source,
  /** Who's that(?) */
  resolvedQuestion:
    /(?:^|\b)(?:who|whose|what|when|where|why|which|how)\b.*\b[^\t\n\r !?]+([!?]*[?][!?]*)[ "']*$/
      .source,
  /** Yes(...?) */
  anxiousQuestion: /(?:^|\b)[.][.][.]+([?]+)[ "']*$/.source,
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
