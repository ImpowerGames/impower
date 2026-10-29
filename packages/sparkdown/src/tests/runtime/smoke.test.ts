import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
  runToEnd,
} from "./runtimeTestHarness";

describe("runtime test harness smoke", () => {
  test("compiles and runs a minimal dialogue line", () => {
    const ctx = makeRuntimeStoryFromFile("smoke", "hello");
    expect(ctx.errorMessages).toEqual([]);
    const output = runToEnd(ctx.story);
    expect(output).toContain("hello world");
  });

  test("unary `not` and short-circuit `and`/`or` dispatch at runtime", () => {
    const ctx = makeRuntimeStoryFromFile("smoke", "not-runtime");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story).trim()).toBe("yes");
  });

  test("scenes without explicit `-> DONE` auto-terminate cleanly", () => {
    const ctx = makeRuntimeStoryFromSource(
      `-> main\nscene main\n  Hello world.\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.warningMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Hello world.\n");
    expect(ctx.story.canContinue).toBe(false);
  });

  test("branches without explicit `-> DONE` auto-terminate cleanly", () => {
    const ctx = makeRuntimeStoryFromSource(
      `-> main.opener\nscene main\n  branch opener\n    Greetings.\n  end\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.warningMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Greetings.\n");
    expect(ctx.story.canContinue).toBe(false);
  });

  test("`->` is accepted as a divert-target type annotation", () => {
    const ctx = makeRuntimeStoryFromSource(`-> outer ->

scene outer
  This is outer
  -> cut_to(-> the_esc)
end

scene cut_to(escape: ->)
  ->-> escape
end

scene the_esc
  This is the_esc
  -> END
end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toMatch(
      "This is outer\nThis is the_esc\n",
    );
  });

  test("table-typed store: read + property-access via dotted name", () => {
    const ctx = makeRuntimeStoryFromSource(`store t = { value = 10 }
{t.value}
& mutate(t)
{t.value}
-> DONE
function mutate(x)
  x.value = 99
end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("10\n99\n");
  });

  test("a property write between two lines is applied once", () => {
    const ctx = makeRuntimeStoryFromSource(`store t = { value = 5 }
{t.value}
& t.value = t.value * t.value
{t.value}
-> DONE
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("5\n");
    expect(ctx.story.Continue()).toBe("25\n");
    expect(ctx.story.ContinueMaximally()).toBe("");
  });

  test("diverts inside alternator arms route through `lower()` dispatch", () => {
    const ctx = makeRuntimeStoryFromSource(
      `-> main
scene main
  start
  {chain | -> next | second visit end}
  -> DONE
end

scene next
  arrived
  -> DONE
end
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("start\narrived\n");
  });

  test("divert to a label inside a branch resolves (cross-stitch path lookup)", () => {
    const ctxGather = makeRuntimeStoryFromSource(`-> main.sub.hello_label
scene main
  branch sub
    label hello_label
    Hello.
  end
end
`);
    expect(ctxGather.errorMessages).toEqual([]);

    const ctxChoice = makeRuntimeStoryFromSource(`-> main.sub.target
scene main
  branch sub
    choose
      + (target) hello
    end
    after
  end
end
`);
    expect(ctxChoice.errorMessages).toEqual([]);
  });
});
