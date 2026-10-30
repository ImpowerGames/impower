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

export function sparkleSelectorToCssSelector(
  selector: string,
  breakpoints: Record<string, number> = DEFAULT_BREAKPOINTS,
): string {
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
