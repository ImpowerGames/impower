import { Create } from "../../core/types/Create";
import { Prosody } from "../types/Prosody";

export const _prosody: Create<Prosody> = () => ({
  /** Yes(~?) */
  liltQuestion: /\b[^\t\n\r ~!?]*[~]+([!?]*[?][!?]*)[ ]*$/.source,
  /** Yes(~!) */
  liltExclamation: /\b[^\t\n\r ~!?]*[~]+([!]+)[ ]*$/.source,
  /** Yes(~) */
  lilt: /\b[^\t\n\r ~]*([~]+)[ ]*$/.source,
  /** Who's that(...?) */
  resolvedAnxiousQuestion:
    /\b(?:who|whose|who's|what|what's|when|when's|where|where's|why|why's|which|how|how's)\b.*\b[^\t\n\r !?]+[.][.][.]+([!?]*[?][!?]*)[ ]*$/
      .source,
  /** Who's that(?) */
  resolvedQuestion:
    /\b(?:who|whose|who's|what|what's|when|when's|where|where's|why|why's|which|how|how's)\b.*\b[^\t\n\r !?]+([!?]*[?][!?]*)[ ]*$/
      .source,
  /** Yes(...?) */
  anxiousQuestion: /\b[^\t\n\r .?]*[.][.][.]+([?]+)[ ]*$/.source,
  /** Yes(?) */
  question: /\b[^\t\n\r !?]*([!?]*[?][!?]*)[ ]*$/.source,
  /** Yes(!) */
  exclamation: /\b[^\t\n\r !?]*([!]+)[ ]*$/.source,
  /** Yes(,) */
  comma: /\b[^\t\n\r ,]*([,])[ ]*$/.source,
  /** Yes(--) */
  partial: /\b[^\t\n\r -]*[-]([-]+)[ ]*$/.source,
  /** Yes(...) */
  anxious: /\b[^\t\n\r .]*[.][.]([.]+)[ ]*$/.source,
  /** Yes(.) */
  statement: /\b[^\t\n\r .]*([.])[ ]*$/.source,
});
