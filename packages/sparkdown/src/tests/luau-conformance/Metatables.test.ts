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

describe("setmetatable / getmetatable", () => {
  test("setmetatable returns the table and stores the metatable", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = {}
local mt = {}
local r = setmetatable(t, mt)
host_record(r == t)
host_record(getmetatable(t) == mt)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, true]);
  });

  test("setmetatable(t, nil) clears the metatable", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = setmetatable({}, { x = 1 })
host_record(getmetatable(t) ~= nil)
setmetatable(t, nil)
host_record(getmetatable(t) == nil)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, true]);
  });

  test("__metatable field hides and protects the real metatable", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = setmetatable({}, { __metatable = "locked" })
host_record(getmetatable(t))
local ok = pcall(function() setmetatable(t, {}) end)
host_record(ok)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["locked", false]);
  });
});

describe("__index metamethod", () => {
  test("table-form __index chains lookup to parent", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local parent = { x = 10, y = 20 }
local child = setmetatable({}, { __index = parent })
host_record(child.x)
host_record(child.y)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10, 20]);
  });

  test("direct child key shadows parent", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local parent = { x = 10 }
local child = setmetatable({}, { __index = parent })
child.x = 99
host_record(child.x)
host_record(parent.x)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([99, 10]);
  });

  test("__index chain across multiple levels", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local gp = { name = "grandparent" }
local p = setmetatable({}, { __index = gp })
local c = setmetatable({}, { __index = p })
host_record(c.name)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["grandparent"]);
  });

  test("function-form __index", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = setmetatable({}, {
  __index = function(tbl, key)
    return "missing:" .. key
  end,
})
host_record(t.foo)
host_record(t.bar)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["missing:foo", "missing:bar"]);
  });
});

describe("__newindex metamethod", () => {
  test("table-form __newindex redirects new keys to target", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local fallback = {}
local t = setmetatable({ existing = 1 }, { __newindex = fallback })
t.existing = 99
t.new = 42
host_record(t.existing)
host_record(rawget(t, "new"))
host_record(fallback.new)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([99, null, 42]);
  });

  test("function-form __newindex receives (t, key, value)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local logged = {}
local t = setmetatable({}, {
  __newindex = function(tbl, key, value)
    rawset(logged, key, value)
  end,
})
t.a = 1
t.b = 2
host_record(rawget(t, "a"))
host_record(logged.a)
host_record(logged.b)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([null, 1, 2]);
  });
});

describe("arithmetic metamethods", () => {
  test("__add fires when one operand is a table", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local mt = { __add = function(a, b) return 99 end }
local v = setmetatable({}, mt)
local w = setmetatable({}, mt)
host_record(v + w)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([99]);
  });

  test("__sub", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local mt = { __sub = function(a, b) return a.n - b.n end }
local x = setmetatable({ n = 10 }, mt)
local y = setmetatable({ n = 3 }, mt)
host_record(x - y)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([7]);
  });

  test("__unm (unary minus)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local mt = { __unm = function(v) return -v.x end }
local p = setmetatable({ x = 5 }, mt)
host_record(-p)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([-5]);
  });
});

describe("comparison metamethods", () => {
  test("__eq fires when both operands are tables with the same metatable", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local mt = { __eq = function(a, b) return a.k == b.k end }
local a = setmetatable({ k = "hi" }, mt)
local b = setmetatable({ k = "hi" }, mt)
local c = setmetatable({ k = "bye" }, mt)
host_record(a == b)
host_record(a == c)
host_record(a ~= c)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, false, true]);
  });

  test("__lt with symmetric > and < dispatch", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local mt = { __lt = function(a, b) return a.n < b.n end }
local one = setmetatable({ n = 1 }, mt)
local two = setmetatable({ n = 2 }, mt)
host_record(one < two)
host_record(two > one)
host_record(two < one)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, true, false]);
  });

  test("__le for less-than-or-equal", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local mt = { __le = function(a, b) return a.n <= b.n end }
local one = setmetatable({ n = 1 }, mt)
local two = setmetatable({ n = 1 }, mt)
host_record(one <= two)
host_record(two <= one)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, true]);
  });
});

describe("__tostring metamethod", () => {
  test("__tostring formats a custom display string", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local mt = { __tostring = function(t) return "Point(" .. t.x .. "," .. t.y .. ")" end }
local p = setmetatable({ x = 1, y = 2 }, mt)
host_record(tostring(p))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["Point(1,2)"]);
  });
});

describe("__call metamethod", () => {
  test("__call dispatches calls on a table value", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local mt = { __call = function(t) return t.value * 2 end }
local f = setmetatable({ value = 21 }, mt)
host_record(f())
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([42]);
  });
});
