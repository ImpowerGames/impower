export type CaptureKind = "string" | "position";

export type PatternSegment =
  | {
      kind: "regex";
      regex: RegExp;
      captureKinds: CaptureKind[];
    }
  | {
      kind: "balanced";
      open: string;
      close: string;
    };

export interface CompiledLuaPattern {
  segments: PatternSegment[];
  captureCount: number;
  captureKinds: CaptureKind[];
  anchored: boolean;
  endAnchored: boolean;
}

export interface PatternMatchResult {
  index: number;
  length: number;
  captures: (string | number | null)[];
}

const LUA_WS = " \\t\\n\\v\\f\\r";

const LUA_PUNCT = "\\x21-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\x7e";

const LUA_CTRL = "\\x00-\\x1f\\x7f";

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
  g: "\\x21-\\x7e",
  G: "^\\x21-\\x7e",
  z: "\\x00",
  Z: "^\\x00",
};

const JS_ONLY_METACHARS = new Set(["|", "{", "}"]);

export class LuaPatternError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LuaPatternError";
  }
}

export function luaPatternToJs(pattern: string): CompiledLuaPattern {
  const anchored = pattern.startsWith("^");
  const endAnchored = pattern.endsWith("$") && !pattern.endsWith("%$");
  const body = pattern.slice(anchored ? 1 : 0, endAnchored ? -1 : pattern.length);

  const segments: PatternSegment[] = [];
  const captureKinds: CaptureKind[] = [];
  let chunkStart = 0;
  let i = 0;
  while (i < body.length) {
    if (body[i] === "%" && body[i + 1] === "b") {
      if (i > chunkStart) {
        segments.push(
          compileRegexSegment(
            body.slice(chunkStart, i),
            captureKinds,
            segments.length === 0 && anchored,
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
    if (body[i] === "%") {
      i += 2;
      continue;
    }
    if (body[i] === "[") {
      i++;
      while (i < body.length && body[i] !== "]") {
        if (body[i] === "%") i += 2;
        else i++;
      }
      i++;
      continue;
    }
    i++;
  }
  if (chunkStart < body.length || segments.length === 0) {
    segments.push(
      compileRegexSegment(
        body.slice(chunkStart),
        captureKinds,
        segments.length === 0 && anchored,
        endAnchored,
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

function compileRegexSegment(
  body: string,
  captureKinds: CaptureKind[],
  anchorStart: boolean,
  anchorEnd = false,
): PatternSegment {
  void anchorStart;
  let out = "";
  let i = 0;
  let captureCount = 0;
  let parenDepth = 0;
  const localCaptureKinds: CaptureKind[] = [];
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
      i = handleEscape(body, i, false, (s) => (out += s));
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

export function executeLuaPattern(
  compiled: CompiledLuaPattern,
  input: string,
  start: number,
): PatternMatchResult | null {
  const startPos = Math.max(0, Math.min(start, input.length));

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

  for (let p = startPos; p <= input.length; p++) {
    if (compiled.anchored && p > startPos) return null;
    const attempt = tryMatchSegmentsAt(compiled, input, p);
    if (attempt) {
      if (compiled.endAnchored && attempt.index + attempt.length !== input.length) {
        continue;
      }
      return attempt;
    }
  }
  return null;
}

function matchSingleRegex(
  seg: Extract<PatternSegment, { kind: "regex" }>,
  input: string,
  startPos: number,
  anchored: boolean,
  endAnchored: boolean,
): PatternMatchResult | null {
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
      if (input[cursor] !== seg.open) return null;
      let depth = 1;
      let j = cursor + 1;
      while (j < input.length && depth > 0) {
        const ch = input[j];
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
  if (inSet && !CLASS_TO_JS[next]) {
    emit(literalEscape(next));
    return i + 2;
  }
  if (next === "f") {
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
    return setResult.nextIndex;
  }
  if (/[1-9]/.test(next)) {
    emit("\\" + next);
    return i + 2 + advanceForQuantifier(pattern, i + 2, emit);
  }
  if (CLASS_TO_JS[next]) {
    if (inSet) {
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
  emit(literalEscape(next));
  return i + 2 + advanceForQuantifier(pattern, i + 2, emit);
}

function literalEscape(c: string): string {
  return /[A-Za-z0-9]/.test(c) ? c : "\\" + c;
}

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
  if (pattern[i] === "]") {
    body += "\\]";
    i++;
  }
  while (i < pattern.length && pattern[i] !== "]") {
    const c = pattern[i]!;
    if (c === "%") {
      i = handleEscape(pattern, i, true, (s) => (body += s));
      continue;
    }
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
  i++;
  const emitted = "[" + (negated ? "^" : "") + body + "]";
  return { emitted, nextIndex: i };
}

function readQuantifier(
  pattern: string,
  i: number,
): { emitted: string; nextIndex: number } | null {
  const c = pattern[i];
  if (c === "*" || c === "+" || c === "?") {
    return { emitted: c, nextIndex: i + 1 };
  }
  if (c === "-") {
    return { emitted: "*?", nextIndex: i + 1 };
  }
  return null;
}

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

function needsLiteralEscape(_c: string): boolean {
  return false;
}
