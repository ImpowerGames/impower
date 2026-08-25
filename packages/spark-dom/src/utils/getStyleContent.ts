import {
  DATA_ATTRIBUTE_PROPS,
  ARIA_ATTRIBUTE_ALIASES,
} from "../../../sparkdown/src/compiler/constants/dataAttributeProps";
import { getCssEquivalent } from "../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { getCSSPropertyKeyValue } from "./getCSSPropertyKeyValue";

const DESCENDANT_REGEX = /[ ]*[>][>][ ]*/g;
const SPACE_BEFORE_IDENTIFIER_REGEX = /(?:^|[ ]+)(?=[_\p{L}])/gu;
const SPACE_BEFORE_SELECTOR_OPERATOR_REGEX = /[ ]+(?=[^_\p{L}])/gu;
const ATTRIBUTE_SELECTOR_REGEX =
  /[#]((?:[_\p{L}][_\p{L}0-9-]*)?(?:(?:[~]|[|]|[\^]|[$]|[*])?[=](?:["](?:\\.|[^"\r\n])*["]|.*?(?=$|[\s"'`<>=:(){}\[\]]))?)?)/gu;

// Fallback breakpoints for when a caller omits the `breakpoints` arg. Kept in
// sync with the ENGINE's authoritative source — `config.ui.breakpoints` in the
// builtins prelude (packages/sparkdown/src/compiler/builtins/builtins.sd) — so a
// caller that ever falls through to this default agrees with the values the
// engine stamps onto every ui/create message (B1: these two sets had diverged —
// sm600/md960/lg1280/xl1920 here vs sm640/md768/lg1024/xl1280 in the engine —
// which would silently apply wrong max-width px to any `@screen-size(...)` rule
// that reached getStyleContent without breakpoints). The render path always
// passes the engine's, so this is a guard against a future undefined-arg path.
export const DEFAULT_BREAKPOINTS = {
  xs: 400,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
};

const PSEUDO_ALIASES = {
  "@hovered": ":hover",
  "@focused": ":focus",
  "@pressed": ":active",
  "@disabled": ":disabled",
  "@enabled": ":enabled",
  "@checked": ":checked",
  "@unchecked": ":not(:checked)",
  "@required": ":required",
  "@indeterminate": ":indeterminate",
  // An input's TYPE is not expressible as a selector otherwise: `#type="date"`
  // is the inline-prop syntax, so attribute excision eats it (same reason
  // `@busy` exists for `[aria-busy]`).
  "@type_color": '[type="color"]',
  "@type_date": '[type="date"]',
  "@type_time": '[type="time"]',
  // A button's TYPE changes its layout role, not just its submit behaviour:
  // only the form buttons carry the block rhythm below them (Pico's
  // `[type=button],[type=reset],[type=submit]`), while a plain `button` sitting
  // in a row must not.
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
  // Named PARTS of a native widget. Without these a slider, progress bar, file
  // input, colour swatch and date picker can only ever render as the browser's
  // own control: `appearance: none` strips the widget, and there is then no way
  // to paint the pieces back. Named parts rather than raw `::-webkit-*` because
  // the same names describe the sub-elements of a non-web control (a Unity UI
  // Toolkit slider has a tracker and a dragger too), so authored style survives
  // the port.
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
  // `#a=v` can't be used as a selector in a style block — that IS the inline
  // prop syntax, so attribute excision eats it and leaves an empty selector.
  // Busy state gets an alias of its own, like `@opened` does for `[open]`.
  "@busy": '[aria-busy="true"]',
  "@theme(": "@media(prefers-color-scheme:",
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
} as const;

/* -------- 2.  @pseudo-aliases combined into ONE RegExp ------------- */
const PSEUDO_ALIAS_REGEX = new RegExp(
  Object.keys(PSEUDO_ALIASES)
    .map((k) => k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
    .sort((a, b) => b.length - a.length) // longest first (avoids partial hits)
    .join("|"),
  "g",
);

/* -------- 1.  breakpoint → RegExp cache ---------------------------- */
const _breakpointRegexCache: Record<string, RegExp> = {};
function breakpointRegex(name: string) {
  return (
    _breakpointRegexCache[name] ??
    (_breakpointRegexCache[name] = new RegExp(`width:[ ]*${name}[ ]*[)]`, "g"))
  );
}

/** A descendant operator in LEADING position, i.e. `>> foo` or `, >> foo`. */
const LEADING_DESCENDANT_REGEX = /(^|,)([ ]*)[>][>]/g;

/** A bare `#name` attribute selector, before any `=value` part. */
const DATA_ATTRIBUTE_SELECTOR_REGEX = /[#]([_\p{L}][_\p{L}0-9-]*)/gu;

export function getCSSSelector(
  selector: string,
  breakpoints: Record<string, number> = DEFAULT_BREAKPOINTS,
): string {
  // A non-standard prop is authored bare but written to the DOM prefixed, so a
  // selector naming it has to be prefixed too or it would match nothing —
  // `#tooltip:` has to become `[data-tooltip]`, since that is what the runtime
  // wrote. Same list drives both sides.
  selector = selector.replace(
    DATA_ATTRIBUTE_SELECTOR_REGEX,
    (m, name: string) =>
      // A selector names the prop as AUTHORED; it has to match the attribute
      // actually written, or the rule silently applies to nothing.
      ARIA_ATTRIBUTE_ALIASES.has(name)
        ? `#${ARIA_ATTRIBUTE_ALIASES.get(name)}`
        : DATA_ATTRIBUTE_PROPS.has(name)
          ? `#data-${name}`
          : m,
  );

  // Anchor a LEADING `>>` to an explicit `&` first. `>>` becomes a space below,
  // and a space in leading position is then eaten by the closing `trim()` — so
  // `>> foo` used to emit `.foo`, which native nesting reads as a COMPOUND
  // (`&.foo`, the element itself) rather than the descendant it plainly says.
  // It compiled clean and silently matched something else. With the `&` the
  // space sits between two tokens, where trim cannot reach it.
  selector = selector.replace(LEADING_DESCENDANT_REGEX, "$1$2& >>");

  // Split by quoted strings so we never touch them (= valid CSS)
  const OUT: string[] = [];
  const parts = selector.split(/(["](?:\\.|[^"])*["]|['](?:\\.|[^'])*['])/);

  for (let idx = 0; idx < parts.length; idx++) {
    const piece = parts[idx]!;
    if (idx & 1) {
      // quoted -> keep verbatim
      OUT.push(piece);
      continue;
    }

    // Expand @aliases, and treat >> as descendant operator, assume identifiers that are not prefixed with a symbol are .classes
    let rewritten = piece
      .replace(ATTRIBUTE_SELECTOR_REGEX, "[$1]") // #a=value → [a=value]
      .replace(SPACE_BEFORE_IDENTIFIER_REGEX, ".") // a b c → .a.b.c
      .replace(SPACE_BEFORE_SELECTOR_OPERATOR_REGEX, "") // [a] [b] [c] → [a][b][c]
      .replace(DESCENDANT_REGEX, " ") // a >> b >> c → a b c
      .replace(PSEUDO_ALIAS_REGEX, (m) =>
        m in PSEUDO_ALIASES ? (PSEUDO_ALIASES as any)[m] : ":" + m.slice(1),
      ); // @hovered → :hover

    // Replace breakpoint selector
    for (const [name, px] of Object.entries(breakpoints)) {
      rewritten = rewritten.replace(breakpointRegex(name), `width:${px}px)`);
    }

    OUT.push(rewritten);
  }

  const res = OUT.join("").trim();

  return res;
}

/** Split on commas that are at the TOP level — not inside `(...)`, `[...]`, or
 *  a quoted string. `:is(a, b)` and `[title="a, b"]` are single compounds. */
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

/** Anchor EVERY comma-separated compound that targets the element itself.
 *
 *  Pico triggers its hover styling on `:hover, :active, :focus` together, which
 *  authors write as `@hovered, @pressed, @focused:`. Anchoring only the first
 *  compound would emit `&:hover, :active { … }`, and under CSS nesting the
 *  un-anchored ones become DESCENDANT selectors — `.button :active` matches any
 *  active descendant instead of the button. That is silently wrong rather than
 *  invalid, so it would not surface as an error. */
export function anchorSelfTargeted(selector: string): string {
  return splitTopLevelCommas(selector)
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return trimmed;
      return trimmed.startsWith("[") || trimmed.startsWith(":")
        ? "&" + trimmed
        : trimmed;
    })
    .filter(Boolean)
    .join(", ");
}

export const getStyleContent = (
  styles: Record<string, any>,
  options?: {
    breakpoints?: Record<string, number>;
    scope?: string;
  },
): string => {
  const scope = options?.scope;
  const scopeSelector = scope ? scope + " " : "";
  let textContent = "";
  Object.entries(styles).forEach(([name, style]) => {
    let styleContent = "";
    let level = 1;
    const process = (k: string, v: unknown) => {
      const indent = "  ".repeat(level);
      if (!k.startsWith("$")) {
        if (v && typeof v === "object" && !("$name" in v)) {
          const elementSelector = getCSSSelector(k, options?.breakpoints);
          const selfTargetedSelector = anchorSelfTargeted(elementSelector);
          styleContent += `\n${indent}${selfTargetedSelector} {`;
          level++;
          Object.entries(v).forEach(([nk, nv]) => {
            process(nk, nv);
          });
          level--;
          styleContent += `\n${indent}}`;
        } else {
          const [cssProp, cssValue] = getCSSPropertyKeyValue(k, v);
          // An empty value normally means "unset", so it's skipped — except for
          // `content`, where the EMPTY STRING is the meaningful value: a
          // ::before/::after box doesn't render at all without `content: ""`.
          // Dropping it silently produced a styled pseudo-element that never
          // appeared (which is what hid the `switch` thumb).
          if (cssValue || (cssProp === "content" && cssValue === "")) {
            const cssEntries = getCssEquivalent(cssProp, cssValue);
            for (const [k, v] of cssEntries) {
              styleContent += `\n${indent}${k}: ${v};`;
            }
          }
        }
      }
    };
    Object.entries(style).forEach(([k, v]) => {
      process(k, v);
    });
    // Concatenate all
    styleContent = styleContent.trim();
    if (styleContent) {
      const elementSelector = getCSSSelector(name, options?.breakpoints);
      textContent += `${scopeSelector}${elementSelector} {\n  ${styleContent}\n}\n`;
    }
  });
  textContent = textContent.trim();
  return textContent;
};
