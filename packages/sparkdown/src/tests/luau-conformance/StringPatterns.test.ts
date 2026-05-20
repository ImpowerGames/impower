// Phase 1 of Lua-pattern support: `string.find` and `string.match`.
// Patterns are translated to JS regex via `luaPatternToJs` in
// `inkjs/engine/LuaPatterns.ts`. Phase 1 omits `%b{}` balanced
// match, `%f[]` frontier, and `()` position captures — those
// throw a runtime story.Error pointing at the unsupported feature.

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

describe("string.find — plain substring (no patterns)", () => {
  test("finds a literal substring and returns 1-indexed [start, end]", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s, e = string.find("hello world", "world", 1, true)
host_record(s)
host_record(e)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([7, 11]);
  });

  test("plain mode treats pattern chars literally", () => {
    // Without plain=true, `.+` would be a pattern; with it, we want
    // the literal three chars `.`, `+`, `?`.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s, e = string.find("a.+? then", ".+?", 1, true)
host_record(s)
host_record(e)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([2, 4]);
  });

  test("returns nil when no match", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.find("abc", "xyz", 1, true)
if s == nil then
host_record("nil")
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["nil"]);
  });
});

describe("string.find — character classes", () => {
  test("%d+ matches a digit run", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s, e = string.find("abc 12345 def", "%d+")
host_record(s)
host_record(e)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([5, 9]);
  });

  test("%a+ matches a letter run", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s, e = string.find("123 abc 456", "%a+")
host_record(s)
host_record(e)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([5, 7]);
  });

  test("anchored ^%a+ requires letter at start", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(string.find("123abc", "^%a+") == nil)
local s, e = string.find("abc123", "^%a+")
host_record(s)
host_record(e)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, 1, 3]);
  });

  test("$ anchor matches at end only", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s, e = string.find("file.txt", "%.txt$")
host_record(s)
host_record(e)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([5, 8]);
  });
});

describe("string.find — captures", () => {
  test("single capture returned after [start, end]", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s, e, name = string.find("hello world", "(%a+) world")
host_record(s)
host_record(e)
host_record(name)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 11, "hello"]);
  });

  test("multiple captures returned in order", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s, e, year, month, day = string.find("date: 2026-05-20!", "(%d+)-(%d+)-(%d+)")
host_record(year)
host_record(month)
host_record(day)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["2026", "05", "20"]);
  });
});

describe("string.find — init / negative init", () => {
  test("init skips past earlier matches", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s, e = string.find("aaa aaa aaa", "%a+", 5)
host_record(s)
host_record(e)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([5, 7]);
  });

  test("negative init counts from end", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s, e = string.find("aaa aaa aaa", "%a+", -3)
host_record(s)
host_record(e)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([9, 11]);
  });
});

describe("string.match", () => {
  test("returns the whole match when there are no captures", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(string.match("hello 42 world", "%d+"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["42"]);
  });

  test("returns captures when present", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local year, month, day = string.match("2026-05-20", "(%d+)-(%d+)-(%d+)")
host_record(year)
host_record(month)
host_record(day)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["2026", "05", "20"]);
  });

  test("returns nil on no match", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(string.match("hello", "%d+") == nil)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true]);
  });
});

describe("string patterns — quantifier behaviour", () => {
  test("lazy `-` matches minimally", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(string.match("<a><b>", "<(.-)>"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["a"]);
  });

  test("greedy `*` matches maximally", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(string.match("<a><b>", "<(.*)>"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["a><b"]);
  });

  test("? optional quantifier", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(string.match("color", "colou?r"))
host_record(string.match("colour", "colou?r"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["color", "colour"]);
  });
});

describe("string patterns — unsupported features error cleanly", () => {
  test("%b balanced match errors with a hint", () => {
    const { errors } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.find("(hello)", "%b()")
end
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!).toContain("%b");
  });

  test("position capture () errors with a hint", () => {
    const { errors } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local s = string.find("hello", "()hello")
end
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!).toContain("Position capture");
  });
});
