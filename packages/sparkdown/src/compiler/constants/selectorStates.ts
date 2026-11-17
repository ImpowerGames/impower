export const SELECTOR_STATE_ALIASES: Readonly<Record<string, string>> = {
  "@hovered": ":hover",
  "@focused": ":focus",
  "@pressed": ":active",
  "@disabled": ":disabled",
  "@enabled": ":enabled",
  "@checked": ":checked",
  "@unchecked": ":not(:checked)",
  "@required": ":required",
  "@indeterminate": ":indeterminate",
  "@type_color": '[type="color"]',
  "@type_date": '[type="date"]',
  "@type_time": '[type="time"]',
  "@type_submit": '[type="submit"]',
  "@type_reset": '[type="reset"]',
  "@type_button": '[type="button"]',
  "@valid": ":valid",
  "@invalid": ":invalid",
  "@readonly": ":read-only",
  "@first": ":first-child",
  "@last": ":last-child",
  "@only": ":only-child",
  "@odd": ":nth-child(odd)",
  "@even": ":nth-child(even)",
  "@empty": ":nth-child(empty)",
  "@blank": ":placeholder-shown",
  "@direction(": ":dir(",
  "@language(": ":lang(",
  "@before": "::before",
  "@after": "::after",
  "@placeholder": "::placeholder",
  "@selection": "::selection",
  "@marker": "::marker",
  "@backdrop": "::backdrop",
  "@opened": "[open]",
  "@track": "::-webkit-slider-runnable-track",
  "@thumb": "::-webkit-slider-thumb",
  "@bar": "::-webkit-progress-bar",
  "@fill": "::-webkit-progress-value",
  "@file_button": "::file-selector-button",
  "@file-button": "::file-selector-button",
  "@picker": "::-webkit-calendar-picker-indicator",
  "@swatch": "::-webkit-color-swatch",
  "@swatch_wrapper": "::-webkit-color-swatch-wrapper",
  "@swatch-wrapper": "::-webkit-color-swatch-wrapper",
  "@busy": '[aria-busy="true"]',
  "@container-size(": "@container(max-width:",
  "@container_size(": "@container(max-width:",
  "@screen-size(": "@container screen (max-width:",
  "@screen_size(": "@container screen (max-width:",
  "@initial": "@starting-style",
  "@charset": "@charset",
  "@color-profile": "@color-profile",
  "@color_profile": "@color-profile",
  "@container": "@container",
  "@counter-style": "@counter-style",
  "@counter_style": "@counter-style",
  "@font-face": "@font-face",
  "@font_face": "@font-face",
  "@font-feature-values": "@font-feature-values",
  "@font_feature_values": "@font-feature-values",
  "@font-palette-values": "@font-palette-values",
  "@font_palette_values": "@font-palette-values",
  "@import": ":@import",
  "@keyframes": "@keyframes",
  "@layer": "@layer",
  "@media": "@media",
  "@namespace": "@namespace",
  "@page": "@page",
  "@property": "@property",
  "@scope": "@scope",
  "@starting-style": "@starting-style",
  "@starting_style": "@starting-style",
  "@supports": "@supports",
  "@view-transition": "@view-transition",
  "@view_transition": "@view-transition",
};

export const COLOR_SCHEME_STATE = "theme";

export const STANDARD_PSEUDO_CLASSES: ReadonlySet<string> = new Set([
  "active",
  "any-link",
  "autofill",
  "blank",
  "buffering",
  "checked",
  "current",
  "default",
  "defined",
  "dir",
  "disabled",
  "empty",
  "enabled",
  "first",
  "first-child",
  "first-of-type",
  "focus",
  "focus-visible",
  "focus-within",
  "fullscreen",
  "future",
  "has",
  "host",
  "host-context",
  "hover",
  "in-range",
  "indeterminate",
  "invalid",
  "is",
  "lang",
  "last-child",
  "last-of-type",
  "left",
  "link",
  "local-link",
  "modal",
  "muted",
  "not",
  "nth-child",
  "nth-last-child",
  "nth-last-of-type",
  "nth-of-type",
  "only-child",
  "only-of-type",
  "open",
  "optional",
  "out-of-range",
  "past",
  "paused",
  "picture-in-picture",
  "placeholder-shown",
  "playing",
  "popover-open",
  "read-only",
  "read-write",
  "required",
  "right",
  "root",
  "scope",
  "seeking",
  "stalled",
  "state",
  "target",
  "target-within",
  "user-invalid",
  "user-valid",
  "valid",
  "visited",
  "volume-locked",
  "where",
]);

