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

const ARGUMENT_STATE_REGEX = /@([_\p{L}][_\p{L}0-9-]*)[(]/gu;

const SELECTOR_LIST_SEPARATOR_REGEX = /^(.*?)\s+of\s+(.*)$/su;

const KEPT_ARGUMENT_REGEX = /(\d+)/g;

export const keepStateArguments = (
  selector: string,
): { selector: string; restore: (css: string) => string } => {
  const kept: string[] = [];
  let out = "";
  let at = 0;
  for (const match of selector.matchAll(ARGUMENT_STATE_REGEX)) {
    const open = match.index + match[0].length;
    if (match.index < at || !VALUE_ARGUMENT_STATES.has(match[1]!)) {
      continue;
    }
    let depth = 1;
    let close = open;
    while (close < selector.length && depth > 0) {
      const char = selector[close++];
      depth += char === "(" ? 1 : char === ")" ? -1 : 0;
    }
    if (depth > 0) {
      continue;
    }
    const inner = selector.slice(open, close - 1);
    const list = SELECTOR_LIST_ARGUMENT_STATES.has(match[1]!) ? SELECTOR_LIST_SEPARATOR_REGEX.exec(inner) : null;
    const value = list ? `${list[1]!.trim()} of ` : inner.trim();
    const rest = list ? ` ${list[2]!.trim()}` : "";
    out += `${selector.slice(at, open)}${kept.push(value) - 1}${rest})`;
    at = close;
  }
  return {
    selector: out + selector.slice(at),
    restore: (css) => css.replace(KEPT_ARGUMENT_REGEX, (_, index: string) => kept[Number(index)]!),
  };
};
