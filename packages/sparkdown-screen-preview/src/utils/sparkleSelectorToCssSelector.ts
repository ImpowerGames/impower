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
};

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

export function sparkleSelectorToCssSelector(
  selector: string,
  breakpoints?: Record<string, number>
) {
  // Replace named breakpoints first (safe to do globally)
  for (const [k, v] of Object.entries(breakpoints || DEFAULT_BREAKPOINTS)) {
    selector = selector.replace(
      new RegExp(`@screen-size\\(\\s*${k}\\s*\\)`, "g"),
      `@container screen (max-width:${v}px)`
    );
  }

  let result = "";
  let inQuote: '"' | "'" | null = null;
  let buffer = "";

  function flushBuffer() {
    if (buffer.length === 0) return;

    let flushed = "";
    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];

      if (char === "#") {
        flushed += ".";
      } else if (char === "@") {
        if (buffer[i + 1] === "@") {
          flushed += "*";
          i++;
        } else if (i === buffer.length - 1 || !/[a-zA-Z]/.test(buffer[i + 1])) {
          flushed += "> *";
        } else {
          // Handle @word or @something(
          let word = "@";
          let j = i + 1;
          while (j < buffer.length && /[a-zA-Z0-9-]/.test(buffer[j])) {
            word += buffer[j];
            j++;
          }

          if (VALID_CSS_AT_RULES.has(word)) {
            // Keep @media, @import, etc
            flushed += word;
          } else if (word in PSEUDO_ALIASES) {
            // Expand known pseudo aliases
            flushed += PSEUDO_ALIASES[word as keyof typeof PSEUDO_ALIASES];
          } else {
            // Default fallback: @word -> :word
            flushed += ":" + word.slice(1);
          }

          i = j - 1;
        }
      } else {
        flushed += char;
      }
    }

    result += flushed;
    buffer = "";
  }

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];

    if (char === "\\" && inQuote !== null) {
      // Handle escaped character inside quotes
      result += char + (selector[i + 1] || "");
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      if (inQuote === null) {
        flushBuffer(); // Finish pending buffer before quote
        inQuote = char;
      } else if (inQuote === char) {
        inQuote = null;
      }
      result += char;
      continue;
    }

    if (inQuote) {
      result += char;
    } else {
      buffer += char;
    }
  }

  flushBuffer(); // Final flush
  return result?.trim();
}
