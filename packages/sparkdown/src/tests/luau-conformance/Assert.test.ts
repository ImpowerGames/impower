import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

function compileAndRun(source: string) {
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
  if (!result.program.chunks) {
    return { result, errors: ["NO_COMPILED"] };
  }
  const story = testStory(result.program.chunks);
  const errors: string[] = [];
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { result, errors };
}

describe("native assert(cond [, message])", () => {
  test("truthy condition: no error", () => {
    const { errors } = compileAndRun(`& run()
done

function run()
assert(true)
assert(1)
assert("hello")
end
`);
    expect(errors).toEqual([]);
  });

  test("falsy condition (false): default message", () => {
    const { errors } = compileAndRun(`& run()
done

function run()
assert(false)
end
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("assertion failed");
  });

  test("falsy condition with custom message", () => {
    const { errors } = compileAndRun(`& run()
done

function run()
assert(false, "custom failure")
end
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("custom failure");
  });

  test("returns its arguments; zero args raises missing-argument", () => {
    const { errors } = compileAndRun(`& run()
done

function run()
assert(assert(1) == 1)
assert(type(assert({})) == 'table')
assert(select('#', assert(1, 2, 3)) == 3)
assert(table.concat(table.pack(assert(1, 2, 3)), "") == "123")
local ok, err = pcall(function() assert() end)
assert(not ok)
assert(err:find("missing argument #1") ~= nil)
local ok2, err2 = pcall(function() assert(nil) end)
assert(not ok2)
assert(err2:find("assertion failed!", 1, true) ~= nil)
end
`);
    expect(errors).toEqual([]);
  });

  test("assert(0) and assert('') pass under Lua truthiness", () => {
    const { errors } = compileAndRun(`& run()
done

function run()
assert(0)
assert("")
end
`);
    expect(errors).toEqual([]);
  });
});
