import {
  keepStateArguments,
  markCombinatorNames,
  markNameAts,
  markSelectorArgumentNames,
  NAME_AT,
  SELECTOR_STATE_ALIASES,
  trimStateArguments,
  writeSelectorStates,
} from "../../../sparkdown/src/compiler/constants/selectorStates";
import { escapeCssIdentifier } from "../../../sparkle-style-transformer/src/utils/themeVariableName";

const NAME_AT_ESCAPE = escapeCssIdentifier("@");

const SCREEN_STATE_ALIASES: Readonly<Record<string, string>> = {
  ...SELECTOR_STATE_ALIASES,
  "@theme(": "@media(prefers-color-scheme:",
};

const DESCENDANT_REGEX = /[ ]*[>][>][ ]*/g;
const SPACE_BEFORE_IDENTIFIER_REGEX = /(?:^|[ ]+)(?=[_\p{L}])/gu;
const SPACE_BEFORE_SELECTOR_OPERATOR_REGEX = /[ ]+(?=[^_\p{L}])/gu;
const ATTRIBUTE_SELECTOR_REGEX =
  /[#]((?:[_\p{L}][_\p{L}0-9-]*)?(?:(?:[~]|[|]|[\^]|[$]|[*])?[=](?:["](?:\\.|[^"\r\n])*["]|.*?(?=$|[\s"'`<>=:(){}\[\]]))?)?)/gu;

const _breakpointRegexCache: Record<string, RegExp> = {};
function breakpointRegex(name: string) {
  return (
    _breakpointRegexCache[name] ??
    (_breakpointRegexCache[name] = new RegExp(`width:[ ]*${name}[ ]*[)]`, "g"))
  );
}

export function sparkleSelectorToCssSelector(
  selector: string,
  breakpoints: Record<string, number>,
): string {
  const kept = keepStateArguments(selector);
  const OUT: string[] = [];
  const parts = markSelectorArgumentNames(kept.selector).split(/(["](?:\\.|[^"])*["]|['](?:\\.|[^'])*['])/);

  for (let idx = 0; idx < parts.length; idx++) {
    const piece = parts[idx]!;
    if (idx & 1) {
      OUT.push(piece);
      continue;
    }

    let rewritten = writeSelectorStates(
      markCombinatorNames(
        markNameAts(trimStateArguments(piece)).replace(ATTRIBUTE_SELECTOR_REGEX, (_, inner: string) => `[${inner.replaceAll("@", NAME_AT)}]`),
      )
        .replace(SPACE_BEFORE_IDENTIFIER_REGEX, ".")
        .replace(SPACE_BEFORE_SELECTOR_OPERATOR_REGEX, "")
        .replace(DESCENDANT_REGEX, " "),
      SCREEN_STATE_ALIASES,
    ).replaceAll(NAME_AT, NAME_AT_ESCAPE);

    for (const [name, px] of Object.entries(breakpoints)) {
      rewritten = rewritten.replace(breakpointRegex(name), `width:${px}px)`);
    }

    OUT.push(kept.restore(rewritten));
  }

  const res = OUT.join("").trim();

  return res;
}
