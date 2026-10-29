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

describe("a method of a define written in a function", () => {
  test("reads a local of a function further out", () => {
    expect(
      run([
        "function outer(v)",
        "  local a = v",
        "  function inner()",
        "    define thing with",
        "      function get()",
        "        return a",
        "      end",
        "    end",
        "    return thing.get()",
        "  end",
        "  return inner()",
        "end",
        "Got {outer(7)}.",
      ]),
    ).toEqual(got("Got 7."));
  });

  test("reads a scene's local the function does not read itself", () => {
    expect(
      run([
        "-> S",
        "scene S",
        "  local b = 5",
        "  local function outer()",
        "    define thing with",
        "      function get()",
        "        return b",
        "      end",
        "    end",
        "    return thing.get()",
        "  end",
        "  Got {outer()}.",
        "end",
      ]),
    ).toEqual(got("Got 5."));
  });

  test("writes a local of a function further out", () => {
    expect(
      run([
        "function outer()",
        "  local a = 1",
        "  local function inner()",
        "    define thing with",
        "      function set()",
        "        a = 9",
        "      end",
        "    end",
        "    thing.set()",
        "  end",
        "  inner()",
        "  return a",
        "end",
        "Got {outer()}.",
      ]),
    ).toEqual(got("Got 9."));
  });

  test("reads a local of a function further out through a function value", () => {
    expect(
      run([
        "function outer(v)",
        "  local a = v",
        "  local inner = function()",
        "    define thing with",
        "      function get()",
        "        return a",
        "      end",
        "    end",
        "    return thing.get()",
        "  end",
        "  return inner()",
        "end",
        "Got {outer(7)}.",
      ]),
    ).toEqual(got("Got 7."));
  });

  test("reads a local of a function further out from a define in another define's method", () => {
    expect(
      run([
        "function outer(v)",
        "  local a = v",
        "  function inner()",
        "    define thing with",
        "      function get()",
        "        define other with",
        "          function get()",
        "            return a",
        "          end",
        "        end",
        "        return other.get()",
        "      end",
        "    end",
        "    return thing.get()",
        "  end",
        "  return inner()",
        "end",
        "Got {outer(7)}.",
      ]),
    ).toEqual(got("Got 7."));
  });

  test("reads the local of the function between that hides the one further out", () => {
    expect(
      run([
        "function outer(v)",
        "  local a = v",
        "  function inner()",
        "    local a = 3",
        "    define thing with",
        "      function get()",
        "        return a",
        "      end",
        "    end",
        "    return thing.get()",
        "  end",
        "  return inner() + a",
        "end",
        "Got {outer(7)}.",
      ]),
    ).toEqual(got("Got 10."));
  });

  test("reads a local further out past an ended block's local of its name", () => {
    expect(
      run([
        "function outer(v)",
        "  local a = v",
        "  function inner()",
        "    do",
        "      local a = 3",
        "    end",
        "    define thing with",
        "      function get()",
        "        return a",
        "      end",
        "    end",
        "    return thing.get()",
        "  end",
        "  return inner()",
        "end",
        "Got {outer(7)}.",
      ]),
    ).toEqual(got("Got 7."));
  });

  test("reads a local of a function further out from a define that ends a body", () => {
    expect(
      run([
        "function outer(v)",
        "  local a = v",
        "  function inner()",
        "    define thing with",
        "      function get()",
        "        return a",
        "      end",
        "    end",
        "  end",
        "  inner()",
        "  return thing.get()",
        "end",
        "Got {outer(7)}.",
      ]),
    ).toEqual(got("Got 7."));
  });

  test("reads a scene's local through a function further out", () => {
    expect(
      run([
        "-> S",
        "scene S",
        "  local b = 5",
        "  local function outer()",
        "    local function inner()",
        "      define thing with",
        "        function get()",
        "          return b",
        "        end",
        "      end",
        "      return thing.get()",
        "    end",
        "    return inner()",
        "  end",
        "  Got {outer()}.",
        "end",
      ]),
    ).toEqual(got("Got 5."));
  });
});

describe("defines nested many levels in functions", () => {
  test("compile in time and read the outermost local", () => {
    const started = Date.now();
    const result = run([...nestedDefines(20), "Got {outer(7)}."]);
    expect(Date.now() - started).toBeLessThan(20000);
    expect(result).toEqual(got("Got 7."));
  });
});

function nestedDefines(depth: number): string[] {
  const out = ["function outer(v)", "  local a = v"];
  const open = (i: number): void => {
    const pad = "  ".repeat(1 + i * 2);
    out.push(`${pad}define d${i} with`, `${pad}  function get()`);
    if (i + 1 < depth) {
      open(i + 1);
      out.push(`${pad}    return d${i + 1}.get()`);
    } else {
      out.push(`${pad}    return a`);
    }
    out.push(`${pad}  end`, `${pad}end`);
  };
  open(0);
  out.push("  return d0.get()", "end");
  return out;
}
