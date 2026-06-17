// Regression tests for the final basic.luau batch (lines 765-1018):
//   - Lua's index-type rule: indexing nil / functions raises
//     (trappable), while a missing table member is still nil.
//   - String values keep literal newlines (string evaluation no
//     longer routes whitespace-only text through display trimming);
//     long `[[...]]` strings normalize line endings and drop the
//     newline immediately after the opening bracket.
//   - Variadic nested functions capture upvalues (prepended params +
//     pointer args at call sites), with sibling-subflow precedence
//     over same-named outer locals in the free-variable scan.
//   - Pure number stdlib ops follow Lua argument semantics: numeric
//     strings coerce, missing args raise "missing argument #1",
//     wrong types raise "invalid argument #1" — all pcall-trappable.
//   - type/typeof require an argument; newproxy values report
//     "userdata" (not spoofable via a `__type` metatable field).
//   - getfenv() returns the environment; assigning
//     `getfenv().math = {...}` overrides statically-lowered math.*
//     call sites.
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

describe("Lua index-type errors", () => {
  test("indexing nil raises and pcall traps it; missing member is nil", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(pcall(function() return idontexist.a end) == false)
host_record(pcall(function() local t = nil return t.a end) == false)
host_record(pcall(function() return math.pow.a end) == false)
host_record(pcall(function() return math.a.b end) == false)
host_record(tostring(math.idontexist))
local t = { data = 4 }
t.data = nil
host_record(tostring(t.data))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, true, true, true, "nil", "nil"]);
  });
});

describe("string newline fidelity", () => {
  test("newline-only strings round-trip through values", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a = "\\n"
host_record(#a)
host_record("x" .. a .. "y")
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, "x\ny"]);
  });

  test("long strings drop the first newline and keep the rest", () => {
    const { errors, recorded } = compileAndCapture(
      [
        "external host_record(v)",
        "& run()",
        "done",
        "",
        "function run()",
        "local s1 = [[",
        "]]",
        "local s2 = [[",
        "",
        "]]",
        "local s3 = [[",
        "foo",
        "bar]]",
        "host_record(#s1)",
        "host_record(#s2)",
        "host_record(s3)",
        "end",
        "",
      ].join("\r\n"),
    );
    expect(errors).toEqual([]);
    expect(recorded).toEqual([0, 1, "foo\nbar"]);
  });
});

describe("variadic nested functions capture upvalues", () => {
  test("stdlib value held in a local reaches the variadic body", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record((function() local abs = math.abs function foo(...) return abs(...) end return foo(-5) end)())
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([5]);
  });

  test("sibling subflow wins over a same-named outer local", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local function foo(a, b) return b end
host_record((function() function foo(...) return ... end function bar(...) return foo(...) end return bar(7) end)())
host_record(foo(1, 2))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([7, 2]);
  });
});

describe("pure number stdlib argument semantics", () => {
  test("numeric strings coerce; missing/invalid args raise Lua messages", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(math.abs('-5'))
local ok1, e1 = pcall(function() return math.abs() end)
host_record(ok1)
host_record(string.find(e1, "missing argument #1 to 'abs'") ~= nil)
local ok2, e2 = pcall(function() return math.abs(nil) end)
host_record(ok2)
host_record(string.find(e2, "invalid argument #1 to 'abs'") ~= nil)
local ok3, e3 = pcall(function() return math.abs({}) end)
host_record(ok3)
host_record(string.find(e3, "invalid argument #1 to 'abs'") ~= nil)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([5, false, true, false, true, false, true]);
  });
});

describe("type/typeof/newproxy", () => {
  test("type and typeof require an argument", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function nothing() end

function run()
host_record(pcall(typeof) == false)
host_record(pcall(type) == false)
host_record(pcall(function() return typeof(nothing()) end) == false)
host_record(pcall(function() return type(nothing()) end) == false)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, true, true, true]);
  });

  test("newproxy reports userdata; __type cannot spoof it", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(typeof(newproxy()))
local ud = newproxy(true)
getmetatable(ud).__type = "number"
host_record(type(ud))
host_record(typeof(ud))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["userdata", "userdata", "userdata"]);
  });
});

describe("getfenv environment override", () => {
  test("assigning getfenv().math redirects static math.* call sites", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local negfive = -5
host_record(math.abs(negfive))
getfenv().math = { abs = function(n) return n * n end }
host_record(math.abs(negfive))
host_record((function() local abs = math.abs return abs(negfive) end)())
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([5, 25, 25]);
  });
});
