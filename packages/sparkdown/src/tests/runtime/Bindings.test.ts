import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile } from "./runtimeTestHarness";

describe("Bindings (ported from inkjs)", () => {
  test("external bindings (BindExternalFunction across return/side-effect shapes)", () => {
    const ctx = makeRuntimeStoryFromFile("bindings", "external-binding");
    expect(ctx.errorMessages).toEqual([]);

    let testExternalBindingMessage = "";

    ctx.story.BindExternalFunction("message", (arg: unknown) => {
      testExternalBindingMessage = "MESSAGE: " + arg;
    });

    ctx.story.BindExternalFunction(
      "multiply",
      (arg1: number, arg2: number) => arg1 * arg2,
    );

    ctx.story.BindExternalFunction(
      "times",
      (numberOfTimes: number, stringValue: string) => {
        let result = "";
        for (let i = 0; i < numberOfTimes; i++) result += stringValue;
        return result;
      },
    );

    expect(ctx.story.Continue()).toBe("15\n");
    expect(ctx.story.Continue()).toBe("knock knock knock\n");
    expect(testExternalBindingMessage).toBe("MESSAGE: hello world");
  });

  test("host ↔ sparkdown round-trip (BindExternalFunction + EvaluateFunction recursion)", () => {
    const ctx = makeRuntimeStoryFromFile("bindings", "game-ink-back-and-forth");
    expect(ctx.errorMessages).toEqual([]);

    ctx.story.BindExternalFunction("gameInc", (x: number) => {
      const incremented = x + 1;
      return ctx.story.EvaluateFunction("inkInc", [incremented]);
    });

    const finalResult = ctx.story.EvaluateFunction("topExternal", [5], true) as {
      returned: unknown;
      output: string;
    };

    expect(finalResult.returned).toBe(7);
    expect(finalResult.output).toBe("");
  });

  test("Object.keys(variablesState) lists every declared global", () => {
    const ctx = makeRuntimeStoryFromFile("bindings", "variable-observer");
    expect(ctx.errorMessages).toEqual([]);
    expect(Object.keys(ctx.story.variablesState)).toEqual([
      "testVar",
      "testVar2",
    ]);
  });

  test("an external call inside a glued line runs once", () => {
    const ctx = makeRuntimeStoryFromFile(
      "bindings",
      "lookup-safe-or-not-with-post-glue",
    );
    expect(ctx.errorMessages).toEqual([]);
    let calls = 0;
    ctx.story.BindExternalFunction("myAction", () => {
      calls++;
    });
    expect(ctx.story.ContinueMaximally()).toBe("One Two\n");
    expect(calls).toBe(1);
  });
});
