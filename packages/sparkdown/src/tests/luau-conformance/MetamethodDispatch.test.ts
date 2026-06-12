// Regression tests for the basic.luau lines 438-570 batch:
//   - `__namecall` fallback for colon-calls whose method lookup misses
//     (newproxy userdata pattern), including a callable-table handler
//     (`__namecall` set to a table with `__call`).
//   - `__call` resolution inside CallLuauFunction /
//     CallLuauFunctionProtected (callable tables passed to pcall).
//   - `__eq` getequalhandler rule: primitive identity first, handler
//     fires only when BOTH operands share the SAME `__eq` value.
//   - First-class stdlib builtins dispatched through pcall
//     (`pcall(rawequal, ...)`), including the missing-argument trap.
//   - `__idiv` / `__tostring` metamethods and C-style `%g` formatting
//     (the vec3t pattern).
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

describe("__namecall", () => {
  test("function handler fires for colon-calls with no method", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local obj = newproxy(true)
getmetatable(obj).__namecall = function(self, arg) return 42 + arg end
host_record(obj:Foo(10))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([52]);
  });

  test("callable-table handler resolves through __call", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local obj = newproxy(true)
local t = {}
setmetatable(t, { __call = function(self1, self2, arg) return 42 + arg end })
getmetatable(obj).__namecall = t
host_record(obj:Foo(10))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([52]);
  });
});

describe("__call via pcall", () => {
  test("pcall on a callable table rewrites to __call(t, args...)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = setmetatable({}, { __call = function(self, a, b) return a + b end })
local ok, r = pcall(t, 3, 4)
host_record(ok)
host_record(r)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, 7]);
  });
});

describe("__eq same-handler rule", () => {
  test("primitive identity wins — handler is not consulted for a == a", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a = setmetatable({}, { __eq = function() return false end })
host_record(a == a)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true]);
  });

  test("same metatable fires the handler", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local mt = { __eq = function(l, r) return #l == #r end }
local a = setmetatable({}, mt)
local b = setmetatable({}, mt)
host_record(a == b)
host_record(a ~= b)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, false]);
  });

  test("different metatables sharing one handler still fire it", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local function eq(l, r) return #l == #r end
local a = setmetatable({}, { __eq = eq })
local b = setmetatable({}, { __eq = eq })
host_record(a == b)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true]);
  });

  test("distinct handlers do NOT fire — plain reference equality", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a = setmetatable({}, { __eq = function(l, r) return #l == #r end })
local b = setmetatable({}, { __eq = function(l, r) return #l == #r end })
host_record(a == b)
host_record(a ~= b)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([false, true]);
  });
});

describe("first-class stdlib builtins through pcall", () => {
  test("pcall(rawequal, a, b) dispatches the builtin", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local ok1, r1 = pcall(rawequal, "a", "a")
host_record(ok1)
host_record(r1)
local ok2, r2 = pcall(rawequal, "a", "b")
host_record(ok2)
host_record(r2)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, true, true, false]);
  });

  test("under-application of a fixed-arity builtin traps", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(pcall(rawequal, "a") == false)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true]);
  });
});

describe("vec3t metamethod arithmetic", () => {
  test("__idiv and __tostring dispatch; %g formats shortest-form", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function vec3t(x, y, z)
    return setmetatable({x=x, y=y, z=z}, {
        __add = function(l, r) return vec3t(l.x + r.x, l.y + r.y, l.z + r.z) end,
        __idiv = function(l, r) return type(r) == "number" and vec3t(l.x // r, l.y // r, l.z // r) or vec3t(l.x // r.x, l.y // r.y, l.z // r.z) end,
        __tostring = function(v) return string.format("%g, %g, %g", v.x, v.y, v.z) end
    })
end

function run()
host_record(tostring(vec3t(1,2,3) + vec3t(4,5,6)))
host_record(tostring(vec3t(1,2,3) // vec3t(2,4,2)))
host_record(tostring(vec3t(1,2,3) // 2))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["5, 7, 9", "0, 0, 1", "0, 1, 1"]);
  });

  test("%g matches C semantics at the fixed/exponential boundary", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(string.format("%g", 5))
host_record(string.format("%g", 0.5))
host_record(string.format("%g", 100000))
host_record(string.format("%g", 1000000))
host_record(string.format("%g", 0.00001))
host_record(string.format("%.3g", 1234))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["5", "0.5", "100000", "1e+06", "1e-05", "1.23e+03"]);
  });
});
