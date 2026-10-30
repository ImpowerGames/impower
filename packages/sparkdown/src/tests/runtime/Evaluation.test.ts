import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
  runToEnd,
} from "./runtimeTestHarness";

describe("Evaluation (ported from inkjs)", () => {
  test("arithmetic", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "arithmetic");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(
      "36\n2\n3\n2.3333333333333335\n2.3333333333333335\n8\n8\n",
    );
  });

  test("floor division (Luau `//`)", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "floor-division");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("3\n2\n-4\n3\n");
  });

  test("string concatenation (Luau `..`)", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "concat");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Hello, World!\n");
  });

  test("comparison operators (~=, <, <=, >=)", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "comparison-ops");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(
      "true\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\nfalse\n",
    );
  });

  test("compound assignment (all variants)", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "compound-assignment");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(
      [
        "15",
        "12",
        "24",
        "6",
        "2",
        "8",
        "3",
        "Hello, World!",
        "",
      ].join("\n"),
    );
  });

  test("operator associativity and precedence (Luau)", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "associativity");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(
      ["512", "5", "5", "7", "14", "9", "9", "-4", "36", "0", ""].join("\n"),
    );
  });

  test("exponentiation (Luau `^`)", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "exponentiation");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("8\n1024\n1\n2\n512\n");
  });

  test("literal unary", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "literal-unary");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("-1\nfalse\nfalse\n");
  });

  test("increment / decrement (compound assignment)", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "increment");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("6\n5\n");
  });

  test("EvaluateFunction returning a divert target", () => {
    const src = `scene start
  Top level content
  -> DONE
end

scene somewhere
  -> DONE
end

function test()
  return -> somewhere
end
`;
    const ctx = makeRuntimeStoryFromSource(src);
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    const returned = ctx.story.EvaluateFunction("test") as string;
    expect(returned).toBe("-> somewhere");
  });

  test("EvaluateFunction with args + capture", () => {
    const src = `scene start
  -> DONE
end

function add(x, y)
  return x + y
end
`;
    const ctx = makeRuntimeStoryFromSource(src);
    expect(ctx.errorMessages).toEqual([]);
    const r = ctx.story.EvaluateFunction("add", [1, 2], true) as {
      output: string;
      returned: unknown;
    };
    expect(r.returned).toBe(3);
    expect(r.output).toBe("");
  });
});

describe("Evaluation — ported from ink fixture rewrites", () => {
  test("factorial recursive (rewrite of inkjs `factorial_recursive.ink`)", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "factorial-recursive");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("120\n");
  });

  test("evaluation stack leaks (rewrite of inkjs `evaluation_stack_leaks.ink`)", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "stack-leaks");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("else\nelse\nhi\n");
    expect(ctx.story.state.evaluationStack.length).toBe(0);
  });

  test("basic string literals — variable + inline `{\"world\"}` literal", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "basic-string-literals");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Hello world 1\nHello world 2.\n");
  });

  test("EvaluateFunction with interleaved Continue() (host-driven function calls)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "evaluation",
      "evaluating-functions-from-host",
    );
    expect(ctx.errorMessages).toEqual([]);

    let funcResult = ctx.story.EvaluateFunction("func1", [], true) as {
      returned: unknown;
      output: string;
    };
    expect(funcResult.returned).toBe(5);
    expect(funcResult.output).toBe("");

    expect(ctx.story.Continue()).toBe("One\n");

    funcResult = ctx.story.EvaluateFunction("func2", [], true) as {
      returned: unknown;
      output: string;
    };
    expect(funcResult.returned).toBe(null);
    expect(funcResult.output).toBe("");

    expect(ctx.story.Continue()).toBe("Two\n");

    funcResult = ctx.story.EvaluateFunction("add", [1, 2], true) as {
      returned: unknown;
      output: string;
    };
    expect(funcResult.returned).toBe(3);
    expect(funcResult.output).toBe("");

    expect(ctx.story.Continue()).toBe("Three\n");
  });

  test("EvaluateFunction mid-narrative preserves call-stack state across calls", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "function-variable-state");
    expect(ctx.errorMessages).toEqual([]);

    expect(ctx.story.Continue()).toBe("Start\n");
    expect(ctx.story.Continue()).toBe("In tunnel.\n");

    const funcResult = ctx.story.EvaluateFunction("function_to_evaluate");
    expect(funcResult).toBe("RIGHT");

    expect(ctx.story.Continue()).toBe("End\n");
  });

  test("factorial by reference (table param as pseudo-ref)", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "factorial-by-reference");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("120\n");
  });

});
