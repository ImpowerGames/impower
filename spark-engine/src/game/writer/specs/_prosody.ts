import { Create } from "../../core/types/Create";
import { Prosody } from "../types/Prosody";
import { _contractions } from "./_contractions";
import { _weakWords } from "./_weakWords";

export const _prosody: Create<Prosody> = () => ({
  maxSyllableLength: 4,

  weakWords: _weakWords(),
  contractions: _contractions(),

  /** Words that are spoken aloud */
  voiced: /([\p{L}\p{N}']+)/u.source,
  /** Words that are yelled loudly */
  yelled: /^([^\p{Ll}\r\n]*?\p{Lu}\p{Lu}[^\p{Ll}\r\n]*?)$/u.source,
  /** Punctuation that is typed with a sound */
  punctuation: /([.!?-]+)/u.source,

  /** Who's that(...?) */
  resolvedAnxiousQuestion:
    /(?:^[\t ]*|\b)(?:who|whose|who's|what|what's|when|when's|where|where's|why|why's|which|how|how's)\b.*\b[^\t\n\r !?]+([.][.][.][!?]*[?][!?]*)[ ]*$/
      .source,
  /** Yes(...?) */
  anxiousQuestion: /(?:^[\t ]*|\b)[^\t\n\r .?]*([.][.][.]+[?]+)[ ]*$/.source,
  /** Who's that(?) */
  resolvedQuestion:
    /(?:^[\t ]*|\b)(?:who|whose|who's|what|what's|when|when's|where|where's|why|why's|which|how|how's)\b.*\b[^\t\n\r !?]+([!?]*[?][!?]*)[ ]*$/
      .source,
  /** Yes(?) */
  question: /(?:^[\t ]*|\b)[^\t\n\r !?]*([!?]*[?][!?]*)[ ]*$/.source,
  /** Yes(!) */
  exclamation: /(?:^[\t ]*|\b)[^\t\n\r !?]*([!]+)[ ]*$/.source,
  /** Yes(~?) */
  liltQuestion: /(?:^[\t ]*|\b)[^\t\n\r ~!?]*([~]+[!?]*[?][!?]*)[ ]*$/.source,
  /** Yes(~!) */
  liltExclamation: /(?:^[\t ]*|\b)[^\t\n\r ~!?]*([~]+[!]+)[ ]*$/.source,
  /** Yes(~) */
  lilt: /(?:^[\t ]*|\b)[^\t\n\r ~]*([~]+)[ ]*$/.source,
  /** Yes(,) */
  comma: /(?:^[\t ]*|\b)[^\t\n\r ,]*([,])[ ]*$/.source,
  /** Yes(--) */
  partial: /(?:^[\t ]*|\b)[^\t\n\r -]*([-][-]+)[ ]*$/.source,
  /** Yes(...) */
  anxious: /(?:^[\t ]*|\b)[^\t\n\r .]*([.][.][.]+)[ ]*$/.source,
  /** Yes(.) */
  statement: /(?:^[\t ]*|\b)[^\t\n\r .]*([.])[ ]*$/.source,
});
