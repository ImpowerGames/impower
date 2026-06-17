// Regression tests for first-class VARIADIC functions (vararg.luau
// lines 29-50):
//   - A variadic nested function referenced as a VALUE lowers to a
//     DivertTarget (variadic nested fns stay knot-form subflows — no
//     local closure binding exists), so `type(c12)`, `local h = c12`,
//     and passing it as an argument all work.
//   - Value-calls of variadic targets pack surplus args into one
//     MultiValue for the `...` slot at RUNTIME (no static PackTuple
//     ran): bare DivertTargets, closure values, and the JS-driven
//     CallLuauFunction path all normalize.
//   - Callable-name resolution is scope-aware (resolveCallableBinding):
//     a lambda param `f` shadows an outer variadic `function f(...)`;
//     an inner variadic subflow still shadows an outer local.
//   - First-class stdlib markers returning nothing (`call(print, ...)`)
//     push the Void sentinel so `a = call(print, {'+'})` reads nil.
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
  if (!result.program.compiled) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  const errors: string[] = [];
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("variadic functions as first-class values", () => {
  test("value references, local aliasing, and param calls", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local function c12(...) local x = {...} return x[1] + x[2] end
host_record(type(c12))
local h = c12
host_record(h(1, 2))
local callit = function (g) return g(10, 20) end
host_record(callit(c12))
host_record(callit(function (...) local x = {...} return x[1] + x[2] end))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["function", 3, 30, 30]);
  });

  test("param shadows an outer variadic subflow of the same name", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function f(a, ...) return select('#', ...) end
local function c12(...) local x = {...} return x[1] + x[2] end
local call = function (f, args) return f(table.unpack(args)) end
host_record(call(c12, {1, 2}))
host_record(f(0, 1, 2, 3))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3, 3]);
  });

  test("variadic value-calls spread trailing multi-returns and pad fixed params", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local function two() return 5, 6 end
local function v(a, ...) return a, select('#', ...) end
local call = function (g, x) return g(x, two()) end
local first, count = call(v, 1)
host_record(first)
host_record(count)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2]);
  });

  test("variadic method definitions bind self correctly", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = {1, 10}
function t:f (...)
  local arg = { n=select('#',...), ... }
  return self[arg[1]]+arg.n
end
host_record(t:f(1,4))
host_record(t:f(2))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3, 11]);
  });

  test("redefined variadic function routes per lexical position", () => {
    // Lua's `function f` is sugar for a global assignment: calls
    // before a redefinition hit the first body, calls after hit the
    // second, and a later plain `f = <expr>` rebinds again.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function f(...) return "first" end
host_record(f())
function f(a, b, ...) return select('#', ...) end
host_record(f(1, 2, 3, 4))
f = function(...) return {...} end
local x = f(2, 3)
host_record(x[1])
host_record(x[2])
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["first", 2, 2, 3]);
  });

  test("variadic natives spread an unpacked last arg; pure fns unwrap through markers", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(math.max(table.unpack({3, 9, 4})))
local callit = function (g, args) return g(table.unpack(args)) end
host_record(callit(math.max, {5, 2, 8}))
local ok, v = pcall(math.abs, -5)
host_record(ok)
host_record(v)
host_record(select('3', 10, 20, 30))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([9, 8, true, 5, 30]);
  });

  test("void stdlib marker through a param reads as nil", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local call = function (g, args) return g(table.unpack(args)) end
local a = call(print, {'+'})
host_record(a == nil)
local b = call(next, {{foo = 1}})
host_record(b)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, "foo"]);
  });
});
