// A `%` before a letter or digit that is not a character class matches that
// character itself, inside and outside a set, as Luau's lstrlib does
// (I-1398). The translator once emitted these as JavaScript regex escapes, so
// `%t` matched a tab, `%B` matched nowhere and `[%0]` matched NUL.

import { describe, expect, test } from "vitest";
import { executeLuaPattern, luaPatternToJs } from "../../runtime/LuaPatterns";
import { fengariGmatch } from "../luau-conformance/_fengariOracle";

const run = (p: string, s: string) => executeLuaPattern(luaPatternToJs(p), s, 0);

/** Every match of `pattern` across `s`, as `string.gmatch` yields them. */
const gmatch = (pattern: string, s: string): string[] => {
  const compiled = luaPatternToJs(pattern);
  const out: string[] = [];
  let pos = 0;
  while (pos <= s.length) {
    const m = executeLuaPattern(compiled, s, pos);
    if (!m) break;
    out.push(s.slice(m.index, m.index + m.length));
    pos = m.length === 0 ? m.index + 1 : m.index + m.length;
  }
  return out;
};

const ASCII = Array.from({ length: 128 }, (_, n) => String.fromCharCode(n)).join("");
const ALNUM = ASCII.split("").filter((c) => /[A-Za-z0-9]/.test(c));

describe("percent-escaped letters that are not classes", () => {
  const control: Record<string, string> = { t: "\t", n: "\n", r: "\r", v: "\v" };

  test.each(["t", "n", "r", "v"])("%%%s matches the letter", (c) => {
    expect(run("%" + c, "x" + c + "x")!.index).toBe(1);
  });

  test.each(["t", "n", "r", "v"])("%%%s does not match its control character", (c) => {
    expect(run("%" + c, "x" + control[c] + "x")).toBeNull();
  });

  test("[%t] matches t and not a tab", () => {
    expect(run("[%t]", "x\tt")!.index).toBe(2);
  });

  test("%B matches B", () => {
    expect(run("%B", "aBc")).toEqual({ index: 1, length: 1, captures: [] });
  });

  test.each(["b", "f", "1", "9", "0"])("[%%%s] matches the character", (c) => {
    expect(run(`[%${c}]`, "x" + c)!.index).toBe(1);
  });

  test("[%0] does not match NUL", () => {
    expect(run("[%0]", "x" + String.fromCharCode(0))).toBeNull();
  });
});

// The sweep below found `%c` missing DEL, which C `iscntrl` (and so Luau)
// counts as a control character.
describe("%c matches DEL", () => {
  const DEL = String.fromCharCode(0x7f);
  test.each(["%c", "[%c]"])("%s", (p) => {
    expect(run(p, "x" + DEL)!.index).toBe(1);
  });
  test.each(["%C", "[%C]"])("%s", (p) => {
    expect(run(p, DEL)).toBeNull();
  });
});

describe("agrees with Lua on every alphanumeric escape", () => {
  // Outside a set `%b`, `%f` and the digits are pattern items with their own
  // tests; everything else is a class or the character itself.
  const outside = ALNUM.filter((c) => !/[bf0-9]/.test(c));
  test.each(outside)("%%%s", (c) => {
    expect(gmatch("%" + c, ASCII)).toEqual(fengariGmatch(ASCII, "%" + c));
  });
  test.each(ALNUM)("[%%%s]", (c) => {
    expect(gmatch(`[%${c}]`, ASCII)).toEqual(fengariGmatch(ASCII, `[%${c}]`));
  });
});
