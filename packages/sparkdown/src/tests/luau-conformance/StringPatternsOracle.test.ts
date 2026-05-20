// Parametric conformance tests for Lua patterns: every test case
// runs against BOTH sparkdown's pattern engine (compiled to JS
// regex via `luaPatternToJs`) and fengari (a Lua 5.3 VM in JS).
// Both must agree, byte-for-byte, on ASCII inputs.
//
// When sparkdown diverges from upstream Lua, this is the test file
// that fails. Hand-coded expected values live in
// StringPatterns.test.ts; this file is the oracle backstop.
//
// Phase 4 patterns (`%b`, `%f`, `()`) are NOT in this file — they
// throw `LuaPatternError` on the sparkdown side today. They'll be
// added as those features land.

import { describe, expect, test } from "vitest";
import { luaPatternToJs, LuaPatternError } from "../../inkjs/engine/LuaPatterns";
import {
  fengariFind,
  fengariGmatch,
  fengariGsub,
  fengariMatch,
} from "./_fengariOracle";

// Mirror of `StdLib.matchAt` — inlined here to avoid pulling the
// full inkjs module graph (Container/Object circular import) into
// this test file. The matcher itself is tiny.
function matchAt(regex: RegExp, s: string, start: number): RegExpExecArray | null {
  const sub = s.slice(start);
  const m = regex.exec(sub);
  if (!m) return null;
  (m as any).index = m.index + start;
  return m;
}

// Mirror of `StdLib.resolveInit` — same reason as above (avoid the
// inkjs module graph). Translates Lua's 1-indexed `init` (with
// negative-counts-from-end support) to a 1-based start position.
function resolveInit(init: number, strLen: number): number {
  let i = Math.floor(init);
  if (i < 0) i = Math.max(strLen + i + 1, 1);
  else if (i === 0) i = 1;
  if (i > strLen + 1) i = strLen + 1;
  return i;
}

// ============================================================
// Sparkdown-side implementations (direct calls into the JS-level
// matcher, bypassing the runtime). This lets us compare *exactly*
// the matcher's output against fengari, without runtime-layer
// boxing / unboxing noise.
// ============================================================

function sparkdownFind(
  s: string,
  pattern: string,
  init = 1,
  plain = false,
): unknown[] | null {
  if (plain) {
    const idx = s.indexOf(pattern, init - 1);
    if (idx < 0) return null;
    return [idx + 1, idx + pattern.length];
  }
  let compiled;
  try {
    compiled = luaPatternToJs(pattern);
  } catch (e) {
    if (e instanceof LuaPatternError) return null;
    throw e;
  }
  const m = matchAt(compiled.regex, s, resolveInit(init, s.length) - 1);
  if (!m) return null;
  const result: unknown[] = [m.index + 1, m.index + m[0]!.length];
  for (let g = 1; g <= compiled.captureCount; g++) {
    result.push(m[g] ?? null);
  }
  return result;
}

function sparkdownMatch(
  s: string,
  pattern: string,
  init = 1,
): unknown[] | null {
  let compiled;
  try {
    compiled = luaPatternToJs(pattern);
  } catch (e) {
    if (e instanceof LuaPatternError) return null;
    throw e;
  }
  const m = matchAt(compiled.regex, s, resolveInit(init, s.length) - 1);
  if (!m) return null;
  if (compiled.captureCount === 0) return [m[0]];
  const captures: unknown[] = [];
  for (let g = 1; g <= compiled.captureCount; g++) {
    captures.push(m[g] ?? null);
  }
  return captures;
}

