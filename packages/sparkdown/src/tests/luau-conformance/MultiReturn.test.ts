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

describe("stdlib multi-return", () => {
  test("math.modf splits into integer + fractional parts (multi-target)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local i, f = math.modf(3.7)
& host_record(i)
& host_record(f)
end
`);
    expect(errors).toEqual([]);
    expect(recorded.length).toBe(2);
    expect(recorded[0]).toBe(3);
    // The fractional part may have rounding noise from JS doubles.
    expect(typeof recorded[1]).toBe("number");
    expect(recorded[1] as number).toBeCloseTo(0.7, 10);
  });

  test("math.modf handles negative numbers (integer part follows sign of x)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local i, f = math.modf(-2.3)
& host_record(i)
& host_record(f)
end
`);
    expect(errors).toEqual([]);
    expect(recorded[0]).toBe(-2);
    expect(recorded[1] as number).toBeCloseTo(-0.3, 10);
  });

  test("single-target assignment auto-unwraps to first value", () => {
    // `local x = math.modf(3.7)` discards the fractional part.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local x = math.modf(3.7)
& host_record(x)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3]);
  });

  test("multi-return as a function arg uses only the first value", () => {
    // `host_record(math.modf(3.7))` — non-last arg position in Lua
    // truncates to a single value; sparkdown applies the same rule
    // unconditionally for now (spread-into-call-args is V2).
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(math.modf(3.7))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3]);
  });
});

describe("user-defined multi-return", () => {
  test("return a, b packs and unpacks across function boundary", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function pair()
return 100, 200
end

function run()
local a, b = pair()
& host_record(a)
& host_record(b)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([100, 200]);
  });

  test("return a, b in single-target context gives first value", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function pair()
return 100, 200
end

function run()
local x = pair()
& host_record(x)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([100]);
  });

  test("return a, b, c with three-target consumer", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function triple()
return 1, 2, 3
end

function run()
local x, y, z = triple()
& host_record(x)
& host_record(y)
& host_record(z)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 3]);
  });
});

describe("math.frexp", () => {
  test("frexp(8) = (0.5, 4) since 8 = 0.5 * 2^4", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local m, e = math.frexp(8)
& host_record(m)
& host_record(e)
end
`);
    expect(errors).toEqual([]);
    expect(recorded[0]).toBeCloseTo(0.5, 10);
    expect(recorded[1]).toBe(4);
  });

  test("frexp(0) = (0, 0)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local m, e = math.frexp(0)
& host_record(m)
& host_record(e)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([0, 0]);
  });

  test("frexp(-3) gives negative mantissa", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local m, e = math.frexp(-3)
& host_record(m)
& host_record(e)
end
`);
    expect(errors).toEqual([]);
    expect(recorded[0]).toBeCloseTo(-0.75, 10);
    expect(recorded[1]).toBe(2);
  });

  test("frexp roundtrips via ldexp", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local m, e = math.frexp(42.5)
& host_record(math.ldexp(m, e))
end
`);
    expect(errors).toEqual([]);
    expect(recorded[0]).toBeCloseTo(42.5, 10);
  });
});

describe("string.byte", () => {
  test("string.byte(s) returns first byte", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(string.byte("A"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([65]);
  });

  test("string.byte(s, i, j) returns range", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a, b, c = string.byte("ABC", 1, 3)
& host_record(a)
& host_record(b)
& host_record(c)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([65, 66, 67]);
  });

  test("string.byte with negative index counts from end", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(string.byte("hello", -1))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([111]); // 'o'
  });
});

describe("utf8.codepoint", () => {
  test("utf8.codepoint(s) returns first codepoint", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(utf8.codepoint("A"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([65]);
  });

  test("utf8.codepoint over a multi-byte char", () => {
    // "é" is U+00E9 = decimal 233, encoded as 2 UTF-8 bytes.
    const s = "é";
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(utf8.codepoint("${s}"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([0xe9]);
  });

  test("utf8.codepoint(s, i, j) returns multiple codepoints", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a, b, c = utf8.codepoint("ABC", 1, 3)
& host_record(a)
& host_record(b)
& host_record(c)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([65, 66, 67]);
  });
});

describe("table.unpack / unpack", () => {
  test("table.unpack returns array values as multi-return", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 10, 20, 30 }
local a, b, c = table.unpack(t)
& host_record(a)
& host_record(b)
& host_record(c)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10, 20, 30]);
  });

  test("table.unpack with i, j returns a slice", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { "a", "b", "c", "d" }
local x, y = table.unpack(t, 2, 3)
& host_record(x)
& host_record(y)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["b", "c"]);
  });

  test("unpack global alias works identically", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 100, 200, 300 }
local a, b, c = unpack(t)
& host_record(a)
& host_record(b)
& host_record(c)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([100, 200, 300]);
  });
});

describe("select(n, ...)", () => {
  test("select(2, a, b, c) returns b, c", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a, b = select(2, "x", "y", "z")
& host_record(a)
& host_record(b)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["y", "z"]);
  });

  test("select(1, ...) returns all of the varargs", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a, b, c = select(1, 10, 20, 30)
& host_record(a)
& host_record(b)
& host_record(c)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10, 20, 30]);
  });

  test("select(-1, ...) returns the last arg", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(select(-1, "x", "y", "z"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["z"]);
  });
});

describe("spread context — return", () => {
  test("return f() (single expression) forwards all values", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function inner()
return 1, 2, 3
end

function outer()
return inner()
end

function run()
local a, b, c = outer()
& host_record(a)
& host_record(b)
& host_record(c)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 3]);
  });

  test("return a, b, f() spreads the last expression", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function multi()
return 30, 40, 50
end

function wrap()
return 10, 20, multi()
end

function run()
local a, b, c, d, e = wrap()
& host_record(a)
& host_record(b)
& host_record(c)
& host_record(d)
& host_record(e)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10, 20, 30, 40, 50]);
  });

  test("return f(), b truncates a non-last multi-return", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function multi()
return 10, 20, 30
end

function wrap()
return multi(), 99
end

function run()
local a, b, c = wrap()
& host_record(a)
& host_record(b)
& host_record(c)
end
`);
    expect(errors).toEqual([]);
    // multi() truncates to 10 (not last), b = 99, c = nil (no third return).
    expect(recorded).toEqual([10, 99, null]);
  });
});

