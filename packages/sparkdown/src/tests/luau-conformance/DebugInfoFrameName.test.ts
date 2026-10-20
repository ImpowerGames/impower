import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromSource,
  runToEnd,
} from "../runtime/runtimeTestHarness";

// I-778: `debug.info(level, "n")` and `debug.traceback()` name the function a
// frame runs, wherever the call stands in the function's body, as Luau does.
// The object engine named the block's container instead (`$b`,
// `outer.0.$b`).

function run(source: string) {
  const { story, errorMessages } = makeRuntimeStoryFromSource(source);
  const output = runToEnd(story);
  return { output, errorMessages };
}

describe("debug.info and debug.traceback name the frame's function", () => {
  test("control: a call at a function's top level names the function", () => {
    const r = run(`store s = ""
s = outer()
T {s}.
done
function outer()
  return debug.info(1, "n")
end
`);
    expect(r.errorMessages).toEqual([]);
    expect(r.output).toBe("T outer.\n");
  });

  test('debug.info(1, "n") inside an if block names the function', () => {
    const r = run(`store s = ""
s = outer()
T {s}.
done
function outer()
  if true then
    return debug.info(1, "n")
  end
  return ""
end
`);
    expect(r.errorMessages).toEqual([]);
    expect(r.output).toBe("T outer.\n");
  });

  test("debug.traceback() inside an if block names the function, not the block", () => {
    const r = run(`store s = ""
s = outer()
T {s}
done
function outer()
  if true then
    return debug.traceback()
  end
  return ""
end
`);
    expect(r.errorMessages).toEqual([]);
    expect(r.output).toContain("[TUNNEL] <SOMEWHERE IN 0>");
    expect(r.output).toContain("[FUNCTION] <SOMEWHERE IN outer>");
    expect(r.output).not.toContain("$b");
  });

  test('debug.info(1, "n") inside a for body names the function', () => {
    const r = run(`store s = ""
s = loop()
T {s}.
done
function loop()
  for i = 1, 1 do
    return debug.info(1, "n")
  end
  return ""
end
`);
    expect(r.errorMessages).toEqual([]);
    expect(r.output).toBe("T loop.\n");
  });

  test("debug.traceback() inside a for body names the function", () => {
    const r = run(`store s = ""
s = outer()
T {s}
done
function outer()
  for i = 1, 1 do
    return debug.traceback()
  end
  return ""
end
`);
    expect(r.errorMessages).toEqual([]);
    expect(r.output).toContain("[FUNCTION] <SOMEWHERE IN outer>");
    expect(r.output).not.toContain("$b");
    expect(r.output).not.toContain("__synth");
  });

  test('debug.info(2, "n") names a caller stopped inside an if block', () => {
    const r = run(`store s = ""
s = outer()
T {s}.
done
function inner()
  return debug.info(2, "n")
end
function outer()
  if true then
    return inner()
  end
  return ""
end
`);
    expect(r.errorMessages).toEqual([]);
    expect(r.output).toBe("T outer.\n");
  });

  test("a call inside an if block of a closure names the closure, not the block", () => {
    const r = run(`store s = ""
store t = ""
s, t = outer()
T {s}|{t}.
done
function outer()
  local f = function()
    if true then
      return debug.info(1, "n"), debug.traceback()
    end
    return "", ""
  end
  local a, b = f()
  return a, b
end
`);
    expect(r.errorMessages).toEqual([]);
    expect(r.output).toMatch(/^T <anonymous>\|stack traceback:/);
    expect(r.output).toContain("[FUNCTION] <SOMEWHERE IN outer>\n");
    expect(r.output).toContain("[FUNCTION] <SOMEWHERE IN outer.<anonymous>>");
    expect(r.output).not.toContain("$b");
  });
});
