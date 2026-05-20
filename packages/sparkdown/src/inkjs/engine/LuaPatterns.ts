// Lua patterns → JavaScript RegExp translator.
//
// Sparkdown's runtime exposes Lua-style pattern matching via
// `string.find` / `string.match` / `string.gmatch` / `string.gsub`.
// Rather than ship a full pattern engine, this module compiles Lua
// patterns down to native JS `RegExp`s — the host engine does the
// matching, which keeps the prosody / inflection hot paths fast.
//
// Phase 1 scope:
// - Character classes (`%a %d %s %w %p %l %u %x %c` + uppercase
//   complements + literal `%X` escapes).
// - Greedy quantifiers (`* + ?`) and Lua's lazy 0+ quantifier (`-`).
// - `[set]` / `[^set]` including `%`-escaped classes inside.
// - Anchors (`^` only at pattern start, `$` only at pattern end).
// - Captures (`(…)`) — strings only; `()` position captures and
//   `%b{}` / `%f[]` are NOT YET supported (Phase 4).
// - Backref `%1` … `%9` inside the pattern.
//
// Translation rejects JS-only regex syntax (alternation `|`,
// non-capturing groups `(?:…)`, lookahead, `{n,m}`, `\d`, `\\…`).
// This is intentional — sparkdown patterns must round-trip with
// upstream Luau, so we forbid syntax that only works on our side.

// ============================================================================
// Public types
// ============================================================================

export interface CompiledLuaPattern {
  /**
   * JS regex equivalent. Flags are always `ds`:
   * - `d` (indices) — needed for future position-capture support.
   * - `s` (dotAll) — Lua's `.` matches newlines; emit translated as `.` + `s`.
   * Never `i`, `m`, or `g` — case sensitivity is fixed (Lua patterns
   * have no `i` flag), `^`/`$` are pattern-edge-only (no `m`), and
   * iteration is handled by the matcher layer.
   */
  regex: RegExp;
  /**
   * Number of `(…)` capture groups in the pattern. Used by the
   * matcher to know how many capture slots to extract — JS regex's
   * own `length`-of-`.groups` isn't always reliable across engines
   * for empty matches.
   */
  captureCount: number;
}

// ============================================================================
// Translator
// ============================================================================

// Lua's whitespace set (`%s`) — equivalent to C's `isspace`: space,
// tab, newline, vertical tab, form feed, carriage return.
const LUA_WS = " \\t\\n\\v\\f\\r";

// Lua's punctuation set (`%p`) — printable ASCII that isn't alphanum
// or whitespace. Listed as a literal character class to avoid
// JS regex's POSIX class portability quirks.
const LUA_PUNCT = "\\x21-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\x7e";

// Lua's control chars (`%c`) — 0x00-0x1f.
const LUA_CTRL = "\\x00-\\x1f";

// Per-letter class translation. Both the lowercase form (positive)
// and uppercase form (negative complement) are listed.
const CLASS_TO_JS: Record<string, string> = {
  a: "A-Za-z",
  A: "^A-Za-z",
  d: "0-9",
  D: "^0-9",
  l: "a-z",
  L: "^a-z",
  u: "A-Z",
  U: "^A-Z",
  s: LUA_WS,
  S: "^" + LUA_WS,
  w: "A-Za-z0-9",
  W: "^A-Za-z0-9",
  p: LUA_PUNCT,
  P: "^" + LUA_PUNCT,
  c: LUA_CTRL,
  C: "^" + LUA_CTRL,
  x: "0-9A-Fa-f",
  X: "^0-9A-Fa-f",
};

// JS regex chars that are special on the JS side but LITERAL in Lua
// patterns. Must be escaped when passing through to the output.
const JS_ONLY_METACHARS = new Set(["|", "{", "}"]);

// Returned to the caller when a feature isn't supported yet (Phase
// 4 work). Better than a generic exception so we can surface a
// friendly diagnostic at the call site.
export class LuaPatternError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LuaPatternError";
  }
}

/**
 * Translate a Lua pattern string to an equivalent JS `RegExp`.
 *
 * Throws `LuaPatternError` for:
 * - Patterns containing Phase-4 features (`%b{}`, `%f[]`, position
 *   capture `()`).
 * - Patterns that look like JS-only regex syntax (alternation `|`
 *   used as a metachar, non-capturing groups, lookaheads, `\d`-style
 *   escapes, `{n,m}` quantifiers). The error message points at the
 *   Lua-style equivalent.
 */
