// Sanity tests for stdlib entries that recently landed — especially
// the n-ary pure path that `math.clamp` / `math.map` now use after
// `NativeFunctionCall` learned arity >= 3.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

function compileAndCapture(source: string): {
  errors: string[];
  recorded: unknown[];
} {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const errors: string[] = [];
  if (!result.program.compiled) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("stdlib n-ary numeric", () => {
  test("math.clamp clamps into [min, max]", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(math.clamp(5, 0, 10))
& host_record(math.clamp(-3, 0, 10))
& host_record(math.clamp(15, 0, 10))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([5, 0, 10]);
  });

  test("math.map remaps linearly across ranges", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(math.map(0.5, 0, 1, 0, 100))
& host_record(math.map(5, 0, 10, -1, 1))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([50, 0]);
  });
});

describe("stdlib globals", () => {
  test("tostring coerces numbers, booleans, nil", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(tostring(42))
& host_record(tostring(true))
& host_record(tostring("hi"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["42", "true", "hi"]);
  });

  test("type / typeof return Lua-style type names", () => {
    // Two grammar changes were needed to unblock `type(x)`:
    //   1. `LuauDataTypeDeclaration` got a `(?!{{WS}}*[(])`
    //      lookahead so `type(x)` falls through to the function-call
    //      path (not consumed as a type-alias declaration start).
    //   2. `LUAU_LOCAL_DECLARATION_KEYWORDS` no longer includes
    //      `type`, so `LUAU_TERMINATOR_KEYWORDS` doesn't reject
    //      `type` from `LuauAccessPath` in expression contexts.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(type(1))
& host_record(type("s"))
& host_record(type(true))
& host_record(typeof(1))
& host_record(typeof("s"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([
      "number",
      "string",
      "boolean",
      "number",
      "string",
    ]);
  });
});

describe("stdlib string.char + select + raw*", () => {
  test("string.char produces single-byte string from codepoints", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(string.char(65))
& host_record(string.char(72, 105))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["A", "Hi"]);
  });

  test('select("#", ...) returns the variadic arg count', () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(select("#", 1, 2, 3))
& host_record(select("#"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3, 0]);
  });

  test("utf8.charpattern constant is accessible", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(utf8.charpattern)
end
`);
    expect(errors).toEqual([]);
    // The exact pattern string — see STDLIB_CONSTANTS in StdLib.ts.
    expect(typeof recorded[0]).toBe("string");
    expect((recorded[0] as string).length).toBeGreaterThan(0);
  });
});

describe("stdlib bit32", () => {
  test("bit32 variadic ops fold across args", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(bit32.band(0xFF, 0x0F, 0x07))
& host_record(bit32.bor(0x01, 0x02, 0x04))
& host_record(bit32.bxor(0xFF, 0x0F))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([0x07, 0x07, 0xf0]);
  });
});

describe("stdlib string.rep + utf8 extras", () => {
  test("string.rep accepts an optional separator", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(string.rep("ab", 3))
& host_record(string.rep("ab", 3, "-"))
& host_record(string.rep("x", 0, "-"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["ababab", "ab-ab-ab", ""]);
  });

  test("utf8.nfcnormalize / nfdnormalize roundtrip", () => {
    // "é" can be expressed as one codepoint (U+00E9) or two
    // (U+0065 U+0301). NFC collapses to the precomposed form; NFD
    // decomposes. Cross-checking length proves the normalization
    // actually happened. Sparkdown doesn't decode `\u{}` escapes in
    // string literals, so we embed the chars directly via JS string
    // interpolation in the test source.
    const combining = "é"; // "e" + COMBINING ACUTE
    const precomposed = "é"; // "é" (NFC)
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(utf8.len(utf8.nfcnormalize("${combining}")))
& host_record(utf8.len(utf8.nfdnormalize("${precomposed}")))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2]);
  });

  test("utf8.len counts code points across byte ranges", () => {
    // "héllo" — 5 chars, but "é" takes 2 UTF-8 bytes (6 bytes total).
    const s = "héllo";
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(utf8.len("${s}"))
& host_record(utf8.len("${s}", 1, 1))
& host_record(utf8.len("${s}", 2, 3))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([5, 1, 1]);
  });

  test("utf8.offset returns 1-based byte positions", () => {
    // "héllo": h=1byte, é=2bytes, l=1, l=1, o=1 → boundaries at
    // bytes 1, 2, 4, 5, 6, 7 (the trailing entry is one past end).
    const s = "héllo";
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(utf8.offset("${s}", 1))
& host_record(utf8.offset("${s}", 2))
& host_record(utf8.offset("${s}", 3))
& host_record(utf8.offset("${s}", 0, 3))
end
`);
    expect(errors).toEqual([]);
    // n=0 with i=3 finds the char containing byte 3, which is the
    // second byte of "é" (whose start is byte 2).
    expect(recorded).toEqual([1, 2, 4, 2]);
  });
});

