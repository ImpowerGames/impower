// The comment directive lint, ported from Luau's `Analysis/src/Linter.cpp`
// (`lintComments` and `fuzzyMatch`); Luau is MIT-licensed (see
// `LICENSE-luau.txt`). Only the checks that concern a module's type checking
// mode are ported: a directive after the first token, a mode directive with
// more on its line or given twice, and a directive Luau does not know. The
// checks of the `nolint`, `optimize` and `native` directives' arguments are
// left out, since Sparkdown has no use for those directives.

import type { Location } from "./Location";
import type { HotComment } from "./Module";
import { editDistance } from "./StringUtils";

/** A lint warning (Luau's `LintWarning`, without its code). */
export interface LintWarning {
  location: Location;
  text: string;
}

// Luau's `FInt::LuauSuggestionDistance`.
const SUGGESTION_DISTANCE = 4;

function fuzzyMatch(str: string, array: readonly string[]): string | undefined {
  let bestDistance = SUGGESTION_DISTANCE;
  let bestMatch: string | undefined;
  for (const candidate of array) {
    const ed = editDistance(str, candidate);
    if (ed <= bestDistance) {
      bestDistance = ed;
      bestMatch = candidate;
    }
  }
  return bestMatch;
}

const HOT_COMMENTS = ["nolint", "nocheck", "nonstrict", "strict", "optimize", "native"];

/** Luau's `lintComments`, for the checks that concern a module's mode (see above). */
export function lintComments(hotcomments: readonly HotComment[]): LintWarning[] {
  const warnings: LintWarning[] = [];
  let seenMode = false;
  for (const hc of hotcomments) {
    // We reserve --!<space> for various informational (non-directive) comments
    if (hc.content.length === 0 || hc.content[0] === " " || hc.content[0] === "\t") continue;

    if (!hc.header) {
      warnings.push({ location: hc.location, text: "Comment directive is ignored because it is placed after the first non-comment token" });
      continue;
    }

    const space = hc.content.search(/[ \t]/);
    const first = space < 0 ? hc.content : hc.content.slice(0, space);
    if (first === "nocheck" || first === "nonstrict" || first === "strict") {
      if (space >= 0) {
        warnings.push({ location: hc.location, text: "Comment directive with the type checking mode has extra symbols at the end of the line" });
      } else if (seenMode) {
        warnings.push({ location: hc.location, text: "Comment directive with the type checking mode has already been used" });
      } else {
        seenMode = true;
      }
    } else if (!HOT_COMMENTS.includes(first)) {
      const suggestion = fuzzyMatch(first, HOT_COMMENTS);
      warnings.push({
        location: hc.location,
        text: suggestion ? `Unknown comment directive '${first}'; did you mean '${suggestion}'?` : `Unknown comment directive '${first}'`,
      });
    }
  }
  return warnings;
}
