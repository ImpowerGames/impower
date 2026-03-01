import { getCSSPropertyKeyValue } from "./getCSSPropertyKeyValue";

const DESCENDANT_REGEX = /[ ]*[>][>][ ]*/g;
const SPACE_BEFORE_IDENTIFIER_REGEX = /(?:^|[ ]+)(?=[_\p{L}])/gu;
const SPACE_BEFORE_SELECTOR_OPERATOR_REGEX = /[ ]+(?=[^_\p{L}])/gu;
const ATTRIBUTE_SELECTOR_REGEX =
  /[#]((?:[_\p{L}][_\p{L}0-9-]*)?(?:(?:[~]|[|]|[\^]|[$]|[*])?[=](?:["](?:\\.|[^"\r\n])*["]|.*?(?=$|[\s"'`<>=:(){}\[\]]))?)?)/gu;

export const DEFAULT_BREAKPOINTS = {
  xs: 400,
  sm: 600,
  md: 960,
  lg: 1280,
  xl: 1920,
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

export function getCSSSelector(
  selector: string,
  breakpoints: Record<string, number> = DEFAULT_BREAKPOINTS,
): string {
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
          const selfTargetedSelector =
            elementSelector.startsWith("[") || elementSelector.startsWith(":")
              ? "&" + elementSelector
              : elementSelector;
          styleContent += `\n${indent}${selfTargetedSelector} {`;
          level++;
          Object.entries(v).forEach(([nk, nv]) => {
            process(nk, nv);
          });
          level--;
          styleContent += `\n${indent}}`;
        } else {
          const [cssProp, cssValue] = getCSSPropertyKeyValue(k, v);
          if (cssValue) {
            styleContent += `\n${indent}${cssProp}: ${cssValue};`;
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
