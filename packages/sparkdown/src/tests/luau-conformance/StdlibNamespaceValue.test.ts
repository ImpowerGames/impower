// A standard-library namespace read as a value is a read-only table, as in
// Luau: `type(math)` is "table", its members are the builtin functions and
// the library's constants, `pairs` lists them, and a write to one of them
// raises `attempt to modify a readonly table`. Sparkdown's own `count`
// namespace reads the same way (I-1441).

import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, storyBeats } from "../program/programHarness";

const quiet = <T>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

const run = (lines: string[]) =>
  quiet(() => {
    const { program } = compileScript([...lines, ""].join("\n"));
    expect(errorsOf(program)).toEqual([]);
    const { beats, errors } = storyBeats(new ProgramStory(program.chunks!));
    return { texts: beats.map((b) => b.text.trim()), errors };
  });

const got = (...texts: string[]) => ({ texts, errors: [] });

describe("a stdlib namespace read as a value", () => {
  test("is a table", () => {
    expect(
      run([
        "Got {type(table)} {type(math)} {type(string)} {type(print)} {type(math.abs)} {type(count)}.",
      ]),
    ).toEqual(got("Got table table table function function table."));
  });

  test("is a table in a function body and in a closure", () => {
    expect(
      run([
        "function f()",
        "  local g = function() return type(string) end",
        "  return type(math) .. ' ' .. g()",
        "end",
        "Got {f()}.",
      ]),
    ).toEqual(got("Got table table."));
  });

  test("is the same table on every read", () => {
    expect(
      run([
        "local a = math",
        "Got {rawequal(a, math)} {math == math} {math.abs == math.abs} {rawequal(table, math)}.",
      ]),
    ).toEqual(got("Got true true true false."));
  });

  test("holds the builtin functions and the library's constants", () => {
    expect(
      run([
        "local m = math",
        "local s = string",
        // `s['upper']`, as a dot call of a field named like a builtin
        // method still dispatches the method (I-1483).
        "Got {m.abs(-3)} {m.floor(2.5)} {m.pi == math.pi} {m.huge == math.huge} {s['upper']('a')} {m.nope}.",
      ]),
    ).toEqual(got("Got 3 2 true true A nil."));
  });

  test("reads a member by key", () => {
    expect(
      run([
        "local k = 'abs'",
        "Got {math[k](-4)} {type(math['max'])} {type(string['format'])}.",
      ]),
    ).toEqual(got("Got 4 function function."));
  });

  test("is the global `_G` holds", () => {
    expect(
      run([
        "local k = 'string'",
        "Got {_G.math == math} {_G[k] == string} {rawget(_G, 'table') == table} {_G.math.abs(-2)} {getfenv().math == math}.",
      ]),
    ).toEqual(got("Got true true true 2 true."));
  });

  test("gives way to a global that replaces it", () => {
    expect(
      run([
        "math = { abs = function(v) return 'mine' end }",
        "local m = math",
        "Got {math.abs(-3)} {_G.math == m} {m.abs(-3)} {type(m.floor)}.",
      ]),
    ).toEqual(got("Got mine true mine nil."));
  });

  test("lists its members through pairs", () => {
    expect(
      run([
        "local seen = {}",
        "for k, v in pairs(math) do seen[k] = type(v) end",
        "Got {seen.abs} {seen.sqrt} {seen.pi} {seen.huge}.",
      ]),
    ).toEqual(got("Got function function number number."));
  });

  test("is read-only", () => {
    const { errors } = run([
      "math.abs = function(a, b) return tostring(a) .. '/' .. tostring(b) end",
      "Got {math.abs(1, 2)}.",
    ]);
    expect(errors.join("\n")).toContain("attempt to modify a readonly table");
  });

  test("raises the read-only error through pcall", () => {
    expect(
      run([
        "local t = table",
        "local ok, err = pcall(function() t.insert = 1 end)",
        "Got {ok} {string.find(tostring(err), 'attempt to modify a readonly table', 1, true) ~= nil} {table.isfrozen(math)}.",
      ]),
    ).toEqual(got("Got false true true."));
  });

  test("lists count's functions", () => {
    expect(
      run(["Got {type(count.turns)} {count.turns == count.turns}."]),
    ).toEqual(got("Got function true."));
  });

  test("is hidden by a local of its name", () => {
    expect(
      run([
        "local math = { abs = function(v) return 77 end }",
        "Got {type(math)} {math.abs(-3)}.",
      ]),
    ).toEqual(got("Got table 77."));
  });

  test("is hidden by a parameter of its name, and a closure captures that", () => {
    expect(
      run([
        "function f(math)",
        "  local g = function() return type(math) end",
        "  return type(math) .. ' ' .. g()",
        "end",
        "function h()",
        "  local string = 7",
        "  return (function() return type(string) end)()",
        "end",
        "Got {f(5)} {h()} {type(math)}.",
      ]),
    ).toEqual(got("Got number number number table."));
  });

  test("loads from a save as the library table", () => {
    const script = [
      "store lib = nil",
      "",
      "-> start",
      "",
      "scene start",
      "  & lib = math",
      "  local s = string",
      "  Saved {type(lib)}.",
      "  Then {lib == math} {lib.abs(-5)} {table.isfrozen(lib)} {s == string} {s['upper']('b')}.",
      "end",
      "",
    ].join("\n");
    const engine = () =>
      quiet(() => {
        const { program } = compileScript(script);
        expect(errorsOf(program)).toEqual([]);
        const story = new ProgramStory(program.chunks!);
        story.keepBeatImages = true;
        story.onError = (message: string) => {
          throw new Error(message);
        };
        return story;
      });
    const nextBeat = (story: ProgramStory) =>
      quiet(() => {
        while (story.canContinue) {
          story.Continue();
          const text = story.currentText?.trim();
          if (text) return text;
        }
        return "";
      });
    const story = engine();
    expect(nextBeat(story)).toBe("Saved table.");
    const save = story.toSave();
    expect(save).toContain('"^lib":"math"');
    const loaded = engine();
    quiet(() => loaded.loadSave(save));
    expect(nextBeat(loaded)).toBe("Then true 5 true true B.");
  });

  test("reports no unresolved name", () => {
    const { program } = quiet(() =>
      compileScript(["local m = math", "Got {type(m)} {type(count)}.", ""].join("\n")),
    );
    const messages = Object.values(program.diagnostics ?? {})
      .flat()
      .map((d) => (typeof d.message === "string" ? d.message : d.message.value));
    expect(messages.filter((m) => m.includes("Cannot find"))).toEqual([]);
  });
});
