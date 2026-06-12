// Batch unlocked by CallLuauFunction + __builtin_iter dispatch:
// - table.foreach / foreachi (both deprecated in Luau — flagged via
//   the existing strikethrough diagnostic).
// - utf8.codes (iterator returning byte_position + codepoint).

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

describe("table.foreach", () => {
  test("calls fn(k, v) for every entry in insertion order", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { a = 1, b = 2, c = 3 }
table.foreach(t, function(k, v)
host_record(k)
host_record(v)
end)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["a", 1, "b", 2, "c", 3]);
  });

  test("non-nil return breaks the loop and is returned", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 1, 2, 3, 4, 5 }
local found = table.foreach(t, function(k, v)
if v == 3 then return v end
end)
host_record(found)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3]);
  });
});

describe("table.foreachi", () => {
  test("walks the array portion only, calls fn(i, v)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { "a", "b", "c", name = "ignored" }
table.foreachi(t, function(i, v)
host_record(i)
host_record(v)
end)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, "a", 2, "b", 3, "c"]);
  });

  test("stops at first gap in the array portion", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = {}
t[1] = "a"
t[2] = "b"
-- gap: t[3] missing
t[4] = "d"
table.foreachi(t, function(i, v) host_record(v) end)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["a", "b"]);
  });
});

describe("utf8.codes", () => {
  test("yields (byte_position, codepoint) for ASCII", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for p, c in utf8.codes("abc") do
host_record(p)
host_record(c)
end
end
`);
    expect(errors).toEqual([]);
    // ASCII: each codepoint is 1 byte, positions 1, 2, 3. Codepoints
    // 97 ('a'), 98 ('b'), 99 ('c').
    expect(recorded).toEqual([1, 97, 2, 98, 3, 99]);
  });

  test("byte positions account for multi-byte UTF-8", () => {
    // 'é' (U+00E9) spelled as its UTF-8 bytes \xC3\xA9 — under the
    // byte-string convention a bare "é" char IS the raw byte E9
    // (invalid UTF-8). 'B' is 1 byte; '€' (U+20AC, > 0xFF) encodes
    // automatically.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for p, c in utf8.codes("\\xC3\\xA9B€") do
host_record(p)
host_record(c)
end
end
`);
    expect(errors).toEqual([]);
    // Positions: 1 ('é'), 3 ('B'), 4 ('€'). Codepoints: 233, 66, 8364.
    expect(recorded).toEqual([1, 233, 3, 66, 4, 8364]);
  });

  test("empty string yields nothing", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for p, c in utf8.codes("") do
host_record(p)
end
host_record("done")
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["done"]);
  });
});
