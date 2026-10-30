import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Variables (ported from inkjs)", () => {
  test("const", () => {
    const ctx = makeRuntimeStoryFromFile("variables", "const");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("5\n");
  });

  test("const (explicit `& store`/`& const` form)", () => {
    const ctx = makeRuntimeStoryFromFile("variables", "const-explicit");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("5\n");
  });

  test("a store and a scene's local side by side (adjacent `{x}{y}` concatenates)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "variables",
      "temporaries-at-global-scope",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("54\n");
  });

  test("const with an expression initializer", () => {
    const ctx = makeRuntimeStoryFromFile("variables", "const-expression");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("5\n");
  });

  test("const built from a const declared later", () => {
    const ctx = makeRuntimeStoryFromFile("variables", "const-from-const-forward");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("10\n");
  });

  test("multiple constant references", () => {
    const ctx = makeRuntimeStoryFromFile(
      "variables",
      "multiple-constant-references",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("success\n");
  });

  test("variable declaration in conditional", () => {
    const ctx = makeRuntimeStoryFromFile(
      "variables",
      "variable-declaration-in-conditional",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("5\n");
  });

  test("set non-existent variable (throws)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "variables",
      "set-non-existent-variable",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Hello world.\n");
    expect(() => {
      (ctx.story.variablesState as unknown as { [k: string]: unknown })["y"] =
        "earth";
    }).toThrow();
  });

  test("variable get/set API across choices", () => {
    const ctx = makeRuntimeStoryFromFile("variables", "variable-get-set-api");
    expect(ctx.errorMessages).toEqual([]);
    const state = ctx.story.variablesState as unknown as {
      [k: string]: unknown;
    };

    expect(ctx.story.ContinueMaximally()).toBe("5\n");
    expect(state["x"]).toBe(5);

    state["x"] = 10;
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("10\n");
    expect(state["x"]).toBe(10);

    state["x"] = 8.5;
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("8.5\n");
    expect(state["x"]).toBe(8.5);

    state["x"] = "a string";
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("a string\n");
    expect(state["x"]).toBe("a string");

    expect(state["z"]).toBe(null);

    expect(() => {
      state["x"] = new Map();
    }).toThrow();
  });

  test("temp forward reference resolves to nil (Luau semantics)", () => {
    const ctx = makeRuntimeStoryFromFile("variables", "temp-not-found");
    expect(ctx.errorMessages).toEqual([]);
    const output = ctx.story.ContinueMaximally();
    expect(output).toMatch(/hello/);
    expect(ctx.story.hasWarning).toBe(false);
  });

  test("variable holds a divert target (`store x = -> here`)", () => {
    const ctx = makeRuntimeStoryFromFile("variables", "variable-divert-target");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Here.\n");
  });
});
