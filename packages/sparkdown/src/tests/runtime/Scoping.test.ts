// Sparkdown-specific scoping tests. Ink's `temp` is function-scoped;
// Luau's `local` is block-scoped — sparkdown follows Luau semantics so
// authors familiar with luau get no surprises. The implementation uses
// `BeginScope` / `EndScope` ControlCommands emitted around block
// bodies, and a scope stack on each call-stack Element (innermost-last).

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Scoping (luau block-scoped local)", () => {
  test("reassign-without-local mutates the outer binding", () => {
    // `x = 99` (no `local`) inside an `if`-block looks for an existing
    // `x` walking scopes outward. It finds the outer `local x = 1` and
    // updates that binding. After the block, the outer `x` shows the
    // new value.
    const ctx = makeRuntimeStoryFromFile(
      "scoping",
      "reassign-without-local",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("99\n");
  });

  test("else-branch scope is isolated from outer", () => {
    // The `else` branch declares its own `local x = 2` which shadows
    // the outer `local x = 1` only for the duration of the branch.
    // After `end`, outer `x = 1` is visible again. Mirrors the if-arm
    // semantics — every branch gets its own BeginScope/EndScope.
    const ctx = makeRuntimeStoryFromFile("scoping", "else-branch-isolated");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("2\n1\n");
  });

  test("local x in if-block shadows outer local x", () => {
    // Outer `local x = 1`, then inside an `if true then ... end` body
    // a second `local x = 2`. The inner binding shadows the outer for
    // the duration of the block. After `end`, the outer `x = 1` is
    // visible again.
    //
    // In ink's function-scoped `temp` model the inner declaration
    // would either re-assign the outer (or error on duplicate decl);
    // either way it wouldn't restore `1` after the block. The fact
    // that the outer `x` is visible again proves block scoping is
    // working.
    const ctx = makeRuntimeStoryFromFile(
      "scoping",
      "local-shadows-in-if-block",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("2\n1\n");
  });
});
