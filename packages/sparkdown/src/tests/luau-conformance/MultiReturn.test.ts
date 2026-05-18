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
