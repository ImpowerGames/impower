import {
  keepStateArguments,
  SELECTOR_STATE_ALIASES,
  writeSelectorStates,
} from "../../../sparkdown/src/compiler/constants/selectorStates";

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
  const OUT: string[] = [];
  const parts = selector.split(/(["](?:\\.|[^"])*["]|['](?:\\.|[^'])*['])/);

  for (let idx = 0; idx < parts.length; idx++) {
    const piece = parts[idx]!;
    if (idx & 1) {
      OUT.push(piece);
      continue;
    }

    const kept = keepStateArguments(piece);
    let rewritten = writeSelectorStates(
      kept.selector
        .replace(ATTRIBUTE_SELECTOR_REGEX, "[$1]")
        .replace(SPACE_BEFORE_IDENTIFIER_REGEX, ".")
        .replace(SPACE_BEFORE_SELECTOR_OPERATOR_REGEX, "")
        .replace(DESCENDANT_REGEX, " "),
      SCREEN_STATE_ALIASES,
    );

    for (const [name, px] of Object.entries(breakpoints)) {
      rewritten = rewritten.replace(breakpointRegex(name), `width:${px}px)`);
    }

    OUT.push(kept.restore(rewritten));
  }

  const res = OUT.join("").trim();

  return res;
}