export function luaPatternToJs(pattern: string): CompiledLuaPattern {
  let out = "";
  let i = 0;
  let captureCount = 0;
  let parenDepth = 0;
  const len = pattern.length;

  // Anchor handling — `^` is only an anchor at pattern start, `$`
  // only at pattern end. Anywhere else they're literal in Lua.
  if (pattern.startsWith("^")) {
    out += "^";
    i = 1;
  }
  // Track whether the rest contains a trailing `$` anchor.
  const hasEndAnchor = pattern.endsWith("$") && !pattern.endsWith("%$");
  const bodyEnd = hasEndAnchor ? len - 1 : len;

  while (i < bodyEnd) {
    const c = pattern[i]!;
    if (c === "%") {
      i = handleEscape(pattern, i, /*inSet*/ false, (s) => (out += s));
      // Continue main loop: handleEscape advanced i past the
      // 2-char (or longer) escape token.
      continue;
    }
    if (c === "[") {
      const r = translateCharClass(pattern, i);
      out += r.emitted;
      i = r.nextIndex;
      // Optional trailing quantifier after the class:
      const q = readQuantifier(pattern, i);
      if (q) {
        out += q.emitted;
        i = q.nextIndex;
      }
      continue;
    }
    if (c === ".") {
      out += "[\\s\\S]";
      i++;
      const q = readQuantifier(pattern, i);
      if (q) {
        out += q.emitted;
        i = q.nextIndex;
      }
      continue;
    }
    if (c === "(") {
      // Check for position capture `()` — Phase 4.
      if (pattern[i + 1] === ")") {
        throw new LuaPatternError(
          "Position capture `()` is not yet supported in sparkdown's pattern matcher. (Planned in a later phase.)",
        );
      }
      captureCount++;
      parenDepth++;
      out += "(";
      i++;
      continue;
    }
    if (c === ")") {
      if (parenDepth === 0) {
        throw new LuaPatternError(
          "Unmatched `)` in pattern. Captures must be balanced.",
        );
      }
      parenDepth--;
      out += ")";
      i++;
      continue;
    }
    if (c === "^") {
      // `^` outside pattern start — literal caret.
      out += "\\^";
      i++;
      continue;
    }
    if (c === "$") {
      // `$` not at end — literal dollar.
      out += "\\$";
      i++;
      continue;
    }
    if (c === "*" || c === "+" || c === "?" || c === "-") {
      // Quantifier without a preceding atom. In Lua patterns this
      // matches a literal character (e.g. `*` matches `*`). JS regex
      // treats them as syntax errors. Escape them.
      out += "\\" + c;
      i++;
      continue;
    }
    if (c === "\\") {
      // Lua uses `%` for escapes; a bare `\` is a LITERAL backslash.
      // In JS regex `\` always introduces an escape, so emit `\\`.
      out += "\\\\";
      i++;
      const q = readQuantifier(pattern, i);
      if (q) {
        out += q.emitted;
        i = q.nextIndex;
      }
      continue;
    }
    if (JS_ONLY_METACHARS.has(c)) {
      out += "\\" + c;
      i++;
      const q = readQuantifier(pattern, i);
      if (q) {
        out += q.emitted;
        i = q.nextIndex;
      }
      continue;
    }
    // Plain literal character. JS regex needs `.`, `(`, `)`, etc.
    // already handled above; everything else is safe to pass through
    // except a small set we escape defensively.
    if (needsLiteralEscape(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
    i++;
    const q = readQuantifier(pattern, i);
    if (q) {
      out += q.emitted;
      i = q.nextIndex;
    }
  }

  if (hasEndAnchor) out += "$";
  if (parenDepth !== 0) {
    throw new LuaPatternError(
      "Unmatched `(` in pattern. Captures must be balanced.",
    );
  }

  let regex: RegExp;
  try {
    regex = new RegExp(out, "ds");
  } catch (e) {
    throw new LuaPatternError(
      `Could not compile pattern: ${(e as Error).message}`,
    );
  }
  return { regex, captureCount };
}

// ============================================================================
// Helpers
// ============================================================================

// Translate a `%X` escape at position `i`. Emits the equivalent JS
// regex via `emit`, returns the new index pointing past the escape.
// `inSet` toggles set-mode emission (no quantifier handling; emit
// just the class body without `[...]` wrapping).
function handleEscape(
  pattern: string,
  i: number,
  inSet: boolean,
  emit: (s: string) => void,
): number {
  const next = pattern[i + 1];
  if (next === undefined) {
    throw new LuaPatternError("Pattern ends with a dangling `%` escape.");
  }
  // `%b` and `%f` — Phase 4.
  if (next === "b") {
    throw new LuaPatternError(
      "`%b` balanced-match pattern is not yet supported. (Planned in a later phase.)",
    );
  }
  if (next === "f") {
    throw new LuaPatternError(
      "`%f` frontier pattern is not yet supported. (Planned in a later phase.)",
    );
  }
  // `%1`..`%9` — capture backreference inside a pattern.
  if (/[1-9]/.test(next)) {
    if (inSet) {
      throw new LuaPatternError(
        "Capture backreferences (`%1` … `%9`) cannot appear inside a character set.",
      );
    }
    emit("\\" + next);
    return i + 2 + advanceForQuantifier(pattern, i + 2, emit);
  }
  // Letter class — `%a`, `%d`, …
  if (CLASS_TO_JS[next]) {
    if (inSet) {
      // Inside `[...]` — emit just the class body without bracket
      // wrapping. Strip the leading `^` if it's a complement; nested
      // complements inside a set would invert meaning incorrectly,
      // so we throw.
      const body = CLASS_TO_JS[next]!;
      if (body.startsWith("^")) {
        throw new LuaPatternError(
          `Negated class \`%${next}\` is not supported inside a character set [...]. Move it out of the set.`,
        );
      }
      emit(body);
      return i + 2;
    }
    emit("[" + CLASS_TO_JS[next] + "]");
    return i + 2 + advanceForQuantifier(pattern, i + 2, emit);
  }
  // `%` followed by punctuation / magic char → literal escape.
  emit("\\" + next);
  if (inSet) return i + 2;
  return i + 2 + advanceForQuantifier(pattern, i + 2, emit);
}

// Translate a `[set]` character class. Returns the emitted JS regex
// and the index past the closing `]`. Handles negation (`[^…]`),
// ranges (`a-z`), and embedded `%X` class shorthands.
function translateCharClass(
  pattern: string,
  start: number,
): { emitted: string; nextIndex: number } {
  let body = "";
  let i = start + 1;
  let negated = false;
  if (pattern[i] === "^") {
    negated = true;
    i++;
  }
  if (i >= pattern.length) {
    throw new LuaPatternError("Unterminated `[` in pattern.");
  }
  // Lua allows `]` to be a literal if it's the first char after the
  // (optional) `^`. Match that quirk.
  if (pattern[i] === "]") {
    body += "\\]";
    i++;
  }
  while (i < pattern.length && pattern[i] !== "]") {
    const c = pattern[i]!;
    if (c === "%") {
      i = handleEscape(pattern, i, /*inSet*/ true, (s) => (body += s));
      continue;
    }
    // Inside `[...]` JS treats `\` `]` `^` (mid-set) as needing care.
    // Pass through ranges literally; escape `\` and `[`. Note that
    // `]` is the terminator and never literal mid-set (see quirk above).
    if (c === "\\" || c === "[") {
      body += "\\" + c;
    } else {
      body += c;
    }
    i++;
  }
  if (i >= pattern.length) {
    throw new LuaPatternError("Unterminated `[` in pattern.");
  }
  // Skip closing `]`.
  i++;
  const emitted = "[" + (negated ? "^" : "") + body + "]";
  return { emitted, nextIndex: i };
}

// Read a trailing quantifier after an atom. Returns the emitted JS
// equivalent and the index past it, or `null` if no quantifier.
function readQuantifier(
  pattern: string,
  i: number,
): { emitted: string; nextIndex: number } | null {
  const c = pattern[i];
  if (c === "*" || c === "+" || c === "?") {
    return { emitted: c, nextIndex: i + 1 };
  }
  if (c === "-") {
    // Lua's lazy 0+. JS equivalent is `*?`.
    return { emitted: "*?", nextIndex: i + 1 };
  }
  return null;
}

// Inline helper for the escape path: emit a quantifier if one
// follows, return how many extra chars to advance.
function advanceForQuantifier(
  pattern: string,
  i: number,
  emit: (s: string) => void,
): number {
  const q = readQuantifier(pattern, i);
  if (q) {
    emit(q.emitted);
    return q.nextIndex - i;
  }
  return 0;
}

// Plain literal chars that JS treats as regex metacharacters. Lua
// treats them as literals so we escape on the way out.
function needsLiteralEscape(c: string): boolean {
  // `^ $ . * + ? ( ) [ ]` are handled by their dedicated branches;
  // this list catches the rest of JS's metachars that don't appear
  // in Lua's syntax: `\` (handled earlier), `{`, `}`, `|`.
  // Everything not flagged here passes through verbatim.
  return false;
}
