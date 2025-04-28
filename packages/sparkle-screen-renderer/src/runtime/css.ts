const DOUBLE_AT_REGEX = /@@/g;
const LONE_AT_REGEX = /@(?=\W)/g;
const AT_SELECTOR_REGEX = /@[a-zA-Z][\w-]*/g;
const ESCAPE_REGEX = /[-/\\^$*+?.()|[\]{}]/g;

export const DEFAULT_BREAKPOINTS = {
  xs: 400,
  sm: 600,
  md: 960,
  lg: 1280,
  xl: 1920,
};

const PSEUDO_ALIASES = {
  "@child": "& ",
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
  "@theme(": "@media(prefers-color-scheme:",
  "@container-size(": "@container(max-width:",
  "@screen-size(": "@container screen (max-width:",
  "@before": "::before",
  "@after": "::after",
  "@placeholder": "::placeholder",
  "@selection": "::selection",
  "@marker": "::marker",
  "@backdrop": "::backdrop",
  "@opened": "[open]",
  "@initial": "@starting-style",
} as const;

/* -------- 2.  @pseudo-aliases combined into ONE RegExp ------------- */
const ALIAS_REGEX = new RegExp(
  Object.keys(PSEUDO_ALIASES)
    .map((k) => k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
    .sort((a, b) => b.length - a.length) // longest first (avoids partial hits)
    .join("|"),
  "g"
);

const VALID_CSS_AT_RULES = new Set([
  "@charset",
  "@color-profile",
  "@container",
  "@counter-style",
  "@font-face",
  "@font-feature-values",
  "@font-palette-values",
  "@import",
  "@keyframes",
  "@layer",
  "@media",
  "@namespace",
  "@page",
  "@property",
  "@scope",
  "@starting-style",
  "@supports",
  "@view-transition",
]);

/* -------- 1.  breakpoint → RegExp cache ---------------------------- */
const _breakpointRegexCache: Record<string, RegExp> = {};
function breakpointRegex(name: string) {
  return (
    _breakpointRegexCache[name] ??
    (_breakpointRegexCache[name] = new RegExp(
      `@screen-size\\(\\s*${name.replace(ESCAPE_REGEX, "\\$&")}\\s*\\)`,
      "g"
    ))
  );
}

/** in–memory memo – evicted whenever it reaches 5 k entries            */
const _memo = new Map<string, string>();

export function sparkleSelectorToCssSelector(
  selector: string,
  breakpoints: Record<string, number> = DEFAULT_BREAKPOINTS
): string {
  // Used cached selector if available
  const cached = _memo.get(selector);
  if (cached !== undefined) {
    return cached;
  }

  // Replace breakpoint selector
  for (const [name, px] of Object.entries(breakpoints)) {
    selector = selector.replace(
      breakpointRegex(name),
      `@container screen (max-width:${px}px)`
    );
  }

  /* -----------------------------------------------------------------
   * 1. split by quoted strings so we never touch them (= valid CSS)
   * ----------------------------------------------------------------- */
  const OUT: string[] = [];
  const parts = selector.split(
    /("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')/
  );

  for (let idx = 0; idx < parts.length; idx++) {
    const piece = parts[idx];
    if (idx & 1) {
      // quoted -> keep verbatim
      OUT.push(piece);
      continue;
    }

    /** 2.  expand @@, @, @aliases, ... all with ONE replace() */
    const rewritten = piece
      .replace(DOUBLE_AT_REGEX, "*") // @@ -> *
      .replace(LONE_AT_REGEX, "> *") // lone @ -> > *
      .replace(ALIAS_REGEX, (m) => (PSEUDO_ALIASES as any)[m]) // pseudo
      .replace(
        AT_SELECTOR_REGEX,
        (
          m // other @word → :word  (unless at-rule)
        ) => (VALID_CSS_AT_RULES.has(m) ? m : ":" + m.slice(1))
      );

    OUT.push(rewritten);
  }

  const res = OUT.join("").trim();

  // Memo bookkeeping
  if (_memo.size > 5000) {
    _memo.clear();
  }
  _memo.set(selector, res);
  return res;
}
