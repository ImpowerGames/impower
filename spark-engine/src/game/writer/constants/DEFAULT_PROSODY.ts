import { Prosody } from "../types/Prosody";
import { DEFAULT_CONTRACTIONS } from "./DEFAULT_CONTRACTIONS";
import { DEFAULT_WEAK_WORDS } from "./DEFAULT_WEAK_WORDS";

export const DEFAULT_PROSODY: Prosody = {
  maxSyllableLength: 4,

  weakWords: DEFAULT_WEAK_WORDS,
  contractions: DEFAULT_CONTRACTIONS,

  /** Words that are spoken aloud */
  voiced: /([\p{L}\p{N}']+)/u,
  /** Words that are yelled loudly */
  yelled: /^([^\p{Ll}\r\n]*?\p{Lu}\p{Lu}[^\p{Ll}\r\n]*?)$/u,
  /** Punctuation that is typed with a sound */
  punctuation: /([.!?-]+)/u,

  /** Who's that(...?) */
  resolvedAnxiousQuestion:
    /(?:^[\t ]*|\b)(?:who|whose|who's|what|what's|when|when's|where|where's|why|why's|which|how|how's)\b.*\b[^\t\n\r !?]+([.][.][.][!?]*[?][!?]*)[ ]*$/,
  /** Yes(...?) */
  anxiousQuestion: /(?:^[\t ]*|\b)[^\t\n\r .?]*([.][.][.]+[?]+)[ ]*$/,
  /** Who's that(?) */
  resolvedQuestion:
    /(?:^[\t ]*|\b)(?:who|whose|who's|what|what's|when|when's|where|where's|why|why's|which|how|how's)\b.*\b[^\t\n\r !?]+([!?]*[?][!?]*)[ ]*$/,
  /** Yes(?) */
  question: /(?:^[\t ]*|\b)[^\t\n\r !?]*([!?]*[?][!?]*)[ ]*$/,
  /** Yes(!) */
  exclamation: /(?:^[\t ]*|\b)[^\t\n\r !?]*([!]+)[ ]*$/,
  /** Yes(~?) */
  liltQuestion: /(?:^[\t ]*|\b)[^\t\n\r ~!?]*([~]+[!?]*[?][!?]*)[ ]*$/,
  /** Yes(~!) */
  liltExclamation: /(?:^[\t ]*|\b)[^\t\n\r ~!?]*([~]+[!]+)[ ]*$/,
  /** Yes(~) */
  lilt: /(?:^[\t ]*|\b)[^\t\n\r ~]*([~]+)[ ]*$/,
  /** Yes(,) */
  comma: /(?:^[\t ]*|\b)[^\t\n\r ,]*([,])[ ]*$/,
  /** Yes(--) */
  partial: /(?:^[\t ]*|\b)[^\t\n\r -]*([-][-]+)[ ]*$/,
  /** Yes(...) */
  anxious: /(?:^[\t ]*|\b)[^\t\n\r .]*([.][.][.]+)[ ]*$/,
  /** Yes(.) */
  statement: /(?:^[\t ]*|\b)[^\t\n\r .]*([.])[ ]*$/,
};