describe("spread context — table literal", () => {
  test("{a, b, f()} spreads the last array-style entry", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function multi()
return 30, 40, 50
end

function run()
local t = {10, 20, multi()}
& host_record(table.concat(t, ","))
& host_record(table.getn(t))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["10,20,30,40,50", 5]);
  });

  test("{f()} alone spreads", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function multi()
return 1, 2, 3, 4
end

function run()
local t = {multi()}
& host_record(table.concat(t, ","))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["1,2,3,4"]);
  });

  test("{f(), b} truncates non-last multi-return", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function multi()
return 10, 20, 30
end

function run()
local t = {multi(), 99}
& host_record(table.concat(t, ","))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["10,99"]);
  });

  test("named-key last entry does NOT spread (key is not numeric)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function multi()
return 100, 200
end

function run()
local t = {1, 2, name = multi()}
& host_record(rawget(t, "name"))
& host_record(table.getn(t))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([100, 2]);
  });
});

describe("spread context — call args", () => {
  test("last variadic-call arg spreads", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function multi()
return 100, 200, 300
end

function run()
-- select's tail-args see the spread MultiValue: 4 trailing args.
& host_record(select("#", "a", multi()))
end
`);
    expect(errors).toEqual([]);
    // select("#", ...) counts 4: "a", 100, 200, 300.
    expect(recorded).toEqual([4]);
  });

  test("non-last arg truncates a multi-return", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function multi()
return 100, 200, 300
end

function run()
-- multi() is in arg position 2 of 3 → truncates to 100.
-- "tail" is in last position → unchanged.
& host_record(select("#", "a", multi(), "tail"))
end
`);
    expect(errors).toEqual([]);
    // count: "a" + truncated-multi(100) + "tail" = 3 trailing args.
    expect(recorded).toEqual([3]);
  });
});

describe("multi-target padding and truncation", () => {
  test("multi-target with single-value RHS pads remaining with nil", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a, b = 42
& host_record(a)
& host_record(b)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([42, null]);
  });

  test("multi-target with fewer-return RHS pads remaining with nil", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function pair()
return 1, 2
end

function run()
local a, b, c, d = pair()
& host_record(a)
& host_record(b)
& host_record(c)
& host_record(d)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, null, null]);
  });

  test("multi-target with more-return RHS drops extras", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function quad()
return 10, 20, 30, 40
end

function run()
local a, b = quad()
& host_record(a)
& host_record(b)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10, 20]);
  });
});
