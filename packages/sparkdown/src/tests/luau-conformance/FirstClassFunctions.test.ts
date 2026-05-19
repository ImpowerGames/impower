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
  // Filter out the "should be marked as `-> fn`" Warning. It's a hint
  // for users who haven't seen Luau's first-class function shorthand
  // — sparkdown's anonymous-function lowering handles it correctly
  // without the explicit `->` syntax.
  story.onError = (m: string) => {
    if (/should be marked as: -> /.test(m)) return;
    errors.push(m);
  };
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("anonymous function literals", () => {
  test("local f = function(x) return x * 2 end", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local f = function(x) return x * 2 end
& host_record(f(5))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10]);
  });

  test("pass anonymous fn as call arg", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function call_with_5(fn)
return fn(5)
end

function run()
& host_record(call_with_5(function(x) return x * 3 end))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([15]);
  });

  test("anonymous fn returning multi-value composes with multi-target", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local f = function() return 1, 2, 3 end
local a, b, c = f()
& host_record(a)
& host_record(b)
& host_record(c)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 3]);
  });

  test("named knot called via stored value (existing -> divert literal)", () => {
    // This worked before — included as a regression guard. The
    // anonymous-function lowering shouldn't have broken named-function
    // first-class storage.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function double(x)
return x * 2
end

function run()
local f = -> double
& host_record(f(5))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10]);
  });

  test("anonymous fn with two parameters", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local add = function(a, b) return a + b end
& host_record(add(7, 8))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([15]);
  });

  test("multiple anonymous fns in same scope get unique names", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local doubler = function(x) return x * 2 end
local tripler = function(x) return x * 3 end
& host_record(doubler(5))
& host_record(tripler(5))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10, 15]);
  });
});

describe("bare knot names as values", () => {
  test("local f = double — bare function-knot reference works as value", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function double(x)
return x * 2
end

function run()
local f = double
& host_record(f(5))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10]);
  });

  test("pass bare knot name as a function argument", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function double(x)
return x * 2
end

function call_it(fn, arg)
return fn(arg)
end

function run()
& host_record(call_it(double, 5))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10]);
  });

  test("multiple bare knot references in scope", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function double(x)
return x * 2
end

function triple(x)
return x * 3
end

function pick(use_double, x)
local f = double
if use_double == 0 then
& f = triple
end
return f(x)
end

function run()
& host_record(pick(1, 5))
& host_record(pick(0, 5))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10, 15]);
  });
});

describe("closures (capture-by-value)", () => {
  test("simple capture: function() return n + 1 end", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 10
local f = function() return n + 1 end
& host_record(f())
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([11]);
  });

  test("closure with user arg AND captured upval", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 10
local f = function(x) return n + x end
& host_record(f(5))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([15]);
  });

  test("two captures", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a = 3
local b = 4
local f = function() return a * b end
& host_record(f())
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([12]);
  });

  test("snapshot semantics: outer mutation doesn't propagate", () => {
    // V1 captures by VALUE at definition time. Lua captures by
    // reference (closure sees subsequent outer mutations). Document
    // the divergence — closure stays at 10 even though outer `n`
    // changed to 100.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 10
local f = function() return n end
n = 100
& host_record(f())
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10]);
  });

  test("only locally-bound names ARE bound (params + locals don't capture)", () => {
    // The free-variable scan correctly excludes the function's own
    // parameters AND its inner-local declarations from the upval set.
    // This test would fail with a "Variable not found" warning at
    // closure definition if the scan over-captured params.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local f = function(x)
local y = x + 1
return y * 2
end
& host_record(f(5))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([12]);
  });
});