function sparkdownGmatch(s: string, pattern: string): unknown[] {
  let compiled;
  try {
    compiled = luaPatternToJs(pattern);
  } catch (e) {
    if (e instanceof LuaPatternError) return [];
    throw e;
  }
  const results: unknown[] = [];
  let cursor = 0;
  while (cursor <= s.length) {
    const m = matchAt(compiled.regex, s, cursor);
    if (!m) break;
    if (compiled.captureCount === 0) {
      results.push(m[0]);
    } else {
      for (let g = 1; g <= compiled.captureCount; g++) {
        results.push(m[g] ?? null);
      }
    }
    const matchEnd = m.index + m[0]!.length;
    cursor = matchEnd === m.index ? matchEnd + 1 : matchEnd;
  }
  return results;
}

function sparkdownGsub(
  s: string,
  pattern: string,
  repl: string | Record<string, string>,
  n?: number,
): [string, number] {
  let compiled;
  try {
    compiled = luaPatternToJs(pattern);
  } catch (e) {
    if (e instanceof LuaPatternError) return [s, 0];
    throw e;
  }
  const out: string[] = [];
  let cursor = 0;
  let count = 0;
  while (cursor <= s.length) {
    if (n != null && count >= n) break;
    const m = matchAt(compiled.regex, s, cursor);
    if (!m) break;
    const matchStart = m.index;
    const matchEnd = matchStart + m[0]!.length;
    if (matchStart > cursor) out.push(s.slice(cursor, matchStart));
    let replacement: string;
    if (typeof repl === "string") {
      // Expand %N references in the template.
      replacement = "";
      let i = 0;
      while (i < repl.length) {
        const c = repl.charAt(i);
        if (c !== "%") {
          replacement += c;
          i++;
          continue;
        }
        const next = repl.charAt(i + 1);
        if (next === "%") {
          replacement += "%";
          i += 2;
          continue;
        }
        if (next >= "0" && next <= "9") {
          const g = parseInt(next, 10);
          replacement += g === 0 ? m[0]! : (m[g] ?? "");
          i += 2;
          continue;
        }
        replacement += next;
        i += 2;
      }
    } else {
      const key = compiled.captureCount === 0 ? m[0]! : (m[1] ?? "");
      const lookup = repl[key];
      replacement = lookup == null ? m[0]! : String(lookup);
    }
    out.push(replacement);
    count++;
    if (matchEnd === matchStart) {
      if (matchStart < s.length) out.push(s.charAt(matchStart));
      cursor = matchStart + 1;
    } else {
      cursor = matchEnd;
    }
  }
  if (cursor < s.length) out.push(s.slice(cursor));
  return [out.join(""), count];
}

// ============================================================
// Parametric cases — `[input, pattern]` for the no-arg ops, plus
// op-specific variants where extra args matter.
// ============================================================

const FIND_MATCH_CASES: Array<[string, string]> = [
  // Literal substring.
  ["hello world", "world"],
  ["abc", "xyz"],
  // Character classes.
  ["abc 12345 def", "%d+"],
  ["123 abc 456", "%a+"],
  ["a1b2c3", "%a%d"],
  ["foo BAR baz", "%u+"],
  ["foo bar BAZ", "%l+"],
  ["abc!def?ghi.", "%p"],
  ["abc def", "%s+"],
  ["abc_def", "%w+"], // Lua's %w EXCLUDES `_` — divergence from JS \w
  ["x1y_z9", "[%a%d]+"],
  // Anchors.
  ["abc123", "^%a+"],
  ["123abc", "^%a+"],
  ["file.txt", "%.txt$"],
  ["file.sd", "%.txt$"],
  // Captures.
  ["hello world", "(%a+) world"],
  ["2026-05-20", "(%d+)-(%d+)-(%d+)"],
  ["k=v", "(%a+)=(%a+)"],
  // Quantifiers.
  ["color", "colou?r"],
  ["colour", "colou?r"],
  ["<a><b>", "<(.-)>"], // Lazy
  ["<a><b>", "<(.*)>"], // Greedy
  ["aaaa", "a*"],
  ["bbb", "a*"],
  ["aaaa", "a+"],
  ["bbb", "a+"],
  // Escaped magic chars.
  ["1+1=2", "1%+1"],
  ["a.b.c", "%."],
  // Sets and negation.
  ["abc123", "[^%a]+"],
  ["abc XYZ", "[a-z]+"],
  ["abc XYZ", "[A-Z]+"],
];

