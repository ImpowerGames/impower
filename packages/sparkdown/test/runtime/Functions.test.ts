import { describe, expect, test } from "vitest";
import {
  collectDiagnosticsFromFile,
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";

describe("Functions — clean-compile invariants", () => {
  test("function param shadowing a gather label in another scene is allowed", () => {
    const ctx = makeRuntimeStoryFromFile(
      "functions",
      "argument-shouldnt-conflict-with-gather",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.warningMessages).toEqual([]);
  });

  test("compound assignment with function-call rhs (`& x += one()`) compiles cleanly", () => {
    const ctx = makeRuntimeStoryFromFile(
      "functions",
      "function-and-increment-together",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.warningMessages).toEqual([]);
  });

  test("function-call restrictions: calling a scene + diverting to a function emit errors", () => {
    const ctx = collectDiagnosticsFromFile(
      "functions",
      "function-call-restrictions",
    );
    expect(
      ctx.errorMessages.some((m) => /hasn't been marked as a function/.test(m)),
    ).toBe(true);
    expect(
      ctx.errorMessages.some((m) =>
        /^A function can't be diverted to: call `myFunc` instead/.test(m),
      ),
    ).toBe(true);
  });

  test("function parameters shadow a global function or store of their name", () => {
    const ctx = makeRuntimeStoryFromFile(
      "functions",
      "argument-name-collisions",
    );
    expect(ctx.errorMessages).toEqual([]);
  });

  test.each([
    [
      "two stores of one name",
      "store global_var = 5\nstore global_var = 1\nscene start\n  done\nend\n",
    ],
    [
      "a store declared in the function beside its parameter",
      "function f(global_var)\n  store global_var = 5\n  return global_var\nend\nscene start\n  done\nend\n",
    ],
  ])("%s still collides", (_label, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages.join("\n")).toContain(
      "Duplicate identifier `global_var`",
    );
  });

  test("a local at the top level beside a store is refused", () => {
    const ctx = makeRuntimeStoryFromSource(
      "store global_var = 5\nlocal global_var = 1\nscene start\n  done\nend\n",
    );
    expect(ctx.errorMessages).toEqual([
      "local declaration must be inside a scene, branch or function; use store or const at the top level",
    ]);
  });
});

describe.skip("Functions — closed by design (see docs/runtime/DIVERGENCES.md)", () => {
  test("wrong variable divert target reference (sparkdown has no typed `->` param)", () => {});
});
