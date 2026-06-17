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

/**
 * Per-capture metadata. `string` captures yield the matched text;
 * `position` captures (Lua's empty `()` form) yield the 1-indexed
 * byte position at which the capture sits.
 */
export type CaptureKind = "string" | "position";

/**
 * One slice of a compiled pattern. Patterns without `%b` produce a
 * single `regex` segment; patterns with `%b{xy}` interleave regex
 * segments with `balanced` ones.
 */
export type PatternSegment =
  | {
      kind: "regex";
      /** Anchored regex (begins with `^`) — matches at slice offset 0 only. */
      regex: RegExp;
      /** Capture kinds for this segment's `(…)` groups, in source order. */
      captureKinds: CaptureKind[];
    }
  | {
      kind: "balanced";
      /** Opening delimiter (single character). */
      open: string;
      /** Closing delimiter (single character). */
      close: string;
    };

export interface CompiledLuaPattern {
  /**
   * Segments form. Single-segment regex patterns share the same
   * shape as multi-segment `%b` patterns — consumers walk segments
   * uniformly through `executeLuaPattern`.
   */
  segments: PatternSegment[];
  /** Total `(…)` capture groups across all segments, in source order. */
  captureCount: number;
  /** Per-capture kinds across all segments, flattened. */
  captureKinds: CaptureKind[];
  /** True iff source pattern starts with `^`. */
  anchored: boolean;
  /** True iff source pattern ends with an unescaped `$`. */
  endAnchored: boolean;
}

/**
 * Single-match output from `executeLuaPattern`. Captures are raw JS
 * — `string` for string captures, `number` for position captures
 * (1-indexed), `null` for unmatched groups.
 */
export interface PatternMatchResult {
  /** 0-indexed start of match in the original input. */
  index: number;
  /** Length of the matched substring. */
  length: number;
  /** Captured values in source order; same length as `captureCount`. */
  captures: (string | number | null)[];
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
  // `%g` — printable except space (C `isgraph`): ASCII 0x21-0x7E.
  g: "\\x21-\\x7e",
  G: "^\\x21-\\x7e",
  // `%z` — the NUL byte (Lua 5.1 class, kept by Luau); `%Z` — its
  // complement (any byte except `\0`).
  z: "\\x00",
  Z: "^\\x00",
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
  // Pattern-wide anchor handling. `^` is only an anchor at pattern
  // start, `$` only at pattern end. Anywhere else they're literal.
  const anchored = pattern.startsWith("^");
  const endAnchored = pattern.endsWith("$") && !pattern.endsWith("%$");
  const body = pattern.slice(anchored ? 1 : 0, endAnchored ? -1 : pattern.length);

  // Walk `body`, splitting at each `%bxy`. Each non-`%b` chunk
  // becomes one regex segment; each `%b` becomes a balanced segment.
  // Capture indices flow continuously across segments.
  const segments: PatternSegment[] = [];
  const captureKinds: CaptureKind[] = [];
  let chunkStart = 0;
  let i = 0;
  while (i < body.length) {
    if (body[i] === "%" && body[i + 1] === "b") {
      // Flush the preceding regex chunk (may be empty if `%b` is at
      // the start of the body — empty chunks are still valid as
      // zero-width anchors).
      if (i > chunkStart) {
        segments.push(
          compileRegexSegment(
            body.slice(chunkStart, i),
            captureKinds,
            /*anchorStart*/ segments.length === 0 && anchored,
          ),
        );
      }
      const open = body[i + 2];
      const close = body[i + 3];
      if (open === undefined || close === undefined) {
        throw new LuaPatternError(
          "malformed pattern (missing arguments to '%b')",
        );
      }
      segments.push({ kind: "balanced", open, close });
      i += 4;
      chunkStart = i;
      continue;
    }
    // Skip escape pairs so `%(` doesn't accidentally match the `%b`
    // marker logic.
    if (body[i] === "%") {
      i += 2;
      continue;
    }
    // Skip past character classes to avoid stray `%b` inside `[...]`.
    if (body[i] === "[") {
      i++;
      while (i < body.length && body[i] !== "]") {
        if (body[i] === "%") i += 2;
        else i++;
      }
      i++; // skip ]
      continue;
    }
    i++;
  }
  // Flush trailing chunk (or the whole pattern if no `%b` was seen).
  if (chunkStart < body.length || segments.length === 0) {
    segments.push(
      compileRegexSegment(
        body.slice(chunkStart),
        captureKinds,
        /*anchorStart*/ segments.length === 0 && anchored,
        // `$` must live INSIDE the final regex, not just as the
        // matcher's post-check — a lazy quantifier (`.-$`) only
        // extends to the end of input when the regex itself demands
        // it. (When the pattern ends with `%b` there's no trailing
        // regex segment and the post-check alone handles `$`.)
        /*anchorEnd*/ endAnchored,
      ),
    );
  }
  return {
    segments,
    captureCount: captureKinds.length,
    captureKinds,
    anchored,
    endAnchored,
  };
}

