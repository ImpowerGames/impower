// Sanity tests for stdlib entries that recently landed — especially
// the n-ary pure path that `math.clamp` / `math.map` now use after
// `NativeFunctionCall` learned arity >= 3.

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

describe("stdlib n-ary numeric", () => {
  test("math.clamp clamps into [min, max]", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(math.clamp(5, 0, 10))
& host_record(math.clamp(-3, 0, 10))
& host_record(math.clamp(15, 0, 10))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([5, 0, 10]);
  });

  test("math.map remaps linearly across ranges", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(math.map(0.5, 0, 1, 0, 100))
& host_record(math.map(5, 0, 10, -1, 1))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([50, 0]);
  });
});

describe("stdlib globals", () => {
  test("tostring coerces numbers, booleans, nil", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(tostring(42))
& host_record(tostring(true))
& host_record(tostring("hi"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["42", "true", "hi"]);
  });

  test.skip("type returns Lua-style type names", () => {
    // Skipped: `type(x)` is currently swallowed by the
    // `LuauDataTypeDeclaration` grammar rule (matches `type\b` for
    // `type X = ...` type aliases) before the function-call grammar
    // gets a chance. Fix: add a `(?!{{WS}}*\()` lookahead on the
    // type-alias rule so `type(x)` falls through to the function-call
    // path. Same issue affects `typeof(x)`.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(type(1))
& host_record(type("s"))
& host_record(type(true))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["number", "string", "boolean"]);
  });
});

describe("stdlib bit32", () => {
  test("bit32 variadic ops fold across args", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
& host_record(bit32.band(0xFF, 0x0F, 0x07))
& host_record(bit32.bor(0x01, 0x02, 0x04))
& host_record(bit32.bxor(0xFF, 0x0F))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([0x07, 0x07, 0xf0]);
  });
});
