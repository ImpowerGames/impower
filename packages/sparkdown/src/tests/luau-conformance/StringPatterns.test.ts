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

describe("string.gmatch — iterator over matches", () => {
  test("yields each whole match in turn (no captures)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for w in string.gmatch("hello world from sparkdown", "%a+") do
host_record(w)
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["hello", "world", "from", "sparkdown"]);
  });

  test("yields N captures as N loop variables", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for k, v in string.gmatch("from=here, to=there, who=we", "(%a+)=(%a+)") do
host_record(k)
host_record(v)
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([
      "from",
      "here",
      "to",
      "there",
      "who",
      "we",
    ]);
  });

  test("zero matches — body never runs", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for w in string.gmatch("no digits here", "%d+") do
host_record(w)
end
host_record("done")
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["done"]);
  });

  test("break exits the loop on a sentinel value", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for w in string.gmatch("a b STOP d e", "%a+") do
if w == "STOP" then
break
end
host_record(w)
end
host_record("done")
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["a", "b", "done"]);
  });

  test("invalid pattern errors at the gmatch call site", () => {
    // `%b` without delimiters is malformed.
    const { errors } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for w in string.gmatch("hello", "%b") do
host_record(w)
end
end
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!).toContain("%b");
  });
});

describe("string.gsub — string replacement", () => {
  test("replaces every match with the template", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local result, count = string.gsub("hello world", "o", "0")
host_record(result)
host_record(count)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["hell0 w0rld", 2]);
  });

  test("`%0` references the whole match", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local result = string.gsub("abc", "%a", "[%0]")
host_record(result)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["[a][b][c]"]);
  });

  test("`%1` and `%2` reference captures", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local result = string.gsub("year=2026, month=05", "(%a+)=(%d+)", "%2 %1")
host_record(result)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["2026 year, 05 month"]);
  });

  test("`%%` produces a literal percent", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local result = string.gsub("abc", "b", "%%%%")
host_record(result)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["a%%c"]);
  });

  test("max-replacement count `n` caps substitutions", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local result, count = string.gsub("aaaaaa", "a", "X", 3)
host_record(result)
host_record(count)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["XXXaaa", 3]);
  });

  test("no matches — returns input unchanged, count 0", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local result, count = string.gsub("hello", "%d+", "X")
host_record(result)
host_record(count)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["hello", 0]);
  });
});

describe("string.gsub — table replacement", () => {
  test("looks up replacements in the table by capture", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local replacements = { name = "Anonymous", who = "stranger" }
local result = string.gsub("hi $name and $who!", "%$(%a+)", replacements)
host_record(result)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["hi Anonymous and stranger!"]);
  });

  test("missing keys keep the original match", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local replacements = { x = "ONE" }
local result, count = string.gsub("$x $y $x", "%$(%a+)", replacements)
host_record(result)
host_record(count)
end
`);
    expect(errors).toEqual([]);
    // Both `$x` matches replace; `$y` keeps the original literal.
    // Count is total matches attempted, including kept-original ones.
    expect(recorded).toEqual(["ONE $y ONE", 3]);
  });

  test("numeric values stringify into the result", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local counts = { apples = 3, oranges = 7 }
local result = string.gsub("apples=?, oranges=?", "(%a+)=%?", counts)
host_record(result)
end
`);
    expect(errors).toEqual([]);
    // First capture is "apples" / "oranges" so the lookup keys match.
    expect(recorded).toEqual(["3, 7"]);
  });
});

describe("string.gsub — function replacement", () => {
  test("replaces each match using the function's return value", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local result = string.gsub("hello", "%a", function(c) return c .. c end)
host_record(result)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["hheelllloo"]);
  });

  test("captures are passed as separate args", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local result = string.gsub("k=v", "(%a+)=(%a+)", function(k, v) return v .. "=" .. k end)
host_record(result)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["v=k"]);
  });

  test("returning nil keeps the original match", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local result, count = string.gsub("abc", "%a", function(c)
if c == "b" then return nil end
return c .. c
end)
host_record(result)
host_record(count)
end
`);
    expect(errors).toEqual([]);
    // 'a' doubled, 'b' kept, 'c' doubled. count counts all matches (3).
    expect(recorded).toEqual(["aabcc", 3]);
  });

  test("function-form returning a number stringifies", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local result = string.gsub("ab", "%a", function(c) return 42 end)
host_record(result)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["4242"]);
  });
});

describe("string.gsub — error paths", () => {
  test("invalid capture-index escape in replacement", () => {
    const { errors } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local r = string.gsub("hello", "(%a)", "%2")
end
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!).toContain("invalid capture index");
  });
});

describe("string patterns — %b balanced match", () => {
  test("`%b()` matches a balanced parenthesis group", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local result = string.match("before (a (b c) d) after", "%b()")
host_record(result)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["(a (b c) d)"]);
  });

  test("`%b()` returns nil when unbalanced", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(string.match("(unbalanced", "%b()") == nil)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true]);
  });

  test("`%b{}` matches braced blocks too", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local result = string.match("{x {y} z}", "%b{}")
host_record(result)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["{x {y} z}"]);
  });
});

describe("string patterns — () position capture", () => {
  test("`()` yields the 1-indexed position", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local pos = string.match("hello world", "()")
host_record(pos)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1]);
  });

  test("mixed string + position captures in order", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local word, pos, next_word = string.match("hello world", "(%a+)() (%a+)")
host_record(word)
host_record(pos)
host_record(next_word)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["hello", 6, "world"]);
  });
});
