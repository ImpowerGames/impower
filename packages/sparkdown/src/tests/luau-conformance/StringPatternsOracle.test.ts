import { describe, expect, test } from "vitest";
import {
  executeLuaPattern,
  luaPatternToJs,
  LuaPatternError,
} from "../../runtime/LuaPatterns";
import {
  fengariFind,
  fengariGmatch,
  fengariGsub,
  fengariMatch,
} from "./_fengariOracle";

function resolveInit(init: number, strLen: number): number {
  let i = Math.floor(init);
  if (i < 0) i = Math.max(strLen + i + 1, 1);
  else if (i === 0) i = 1;
  if (i > strLen + 1) i = strLen + 1;
  return i;
}

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
  const matched = executeLuaPattern(
    compiled,
    s,
    resolveInit(init, s.length) - 1,
  );
  if (!matched) return null;
  return [
    matched.index + 1,
    matched.index + matched.length,
    ...matched.captures,
  ];
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
  const matched = executeLuaPattern(
    compiled,
    s,
    resolveInit(init, s.length) - 1,
  );
  if (!matched) return null;
  if (compiled.captureCount === 0) {
    return [s.slice(matched.index, matched.index + matched.length)];
  }
  return matched.captures;
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
    const matched = executeLuaPattern(compiled, s, cursor);
    if (!matched) break;
    const matchEnd = matched.index + matched.length;
    if (compiled.captureCount === 0) {
      results.push(s.slice(matched.index, matchEnd));
    } else {
      results.push(...matched.captures);
    }
    cursor = matched.length === 0 ? matchEnd + 1 : matchEnd;
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
    const matched = executeLuaPattern(compiled, s, cursor);
    if (!matched) break;
    const matchStart = matched.index;
    const matchEnd = matchStart + matched.length;
    const wholeMatch = s.slice(matchStart, matchEnd);
    if (matchStart > cursor) out.push(s.slice(cursor, matchStart));
    let replacement: string;
    if (typeof repl === "string") {
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
          if (g === 0) replacement += wholeMatch;
          else {
            const cap = matched.captures[g - 1];
            replacement += cap == null ? "" : String(cap);
          }
          i += 2;
          continue;
        }
        replacement += next;
        i += 2;
      }
    } else {
      const key =
        compiled.captureCount === 0
          ? wholeMatch
          : String(matched.captures[0] ?? "");
      const lookup = repl[key];
      replacement = lookup == null ? wholeMatch : String(lookup);
    }
    out.push(replacement);
    count++;
    if (matched.length === 0) {
      if (matchStart < s.length) out.push(s.charAt(matchStart));
      cursor = matchStart + 1;
    } else {
      cursor = matchEnd;
    }
  }
  if (cursor < s.length) out.push(s.slice(cursor));
  return [out.join(""), count];
}

const FIND_MATCH_CASES: Array<[string, string]> = [
  ["before (a (b c) d) after", "%b()"],
  ["(unbalanced", "%b()"],
  ["{x {y} z}", "%b{}"],
  ["foo (bar) baz (qux)", "%b()"],
  ["empty()", "%b()"],
  ["prefix [a [b] c] suffix", "%b[]"],
  ["fn(args)", "%a+%b()"],
  ["x(1) y(2)", "(%a)%b()"],
  ["hello", "()"],
  ["hello", "()hello"],
  ["hello world", "(%a+)() (%a+)"],
  ["abcdef", "abc()def"],
  ["abc", "(%a)()(%a)"],
  ["the dog ate", "%f[%a]%a+"],
  ["123 abc 456 def", "%f[%a]%a+"],
  ["abc123def", "%f[%d]%d+"],
  ["hello world", "%f[%w]%w+%f[%W]"],
  ["abcdef", "%f[%a]"],
  ["   abc", "%f[%a]"],
  ["hello world", "world"],
  ["abc", "xyz"],
  ["abc 12345 def", "%d+"],
  ["123 abc 456", "%a+"],
  ["a1b2c3", "%a%d"],
  ["foo BAR baz", "%u+"],
  ["foo bar BAZ", "%l+"],
  ["abc!def?ghi.", "%p"],
  ["abc def", "%s+"],
  ["abc_def", "%w+"],
  ["x1y_z9", "[%a%d]+"],
  ["abc123", "^%a+"],
  ["123abc", "^%a+"],
  ["file.txt", "%.txt$"],
  ["file.sd", "%.txt$"],
  ["hello world", "(%a+) world"],
  ["2026-05-20", "(%d+)-(%d+)-(%d+)"],
  ["k=v", "(%a+)=(%a+)"],
  ["color", "colou?r"],
  ["colour", "colou?r"],
  ["<a><b>", "<(.-)>"],
  ["<a><b>", "<(.*)>"],
  ["aaaa", "a*"],
  ["bbb", "a*"],
  ["aaaa", "a+"],
  ["bbb", "a+"],
  ["1+1=2", "1%+1"],
  ["a.b.c", "%."],
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
