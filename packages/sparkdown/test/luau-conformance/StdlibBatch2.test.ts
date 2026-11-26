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
  if (!result.program.chunks) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = testStory(result.program.chunks);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("math.noise", () => {
  test("deterministic — same input gives same output", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
scene start
  & run()
  done
end

function run()
host_record(math.noise(0.5))
host_record(math.noise(0.5))
host_record(math.noise(0.5, 0.25))
host_record(math.noise(0.5, 0.25))
end
`);
    expect(errors).toEqual([]);
    expect(recorded.length).toBe(4);
    expect(recorded[0]).toBe(recorded[1]);
    expect(recorded[2]).toBe(recorded[3]);
  });

  test("integer inputs return 0 at the lattice corners", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
scene start
  & run()
  done
end

function run()
host_record(math.noise(0, 0, 0))
host_record(math.noise(1, 0, 0))
host_record(math.noise(0, 1, 0))
host_record(math.noise(1, 1, 1))
end
`);
    expect(errors).toEqual([]);
    for (const v of recorded) {
      expect(typeof v === "number" && Math.abs(v as number) < 1e-10).toBe(true);
    }
  });

  test("output stays within ~[-1, 1]", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
scene start
  & run()
  done
end

function run()
host_record(math.noise(0.1, 0.2, 0.3))
host_record(math.noise(10.5, 20.5, 30.5))
host_record(math.noise(-5.5, -10.5, 7.7))
host_record(math.noise(100.25))
end
`);
    expect(errors).toEqual([]);
    for (const v of recorded) {
      expect(typeof v).toBe("number");
      const n = v as number;
      expect(n).toBeGreaterThanOrEqual(-1.1);
      expect(n).toBeLessThanOrEqual(1.1);
    }
  });
});

describe("debug.traceback", () => {
  test("returns a string containing 'stack traceback:'", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
scene start
  & run()
  done
end

function run()
local t = debug.traceback()
host_record(string.contains(t, "stack traceback"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true]);
  });

  test("prepends the optional message", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
scene start
  & run()
  done
end

function run()
local t = debug.traceback("oh no")
host_record(string.startswith(t, "oh no"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true]);
  });
});

describe("debug.info", () => {
  test("level 1 returns the current frame's path with `s` option", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
scene start
  & run()
  done
end

function run()
local src = debug.info(1, "s")
host_record(type(src))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["string"]);
  });

  test("multi-letter opts return multi-value", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
scene start
  & run()
  done
end

function run()
local s, l = debug.info(1, "sl")
host_record(type(s))
host_record(l)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["string", -1]);
  });

  test("out-of-range level returns nil", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
scene start
  & run()
  done
end

function run()
local v = debug.info(999, "s")
host_record(v == nil)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true]);
  });
});