/**
 * Translate a single regex chunk (no `%b` markers) to a JS RegExp.
 * Appends per-capture kinds onto the shared `captureKinds` array
 * (modified in place) so the caller can track them globally across
 * segments. `anchorStart` prepends `^` to the produced regex —
 * always true for the first segment in an anchored pattern, false
 * otherwise (subsequent segments are anchored automatically by the
 * slice-based matcher loop).
 */
function compileRegexSegment(
  body: string,
  captureKinds: CaptureKind[],
  anchorStart: boolean,
  anchorEnd = false,
): PatternSegment {
  // Anchor strategy: segment regexes compile with the STICKY flag
  // and exec against the FULL input with `lastIndex` set to the
  // candidate position — never against a slice. Slicing would blind
  // lookbehinds (`%f[set]`'s `(?<!…)` half must see the char before
  // the match position). The outer matcher loop decides where to
  // start; `anchorStart` is unused since sticky pins every attempt.
  void anchorStart;
  let out = "";
  let i = 0;
  let captureCount = 0;
  let parenDepth = 0;
  const localCaptureKinds: CaptureKind[] = [];
  // Backref bookkeeping (`%1`..`%9`): Lua's check_capture requires
  // the referenced capture to exist AND be finished at the point of
  // use — `(%1)` and `(%0)` raise "invalid capture index". Track
  // which group numbers have closed (open order = group number).
  const openGroupStack: number[] = [];
  const closedGroups = new Set<number>();
  const bodyEnd = body.length;

  while (i < bodyEnd) {
    const c = body[i]!;
    if (c === "%") {
      const d = body[i + 1];
      if (d !== undefined && d >= "0" && d <= "9") {
        const n = d.charCodeAt(0) - 48;
        if (n === 0 || !closedGroups.has(n)) {
          throw new LuaPatternError(`invalid capture index %${n}`);
        }
        out += "\\" + n;
        i += 2;
        const q = readQuantifier(body, i);
        if (q) {
          out += q.emitted;
          i = q.nextIndex;
        }
        continue;
      }
      i = handleEscape(body, i, /*inSet*/ false, (s) => (out += s));
      continue;
    }
    if (c === "[") {
      const r = translateCharClass(body, i);
      out += r.emitted;
      i = r.nextIndex;
      const q = readQuantifier(body, i);
      if (q) {
        out += q.emitted;
        i = q.nextIndex;
      }
      continue;
    }
    if (c === ".") {
      out += "[\\s\\S]";
      i++;
      const q = readQuantifier(body, i);
      if (q) {
        out += q.emitted;
        i = q.nextIndex;
      }
      continue;
    }
    if (c === "(") {
      if (body[i + 1] === ")") {
        captureCount++;
        const globalIndex = captureKinds.length + captureCount;
        localCaptureKinds.push("position");
        // Position captures are born finished — `%N` may reference
        // them immediately.
        closedGroups.add(captureCount);
        out += `(?<__pos_${globalIndex}__>)`;
        i += 2;
        continue;
      }
      captureCount++;
      localCaptureKinds.push("string");
      openGroupStack.push(captureCount);
      parenDepth++;
      out += "(";
      i++;
      continue;
    }
    if (c === ")") {
      if (parenDepth === 0) {
        throw new LuaPatternError("invalid pattern capture");
      }
      parenDepth--;
      const closed = openGroupStack.pop();
      if (closed !== undefined) closedGroups.add(closed);
      out += ")";
      i++;
      continue;
    }
    if (c === "^" || c === "$") {
      // Mid-pattern `^` / `$` are literals — and like any literal
      // atom they can carry a quantifier (`(^?)` in pm.luau's f1).
      out += "\\" + c;
      i++;
      const q = readQuantifier(body, i);
      if (q) {
        out += q.emitted;
        i = q.nextIndex;
      }
      continue;
    }
    if (c === "*" || c === "+" || c === "?" || c === "-") {
      out += "\\" + c;
      i++;
      continue;
    }
    if (c === "\\") {
      out += "\\\\";
      i++;
      const q = readQuantifier(body, i);
      if (q) {
        out += q.emitted;
        i = q.nextIndex;
      }
      continue;
    }
    if (JS_ONLY_METACHARS.has(c)) {
      out += "\\" + c;
      i++;
      const q = readQuantifier(body, i);
      if (q) {
        out += q.emitted;
        i = q.nextIndex;
      }
      continue;
    }
    if (needsLiteralEscape(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
    i++;
    const q = readQuantifier(body, i);
    if (q) {
      out += q.emitted;
      i = q.nextIndex;
    }
  }

  if (parenDepth !== 0) {
    throw new LuaPatternError("malformed pattern (unfinished capture)");
  }

  // Push this segment's capture kinds onto the global list before
  // returning so the segment-level capture indices flow correctly.
  for (const k of localCaptureKinds) captureKinds.push(k);

  if (anchorEnd) out += "$";

  let regex: RegExp;
  try {
    regex = new RegExp(out, "dsy");
  } catch (e) {
    throw new LuaPatternError(
      `Could not compile pattern: ${(e as Error).message}`,
    );
  }
  return { kind: "regex", regex, captureKinds: localCaptureKinds };
}

/**
 * Execute a compiled pattern against `input` starting at offset
 * `start` (0-indexed). Returns the first match (position + length
 * + raw captures) or `null` on failure. Captures are JS-native:
 * `string` for string captures, `number` for position captures
 * (1-indexed, Lua convention), `null` for unmatched groups.
 *
 * Handles both single-segment patterns (fast path: one regex
 * scan-and-match against the input slice) and multi-segment
 * patterns containing `%b` (slower scan: try each starting
 * position, anchored match through every segment in turn).
 */
export function executeLuaPattern(
  compiled: CompiledLuaPattern,
  input: string,
  start: number,
): PatternMatchResult | null {
  const startPos = Math.max(0, Math.min(start, input.length));

  // Fast path: single regex segment, no balanced.
  if (compiled.segments.length === 1 && compiled.segments[0]!.kind === "regex") {
    const seg = compiled.segments[0] as Extract<PatternSegment, { kind: "regex" }>;
    return matchSingleRegex(
      seg,
      input,
      startPos,
      compiled.anchored,
      compiled.endAnchored,
    );
  }

  // Segmented path. Walk each candidate starting position and
  // anchor every segment against it.
  for (let p = startPos; p <= input.length; p++) {
    if (compiled.anchored && p > startPos) return null;
    const attempt = tryMatchSegmentsAt(compiled, input, p);
    if (attempt) {
      if (compiled.endAnchored && attempt.index + attempt.length !== input.length) {
        // Match found but doesn't reach the end-of-string anchor —
        // keep scanning forward (longer matches at later positions
        // can still satisfy `$`).
        continue;
      }
      return attempt;
    }
  }
  return null;
}

// Single-regex match. Sticky exec against the FULL input (lastIndex
// = candidate position) so lookbehinds see preceding context and
// `$` means true end-of-input.
function matchSingleRegex(
  seg: Extract<PatternSegment, { kind: "regex" }>,
  input: string,
  startPos: number,
  anchored: boolean,
  endAnchored: boolean,
): PatternMatchResult | null {
  // For unanchored patterns we scan forward from each starting
  // position until we find a match; sticky pins each attempt to
  // exactly `p`.
  let p = startPos;
  while (p <= input.length) {
    if (anchored && p > startPos) return null;
    seg.regex.lastIndex = p;
    const m = seg.regex.exec(input);
    if (m && m.index === p) {
      if (endAnchored && p + m[0].length !== input.length) {
        p++;
        continue;
      }
      const captures: (string | number | null)[] = [];
      for (let g = 1; g <= seg.captureKinds.length; g++) {
        if (seg.captureKinds[g - 1] === "position") {
          const idx = (m as any).indices?.[g];
          captures.push((idx ? idx[0] : 0) + 1);
        } else {
          captures.push(m[g] ?? null);
        }
      }
      return { index: p, length: m[0].length, captures };
    }
    p++;
  }
  return null;
}

// Try every segment anchored at `p`. Returns the combined match or
// null if any segment fails.
function tryMatchSegmentsAt(
  compiled: CompiledLuaPattern,
  input: string,
  p: number,
): PatternMatchResult | null {
  let cursor = p;
  const captures: (string | number | null)[] = [];
  for (const seg of compiled.segments) {
    if (seg.kind === "regex") {
      seg.regex.lastIndex = cursor;
      const m = seg.regex.exec(input);
      if (!m || m.index !== cursor) return null;
      for (let g = 1; g <= seg.captureKinds.length; g++) {
        if (seg.captureKinds[g - 1] === "position") {
          const idx = (m as any).indices?.[g];
          captures.push((idx ? idx[0] : 0) + 1);
        } else {
          captures.push(m[g] ?? null);
        }
      }
      cursor += m[0].length;
    } else {
      // Balanced — input[cursor] must be `open`; scan forward with
      // a depth counter until the matching `close` (or fail).
      if (input[cursor] !== seg.open) return null;
      let depth = 1;
      let j = cursor + 1;
      while (j < input.length && depth > 0) {
        const ch = input[j];
        // Close is checked BEFORE open (matchbalance in lstrlib) —
        // with identical delimiters (`%b''`) the second char must
        // close, not nest.
        if (ch === seg.close) depth--;
        else if (ch === seg.open) depth++;
        j++;
      }
      if (depth !== 0) return null;
      cursor = j;
    }
  }
  return { index: p, length: cursor - p, captures };
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
    throw new LuaPatternError("malformed pattern (ends with '%')");
  }
  // `%b` is handled by the segmenting pass in `luaPatternToJs`
  // before this function ever sees it. If we land here with `%b`,
  // it means a `%b` slipped into a context where the splitter
  // couldn't see it (e.g. inside a `[...]` set — which is invalid
  // anyway). Error explicitly.
  if (next === "b") {
    throw new LuaPatternError(
      "`%b` balanced-match cannot appear inside a character set.",
    );
  }
  // `%f[set]` — frontier pattern. Matches at a position where the
  // next char is in `set` and the previous one is not. Lua treats
  // the virtual positions just before the subject and just after it
  // as holding `\0`, so boundary behaviour depends on whether `\0`
  // belongs to the set:
  //   - prev half: `\0` ∈ set → start-of-subject FAILS (the virtual
  //     `\0` is in the set), so a real preceding char ∉ set is
  //     required: `(?<=[\s\S])(?<![set])`. `\0` ∉ set → plain
  //     `(?<![set])` (start-of-subject qualifies).
  //   - next half: `\0` ∈ set → end-of-subject QUALIFIES:
  //     `(?:(?=[set])|$)`. `\0` ∉ set → plain `(?=[set])`.
  // Membership is probed directly against the translated class
  // (pm.luau exercises `%f[%z]`, `%f[%l%z]`, `%f[^\1-\255]`, ...).
  if (next === "f") {
    if (inSet) {
      throw new LuaPatternError(
        "`%f` frontier pattern cannot appear inside a character set.",
      );
    }
    if (pattern[i + 2] !== "[") {
      throw new LuaPatternError("missing '[' after '%f' in pattern");
    }
    const setResult = translateCharClass(pattern, i + 2);
    const nulInSet = new RegExp(`^${setResult.emitted}$`).test("\0");
    const prevHalf = nulInSet
      ? `(?<=[\\s\\S])(?<!${setResult.emitted})`
      : `(?<!${setResult.emitted})`;
    const nextHalf = nulInSet
      ? `(?:(?=${setResult.emitted})|$)`
      : `(?=${setResult.emitted})`;
    emit(prevHalf + nextHalf);
    // Frontier is zero-width; no quantifier handling.
    return setResult.nextIndex;
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
    throw new LuaPatternError("malformed pattern (missing ']')");
  }
  // Special case: set body is exactly one negated class shorthand
  // (e.g. `[%W]`, `[^%w]`). Generic embedding of negated shorthands
  // inside a set produces semantically wrong JS regex — a leading
  // `^A-Za-z0-9` would only negate if it's the first char of the
  // class. Handle this common case by flipping the set-level
  // negation and emitting the corresponding positive content.
  //   `[%W]`  → flip + positive `A-Za-z0-9` → `[^A-Za-z0-9]`
  //   `[^%W]` → flip + positive `A-Za-z0-9` → `[A-Za-z0-9]`
  if (
    pattern[i] === "%" &&
    pattern[i + 1] !== undefined &&
    CLASS_TO_JS[pattern[i + 1]!]?.startsWith("^") &&
    pattern[i + 2] === "]"
  ) {
    const positiveBody = CLASS_TO_JS[pattern[i + 1]!]!.slice(1);
    const finalNegated = !negated;
    return {
      emitted: `[${finalNegated ? "^" : ""}${positiveBody}]`,
      nextIndex: i + 3,
    };
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
    throw new LuaPatternError("malformed pattern (missing ']')");
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
