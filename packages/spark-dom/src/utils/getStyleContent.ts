import {
  DATA_ATTRIBUTE_PROPS,
  ARIA_ATTRIBUTE_ALIASES,
} from "../../../sparkdown/src/compiler/constants/dataAttributeProps";
import {
  keepStateArguments,
  markNameAts,
  markSelectorArgumentNames,
  NAME_AT,
  writeSelectorStates,
} from "../../../sparkdown/src/compiler/constants/selectorStates";
import { getCssEquivalent } from "../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import type { ThemeVariables } from "../../../sparkle-style-transformer/src/types/themeVariables";
import { getCssPropertyName } from "../../../sparkle-style-transformer/src/utils/getCssPropertyName";
import { escapeCssIdentifier } from "../../../sparkle-style-transformer/src/utils/themeVariableName";
import { getCssTokenValue } from "./getCssTokenValue";

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

const LEADING_DESCENDANT_REGEX = /(^|,)([ ]*)[>][>]/g;

const QUOTED_REGEX = /(["](?:\\.|[^"])*["]|['](?:\\.|[^'])*['])/;

const ARGUMENT_SPACING_REGEX =
  /(@(?:theme|screen[-_]size|container[-_]size))[(][ \t]*([^()\s]+)[ \t]*[)]/g;

const COLOR_SCHEME_VARIANT_REGEX = /@theme[(](light|dark)[)]/g;

export const COLOR_SCHEME_ATTRIBUTE = "data-color-scheme";

const unquoted = (selector: string) =>
  selector
    .split(QUOTED_REGEX)
    .filter((_, i) => !(i & 1))
    .join("");

const hasNestingSelector = (selector: string) =>
  unquoted(selector).includes("&");

function liftColorScheme(selector: string): string {
  if (!unquoted(selector).includes("@theme(")) {
    return selector;
  }
  return splitTopLevelCommas(selector)
    .map((part) => {
      let scheme: string | undefined;
      const rest = part
        .split(QUOTED_REGEX)
        .map((piece, i) =>
          i & 1
            ? piece
            : piece.replace(COLOR_SCHEME_VARIANT_REGEX, (_m, s: string) => {
                scheme = s;
                return "";
              }),
        )
        .join("")
        .trim();
      if (!scheme) {
        return part.trim();
      }
      const target = !rest
        ? "&"
        : hasNestingSelector(rest)
          ? rest
          : /^[:[]/.test(rest)
            ? `&${rest}`
            : `& ${rest}`;
      return `:where([${COLOR_SCHEME_ATTRIBUTE}="${scheme}"]) ${target}`;
    })
    .join(", ");
}

const DATA_ATTRIBUTE_SELECTOR_REGEX = /[#]([_\p{L}][_\p{L}0-9-]*)/gu;

const NAME_AT_ESCAPE = escapeCssIdentifier("@");

export function getCSSSelector(
  selector: string,
  breakpoints: Record<string, number>,
): string {
  selector = selector.replace(
    DATA_ATTRIBUTE_SELECTOR_REGEX,
    (m, name: string) =>
      ARIA_ATTRIBUTE_ALIASES.has(name)
        ? `#${ARIA_ATTRIBUTE_ALIASES.get(name)}`
        : DATA_ATTRIBUTE_PROPS.has(name)
          ? `#data-${name}`
          : m,
  );

  selector = selector.replace(LEADING_DESCENDANT_REGEX, "$1$2& >>");

  const kept = keepStateArguments(selector);
  const OUT: string[] = [];
  const parts = markSelectorArgumentNames(kept.selector).split(QUOTED_REGEX);

  for (let idx = 0; idx < parts.length; idx++) {
    const piece = parts[idx]!;
    if (idx & 1) {
      OUT.push(piece);
      continue;
    }

    let rewritten = writeSelectorStates(
      markNameAts(piece.replace(ARGUMENT_SPACING_REGEX, "$1($2)"))
        .replace(ATTRIBUTE_SELECTOR_REGEX, (_, inner: string) => `[${inner.replaceAll("@", NAME_AT)}]`)
        .replace(SPACE_BEFORE_IDENTIFIER_REGEX, ".")
        .replace(SPACE_BEFORE_SELECTOR_OPERATOR_REGEX, "")
        .replace(DESCENDANT_REGEX, " "),
    ).replaceAll(NAME_AT, NAME_AT_ESCAPE);

    for (const [name, px] of Object.entries(breakpoints)) {
      rewritten = rewritten.replace(breakpointRegex(name), `width:${px}px)`);
    }

    OUT.push(kept.restore(rewritten));
  }

  return liftColorScheme(OUT.join("").trim());
}

function splitTopLevelCommas(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(selector.slice(start));
  return parts;
}

export function anchorSelfTargeted(selector: string): string {
  return splitTopLevelCommas(selector)
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return trimmed;
      return !hasNestingSelector(trimmed) &&
        (trimmed.startsWith("[") || trimmed.startsWith(":"))
        ? "&" + trimmed
        : trimmed;
    })
    .filter(Boolean)
    .join(", ");
}

export const getStyleContent = (
  styles: Record<string, any>,
  options: {
    breakpoints: Record<string, number>;
    scope?: string;
    theme: ThemeVariables;
  },
): string => {
  const scope = options.scope;
  const scopeSelector = scope ? scope + " " : "";
  let textContent = "";
  Object.entries(styles).forEach(([name, style]) => {
    let styleContent = "";
    let level = 1;
    const process = (k: string, v: unknown) => {
      const indent = "  ".repeat(level);
      if (!k.startsWith("$")) {
        if (v && typeof v === "object" && !("$name" in v)) {
          const elementSelector = getCSSSelector(k, options.breakpoints);
          const selfTargetedSelector = anchorSelfTargeted(elementSelector);
          styleContent += `\n${indent}${selfTargetedSelector} {`;
          level++;
          Object.entries(v).forEach(([nk, nv]) => {
            process(nk, nv);
          });
          level--;
          styleContent += `\n${indent}}`;
        } else {
          const value = getCssTokenValue(v);
          if (
            (value != null && String(value) !== "") ||
            getCssPropertyName(k) === "content"
          ) {
            const cssEntries = getCssEquivalent(k, value, options.theme);
            for (const [k, v] of cssEntries) {
              styleContent += `\n${indent}${escapeCssIdentifier(k)}: ${v};`;
            }
          }
        }
      }
    };
    Object.entries(style).forEach(([k, v]) => {
      process(k, v);
    });
    styleContent = styleContent.trim();
    if (styleContent) {
      const elementSelector = getCSSSelector(name, options.breakpoints);
      textContent += `${scopeSelector}${elementSelector} {\n  ${styleContent}\n}\n`;
    }
  });
  textContent = textContent.trim();
  return textContent;
};
