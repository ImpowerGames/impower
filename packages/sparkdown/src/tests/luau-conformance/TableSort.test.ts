// `table.sort` — exercises the stdlib→Luau callback dispatch
// (#96) by running a user comparator function inside the JS-side
// sort. Both the default `<` comparator and a user-supplied one
// are tested here, alongside the frozen-table refuse path.

import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

function compileAndCapture(source: string): {
  errors: string[];
  recorded: unknown[];
} {
  const compiler = testCompiler();
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
  const story = testStory(result.program.compiled as Record<string, any>);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("table.sort — default comparator", () => {
  test("sorts an array of numbers ascending", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 3, 1, 4, 1, 5, 9, 2, 6 }
table.sort(t)
for i = 1, 8 do
host_record(t[i])
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
  });

  test("sorts an array of strings lexicographically", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { "banana", "apple", "cherry" }
table.sort(t)
for i = 1, 3 do
host_record(t[i])
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["apple", "banana", "cherry"]);
  });

  test("preserves ties (stable sort)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 3, 1, 2, 3, 1, 2 }
table.sort(t)
for i = 1, 6 do
host_record(t[i])
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("table.sort — user comparator", () => {
  test("descending sort via custom comparator", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 1, 4, 2, 3 }
table.sort(t, function(a, b) return a > b end)
for i = 1, 4 do
host_record(t[i])
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([4, 3, 2, 1]);
  });

  test("comparator can be a bare-named function", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function desc(a, b)
return a > b
end

function run()
local t = { 5, 2, 8, 1 }
table.sort(t, desc)
for i = 1, 4 do
host_record(t[i])
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([8, 5, 2, 1]);
  });

  test("comparator with closure capture", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local pivot = 5
local t = { 1, 7, 3, 9, 2 }
table.sort(t, function(a, b)
local ad = math.abs(a - pivot)
local bd = math.abs(b - pivot)
return ad < bd
end)
for i = 1, 5 do
host_record(t[i])
end
end
`);
    expect(errors).toEqual([]);
    // Distances from 5: 1→4, 7→2, 3→2, 9→4, 2→3. Sorted ascending
    // by distance: [3,2 → tied at 2], [2 → 3], [1,9 → tied at 4].
    // Stable sort preserves source order within ties.
    expect(recorded).toEqual([7, 3, 2, 1, 9]);
  });
});

describe("table.sort — error paths", () => {
  test("refuses a frozen table", () => {
    const { errors } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 3, 1, 2 }
table.freeze(t)
table.sort(t)
end
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!).toContain("readonly");
  });

  test("default comparator errors on mismatched types", () => {
    const { errors } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 1, "two", 3 }
table.sort(t)
end
`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!).toContain("compare");
  });
});