const ALIASED_STATES: ReadonlySet<string> = new Set(
  Object.keys(SELECTOR_STATE_ALIASES).map((key) => key.slice(1).replace(/[(]$/, "")),
);

export const isKnownSelectorState = (name: string): boolean =>
  name === COLOR_SCHEME_STATE || ALIASED_STATES.has(name) || STANDARD_PSEUDO_CLASSES.has(name);

const SELECTOR_STATE_REGEX = /@([_\p{L}][_\p{L}0-9-]*)([(]?)/gu;

export const writeSelectorStates = (
  selector: string,
  aliases: Readonly<Record<string, string>> = SELECTOR_STATE_ALIASES,
): string =>
  selector.replace(SELECTOR_STATE_REGEX, (state, name: string, paren: string) => {
    const alias = aliases[`@${name}${paren}`] ?? (paren ? aliases[`@${name}`]?.concat(paren) : undefined);
    if (alias != null) {
      return alias;
    }
    return STANDARD_PSEUDO_CLASSES.has(name) ? `:${name}${paren}` : state;
  });

const VALUE_ARGUMENT_STATES: ReadonlySet<string> = new Set([
  "nth-child",
  "nth-last-child",
  "nth-of-type",
  "nth-last-of-type",
  "lang",
  "language",
  "dir",
  "direction",
  "state",
]);

const SELECTOR_LIST_ARGUMENT_STATES: ReadonlySet<string> = new Set(["nth-child", "nth-last-child"]);

const ARGUMENT_STATE_REGEX = /@([_\p{L}][_\p{L}0-9-]*)[(]/uy;

const SELECTOR_ARGUMENT_FUNCTION_REGEX = /@(?:has|not|is|where|host|host-context|nth-child|nth-last-child)$/u;

const NAME_START_REGEX = /[_\p{L}]/u;

const SELECTOR_LIST_SEPARATOR_REGEX = /^(.*?)\s+of\s+(.*)$/su;

const KEPT_ARGUMENT_START = String.fromCharCode(0xe001);

const KEPT_ARGUMENT_END = String.fromCharCode(0xe002);

const KEPT_ARGUMENT_REGEX = new RegExp(`${KEPT_ARGUMENT_START}([0-9]+)${KEPT_ARGUMENT_END}`, "g");

const closingParen = (selector: string, open: number): number => {
  let depth = 1;
  let quote = "";
  for (let i = open; i < selector.length; i++) {
    const char = selector[i]!;
    if (quote) {
      if (char === "\\") {
        i++;
      } else if (char === quote) {
        quote = "";
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      depth++;
    } else if (char === ")" && --depth === 0) {
      return i;
    }
  }
  return -1;
};

const keepArguments = (selector: string, kept: string[]): string => {
  let out = "";
  let at = 0;
  let quote = "";
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i]!;
    if (quote) {
      if (char === "\\") {
        i++;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    ARGUMENT_STATE_REGEX.lastIndex = i;
    const match = char === "@" ? ARGUMENT_STATE_REGEX.exec(selector) : null;
    if (!match || !VALUE_ARGUMENT_STATES.has(match[1]!)) {
      continue;
    }
    const open = i + match[0].length;
    const close = closingParen(selector, open);
    if (close < 0) {
      continue;
    }
    const inner = selector.slice(open, close);
    const list = SELECTOR_LIST_ARGUMENT_STATES.has(match[1]!) ? SELECTOR_LIST_SEPARATOR_REGEX.exec(inner) : null;
    const value = list ? `${list[1]!.trim()} of ` : inner.trim();
    const rest = list ? ` ${keepArguments(list[2]!.trim(), kept)}` : "";
    out += `${selector.slice(at, open)}${KEPT_ARGUMENT_START}${kept.push(value) - 1}${KEPT_ARGUMENT_END}${rest})`;
    at = close + 1;
    i = close;
  }
  return out + selector.slice(at);
};

export const keepStateArguments = (
  selector: string,
): { selector: string; restore: (css: string) => string } => {
  const kept: string[] = [];
  return {
    selector: keepArguments(selector, kept),
    restore: (css) => css.replace(KEPT_ARGUMENT_REGEX, (_, index: string) => kept[Number(index)]!),
  };
};

export const markSelectorArgumentNames = (selector: string): string => {
  let out = "";
  let quote = "";
  const selectorLists: boolean[] = [];
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i]!;
    out += char;
    if (quote) {
      if (char === "\\" && i + 1 < selector.length) {
        out += selector[++i];
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      selectorLists.push(SELECTOR_ARGUMENT_FUNCTION_REGEX.test(out.slice(-16, -1)));
    } else if (char === ")") {
      selectorLists.pop();
    }
    if (
      (char === "(" || char === ",") &&
      selectorLists[selectorLists.length - 1] &&
      NAME_START_REGEX.test(selector[i + 1] ?? "")
    ) {
      out += ".";
    }
  }
  return out;
};