describe("string.find — conforms to fengari", () => {
  for (const [s, pattern] of FIND_MATCH_CASES) {
    test(`find(${JSON.stringify(s)}, ${JSON.stringify(pattern)})`, () => {
      expect(sparkdownFind(s, pattern)).toEqual(fengariFind(s, pattern));
    });
  }

  test("init — positive", () => {
    expect(sparkdownFind("aaa aaa aaa", "%a+", 5)).toEqual(
      fengariFind("aaa aaa aaa", "%a+", 5),
    );
  });

  test("init — negative", () => {
    expect(sparkdownFind("aaa aaa aaa", "%a+", -3)).toEqual(
      fengariFind("aaa aaa aaa", "%a+", -3),
    );
  });

  test("plain mode — literal substring", () => {
    expect(sparkdownFind("a.+? then", ".+?", 1, true)).toEqual(
      fengariFind("a.+? then", ".+?", 1, true),
    );
  });
});

describe("string.match — conforms to fengari", () => {
  for (const [s, pattern] of FIND_MATCH_CASES) {
    test(`match(${JSON.stringify(s)}, ${JSON.stringify(pattern)})`, () => {
      expect(sparkdownMatch(s, pattern)).toEqual(fengariMatch(s, pattern));
    });
  }
});

const GMATCH_CASES: Array<[string, string]> = [
  ["hello world from sparkdown", "%a+"],
  ["from=here, to=there, who=we", "(%a+)=(%a+)"],
  ["a b c d e", "%a"],
  ["no digits here", "%d+"],
  ["1,2,3,4,5", "%d+"],
  ["one  two   three", "%S+"],
];

describe("string.gmatch — conforms to fengari", () => {
  for (const [s, pattern] of GMATCH_CASES) {
    test(`gmatch(${JSON.stringify(s)}, ${JSON.stringify(pattern)})`, () => {
      expect(sparkdownGmatch(s, pattern)).toEqual(fengariGmatch(s, pattern));
    });
  }
});

const GSUB_STRING_CASES: Array<[string, string, string, number | undefined]> = [
  ["hello world", "o", "0", undefined],
  ["abc", "%a", "[%0]", undefined],
  ["year=2026, month=05", "(%a+)=(%d+)", "%2 %1", undefined],
  ["abc", "b", "%%%%", undefined],
  ["aaaaaa", "a", "X", 3],
  ["hello", "%d+", "X", undefined],
];

describe("string.gsub (string repl) — conforms to fengari", () => {
  for (const [s, pattern, repl, n] of GSUB_STRING_CASES) {
    test(`gsub(${JSON.stringify(s)}, ${JSON.stringify(pattern)}, ${JSON.stringify(repl)}${n != null ? `, ${n}` : ""})`, () => {
      expect(sparkdownGsub(s, pattern, repl, n)).toEqual(
        fengariGsub(s, pattern, repl, n),
      );
    });
  }
});

describe("string.gsub (table repl) — conforms to fengari", () => {
  const cases: Array<[string, string, Record<string, string>]> = [
    [
      "hi $name and $who!",
      "%$(%a+)",
      { name: "Anonymous", who: "stranger" },
    ],
    ["$x $y $x", "%$(%a+)", { x: "ONE" }],
    ["a b c", "%a", { a: "A", c: "C" }],
  ];
  for (const [s, pattern, repl] of cases) {
    test(`gsub(${JSON.stringify(s)}, ${JSON.stringify(pattern)}, table)`, () => {
      expect(sparkdownGsub(s, pattern, repl)).toEqual(
        fengariGsub(s, pattern, repl),
      );
    });
  }
});
