// A statement lowered inside a nested block (an `if` body, an `else` arm, a
// loop body) reports the same diagnostics it reports directly in a scene,
// and a scene-level statement still reports each one once.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const CHOICE_MARK = "must appear inside a `choose ... end` block";
const EMPTY_DIVERT = "Empty diverts (->) are only valid on choices";

const scene = (body: string) =>
  `store n = 0\n-> s\nscene s\n${body}\n  Done.\n  fin\n\nend\n`;

const count = (messages: string[], fragment: string) =>
  messages.filter((m) => m.includes(fragment)).length;

describe("diagnostics from statements inside nested blocks", () => {
  test.each([
    ["directly in the scene", "  * [Pick]\n    Picked."],
    ["inside an if block", "  if n == 0 then\n    * [Pick]\n      Picked.\n  end"],
    [
      "inside an else arm",
      "  if n == 1 then\n    Skipped.\n  else\n    * [Pick]\n      Picked.\n  end",
    ],
    [
      "inside a while loop",
      "  while n < 2 do\n    n = n + 1\n    * [Pick]\n      Picked.\n  end",
    ],
  ])("a choice without choose %s reports the choice-mark error once", (_, body) => {
    const ctx = makeRuntimeStoryFromSource(scene(body));
    expect(count(ctx.errorMessages, CHOICE_MARK)).toBe(1);
  });

  test("a choice inside choose inside an if block reports no choice-mark error", () => {
    const ctx = makeRuntimeStoryFromSource(
      scene("  if n == 0 then\n    choose\n      * [Pick]\n        Picked.\n    end\n  end"),
    );
    expect(count(ctx.errorMessages, CHOICE_MARK)).toBe(0);
  });

  test.each([
    ["directly in the scene", "  ->"],
    ["inside an if block", "  if n == 0 then\n    ->\n  end"],
  ])("an empty divert %s reports its warning once", (_, body) => {
    const ctx = makeRuntimeStoryFromSource(scene(body));
    expect(count(ctx.warningMessages, EMPTY_DIVERT)).toBe(1);
  });
});
