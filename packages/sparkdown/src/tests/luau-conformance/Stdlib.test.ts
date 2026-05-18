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

// Note: `os.time({year=..., month=..., day=...})` (table form) is
// implemented in StdLib.ts but unreachable from user code today —
// sparkdown's named-key table literals produce an empty Map (see
// task #83). The 0-arg form is exercised in earlier coverage; add
// a table-form test here once #83 lands.

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

  test("table.find returns first matching index (or 0 for missing — see #82)", () => {
    // The "missing" case should return nil, but sparkdown's stdlib
    // dispatcher currently coerces JS `null` to `IntValue(0)` because
    // there's no `NullValue` type — pre-existing limitation tracked
    // as task #82. Flip the third expectation to `null` once that
    // lands.
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
    expect(recorded).toEqual([2, 4, 0]);
  });
});
