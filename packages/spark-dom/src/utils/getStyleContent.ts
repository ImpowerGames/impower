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

const PSEUDO_ALIAS_REGEX = new RegExp(
  Object.keys(PSEUDO_ALIASES)
    .map((k) => k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
    .sort((a, b) => b.length - a.length)
    .join("|"),
  "g",
);

const _breakpointRegexCache: Record<string, RegExp> = {};
function breakpointRegex(name: string) {
  return (
    _breakpointRegexCache[name] ??
    (_breakpointRegexCache[name] = new RegExp(`width:[ ]*${name}[ ]*[)]`, "g"))
  );
}

const LEADING_DESCENDANT_REGEX = /(^|,)([ ]*)[>][>]/g;

const DATA_ATTRIBUTE_SELECTOR_REGEX = /[#]([_\p{L}][_\p{L}0-9-]*)/gu;

export function getCSSSelector(
  selector: string,
  breakpoints: Record<string, number> = DEFAULT_BREAKPOINTS,
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

  const OUT: string[] = [];
  const parts = selector.split(/(["](?:\\.|[^"])*["]|['](?:\\.|[^'])*['])/);

  for (let idx = 0; idx < parts.length; idx++) {
    const piece = parts[idx]!;
    if (idx & 1) {
      OUT.push(piece);
      continue;
    }

    let rewritten = piece
      .replace(ATTRIBUTE_SELECTOR_REGEX, "[$1]")
      .replace(SPACE_BEFORE_IDENTIFIER_REGEX, ".")
      .replace(SPACE_BEFORE_SELECTOR_OPERATOR_REGEX, "")
      .replace(DESCENDANT_REGEX, " ")
      .replace(PSEUDO_ALIAS_REGEX, (m) =>
        m in PSEUDO_ALIASES ? (PSEUDO_ALIASES as any)[m] : ":" + m.slice(1),
      );

    for (const [name, px] of Object.entries(breakpoints)) {
      rewritten = rewritten.replace(breakpointRegex(name), `width:${px}px)`);
    }

    OUT.push(rewritten);
  }

  const res = OUT.join("").trim();

  return res;
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
    styleContent = styleContent.trim();
    if (styleContent) {
      const elementSelector = getCSSSelector(name, options?.breakpoints);
      textContent += `${scopeSelector}${elementSelector} {\n  ${styleContent}\n}\n`;
    }
  });
  textContent = textContent.trim();
  return textContent;
};
