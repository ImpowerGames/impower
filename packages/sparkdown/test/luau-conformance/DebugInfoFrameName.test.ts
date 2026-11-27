import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromSource,
  runToEnd,
} from "../runtime/runtimeTestHarness";

function run(source: string) {
  const { story, errorMessages } = makeRuntimeStoryFromSource(source);
  const output = runToEnd(story);
  return { output, errorMessages };
}

describe("debug.info and debug.traceback name the frame's function", () => {
  test("control: a call at a function's top level names the function", () => {
    const r = run(`store s = ""
scene start
  s = outer()
  T {s}.
  done
end
function outer()
  return debug.info(1, "n")
end
`);
    expect(r.errorMessages).toEqual([]);
    expect(r.output).toBe("T outer.\n");
  });

  test('debug.info(1, "n") inside an if block names the function', () => {
    const r = run(`store s = ""
scene start
  s = outer()
  T {s}.
  done
end
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
scene start
  s = outer()
  T {s}
  done
end
function outer()
  if true then
    return debug.traceback()
  end
  return ""
end
`);
    expect(r.errorMessages).toEqual([]);
    expect(r.output).toContain("[TUNNEL] <SOMEWHERE IN start>");
    expect(r.output).toContain("[FUNCTION] <SOMEWHERE IN outer>");
    expect(r.output).not.toContain("$b");
  });

  test('debug.info(1, "n") inside a for body names the function', () => {
    const r = run(`store s = ""
scene start
  s = loop()
  T {s}.
  done
end
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
scene start
  s = outer()
  T {s}
  done
end
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
scene start
  s = outer()
  T {s}.
  done
end
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
scene start
  s, t = outer()
  T {s}|{t}.
  done
end
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
