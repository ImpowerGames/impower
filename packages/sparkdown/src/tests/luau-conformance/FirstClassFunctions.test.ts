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
host_record(f(5))
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
host_record(call_with_5(function(x) return x * 3 end))
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
host_record(a)
host_record(b)
host_record(c)
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
host_record(f(5))
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
host_record(add(7, 8))
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
host_record(doubler(5))
host_record(tripler(5))
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
host_record(f(5))
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
host_record(call_it(double, 5))
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
f = triple
end
return f(x)
end

function run()
host_record(pick(1, 5))
host_record(pick(0, 5))
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
host_record(f())
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
host_record(f(5))
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
host_record(f())
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([12]);
  });

  test("live capture: closure sees outer mutations", () => {
    // Lua-style open upvalue: the closure holds a live reference to
    // `n` in run's frame, so subsequent mutations to `n` are visible
    // through the closure. The captured pointer auto-resolves to
    // run's frame at closure-creation time and stays open while run
    // is on the call stack.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 10
local f = function() return n end
n = 100
host_record(f())
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([100]);
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
host_record(f(5))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([12]);
  });
});

describe("true lexical closures (open/close upvalues)", () => {
  test("closure mutation propagates to outer scope", () => {
    // Inner writes `n = n + 1` through its upval. Since the upval
    // points to outer's `n` (open pointer), the write propagates back
    // to outer's frame. Outer's read of `n` after the call sees the
    // updated value.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 0
local incr = function()
n = n + 1
end
incr()
incr()
incr()
host_record(n)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3]);
  });

  test("two closures sharing the same upval see each other's writes", () => {
    // Both `incr` and `read` capture `n` from run's frame. The dedup
    // path in Story.ts's auto-resolve gives them the SAME pointer
    // object, so when `incr` writes through it, `read` sees the new
    // value.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 0
local incr = function()
n = n + 1
end
local read = function()
return n
end
incr()
incr()
host_record(read())
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([2]);
  });

  test("closure outlives its lexical parent (close-on-pop)", () => {
    // outer returns `f`. By the time `f` is called, outer's frame
    // has been popped, so its `total` no longer exists on the call
    // stack. CallStack.Pop closes the open upvalue by snapshotting
    // the current value into the pointer's `closedValue`, so the
    // closure can still read and write through it.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& driver()
done

function driver()
local g = make()
g()
g()
host_record(g())
end

function make()
local total = 0
local f = function()
total = total + 1
return total
end
return f
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3]);
  });

  test("two closures share state via closed upval (table-routed)", () => {
    // Both closures are returned (in a table) from make_totaler. By the
    // time they're invoked, the parent frame is gone. They still share
    // the same closed cell (dedup at pointer-creation time), so the
    // bump closure's writes are visible to the peek closure even
    // though both upvals are closed.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& driver()
done

function driver()
local pair = make_totaler()
local bump = pair.bump
local peek = pair.peek
bump()
bump()
host_record(peek())
end

function make_totaler()
local n = 0
local bump = function()
n = n + 1
end
local peek = function()
return n
end
return { bump = bump, peek = peek }
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([2]);
  });
});

describe("nested named function definitions", () => {
  test("function defined inside another function is callable from its body", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function helper()
return 42
end
host_record(helper())
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([42]);
  });

  test("nested function takes args and returns a computed value", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function double(n)
return n * 2
end
host_record(double(7))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([14]);
  });

  test("nested function with the same name in two different functions does not collide", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& a()
& b()
done

function a()
function helper()
return 1
end
host_record(helper())
end

function b()
function helper()
return 2
end
host_record(helper())
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2]);
  });

  test("three-level nesting: function inside function inside function", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& outer()
done

function outer()
function middle()
function inner()
return 99
end
host_record(inner())
end
middle()
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([99]);
  });
});
