import { describe, expect, test } from "vitest";
import { VARARGS_LOCAL_NAME } from "../../compiler/lower/utils/lowerArguments";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function run(body: string, callArgs: string): { errors: string[]; recorded: unknown[] } {
  const { story, errorMessages } = makeRuntimeStoryFromSource(`external host_record(v)
scene start
  & f(${callArgs})
  done
end

function f(...)
${body}
end
`);
  const errors = errorMessages.map((m) => `[compile] ${m}`);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("an author's __varargs__ inside a vararg function", () => {
  test("the generated name holds a character no identifier can contain", () => {
    expect(VARARGS_LOCAL_NAME).not.toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
  });

  test("a local named __varargs__ keeps its value and `...` keeps the arguments", () => {
    const { errors, recorded } = run(
      `  local __varargs__ = "mine"
  local a, b = ...
  host_record(a)
  host_record(b)
  host_record(select("#", ...))
  host_record(__varargs__)`,
      `"x", "y"`,
    );
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["x", "y", 2, "mine"]);
  });
});