describe("bracket-key table literals", () => {
  test('{ ["k"] = v } produces a named-key table', () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { ["name"] = "Anonymous", ["score"] = 42 }
& host_record(rawget(t, "name"))
& host_record(rawget(t, "score"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["Anonymous", 42]);
  });

  test("bracket-key + bare-key + array entries mix", () => {
    // Array-style entries get auto-incremented int keys ("1", "2", …)
    // independent of named keys, matching Lua semantics.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 100, ["foo"] = "x", 200, bar = "y" }
& host_record(rawget(t, "1"))
& host_record(rawget(t, "2"))
& host_record(rawget(t, "foo"))
& host_record(rawget(t, "bar"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([100, 200, "x", "y"]);
  });

  test("bracket numeric key works for static integers", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { [5] = "five", [10] = "ten" }
& host_record(rawget(t, "5"))
& host_record(rawget(t, "10"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["five", "ten"]);
  });
});

describe("stdlib os.time table form", () => {
  test("os.time({year, month, day [, hour, min, sec]}) converts to a Unix timestamp", () => {
    // Local-time semantics: the absolute timestamp depends on host
    // TZ, so compare against a JS Date constructed the same way.
    const expected = Math.floor(
      new Date(2026, 0, 15, 12, 0, 0).getTime() / 1000,
    );
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(os.time({ year = 2026, month = 1, day = 15 }))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([expected]);
  });

  test("os.time accepts bracket-key table form too", () => {
    const expected = Math.floor(
      new Date(2026, 0, 15, 9, 30, 0).getTime() / 1000,
    );
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(os.time({ ["year"] = 2026, ["month"] = 1, ["day"] = 15, ["hour"] = 9, ["min"] = 30 }))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([expected]);
  });
});

describe("stdlib table.* (read-only)", () => {
  test("table.getn counts the array portion", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 10, 20, 30 }
& host_record(table.getn(t))
local empty = {}
& host_record(table.getn(empty))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3, 0]);
  });

  test("table.concat joins with separator", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { "a", "b", "c" }
& host_record(table.concat(t))
& host_record(table.concat(t, "-"))
& host_record(table.concat(t, ",", 2))
& host_record(table.concat({ 1, 2, 3 }, "+"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["abc", "a-b-c", "b,c", "1+2+3"]);
  });

  test("table.insert appends or inserts shifting later elements", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 10, 20, 30 }
& table.insert(t, 40)
& host_record(table.concat(t, ","))
& table.insert(t, 1, 5)
& host_record(table.concat(t, ","))
& table.insert(t, 3, 15)
& host_record(table.concat(t, ","))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["10,20,30,40", "5,10,20,30,40", "5,10,15,20,30,40"]);
  });

  test("table.remove pops last by default, or at given index", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 10, 20, 30, 40 }
& host_record(table.remove(t))
& host_record(table.concat(t, ","))
& host_record(table.remove(t, 1))
& host_record(table.concat(t, ","))
& host_record(table.remove(t, 5))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([40, "10,20,30", 10, "20,30", null]);
  });

  test("table.clear empties a table", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 1, 2, 3 }
& host_record(table.getn(t))
& table.clear(t)
& host_record(table.getn(t))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3, 0]);
  });

  test("table.clone makes a shallow copy", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 1, 2, 3 }
local c = table.clone(t)
& table.insert(c, 4)
& host_record(table.concat(t, ","))
& host_record(table.concat(c, ","))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["1,2,3", "1,2,3,4"]);
  });

  test("table.create builds an n-entry table sharing one value", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = table.create(3, "x")
& host_record(table.concat(t, ","))
& host_record(table.getn(t))
local empty = table.create(0)
& host_record(table.getn(empty))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["x,x,x", 3, 0]);
  });

  test("table.pack collects variadic args plus n field", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = table.pack(10, 20, 30)
& host_record(rawget(t, "n"))
& host_record(rawget(t, "1"))
& host_record(rawget(t, "3"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3, 10, 30]);
  });

  test("table.move copies an index range into another table", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a = { 1, 2, 3, 4, 5 }
local b = { 0, 0, 0, 0, 0 }
& table.move(a, 2, 4, 1, b)
& host_record(table.concat(b, ","))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["2,3,4,0,0"]);
  });

  test("table.freeze blocks mutation and table.isfrozen reports it", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 1, 2, 3 }
& host_record(table.isfrozen(t))
& table.freeze(t)
& host_record(table.isfrozen(t))
& table.insert(t, 4)
end
`);
    // The insert into the frozen table should error; everything
    // up to that point should still record cleanly.
    expect(recorded).toEqual([false, true]);
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/frozen/);
  });

  test("table.clone of a frozen table is unfrozen", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 1, 2 }
& table.freeze(t)
local c = table.clone(t)
& host_record(table.isfrozen(c))
& table.insert(c, 3)
& host_record(table.concat(c, ","))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([false, "1,2,3"]);
  });

  test("table.find returns first matching index, or nil if absent", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { "x", "y", "z", "y" }
& host_record(table.find(t, "y"))
& host_record(table.find(t, "y", 3))
& host_record(table.find(t, "missing"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([2, 4, null]);
  });
});
