// C1: authored components (`component NAME(params) with … end`) invoked with
// paren args (`card("x")`), rendering their body with the args bound to the
// declared params, plus `slot`/`fill` content projection (spec §4.7).
//
// A component instance is wrapperless (its body mounts directly into the parent).
// Args are evaluated in the CALLER's scope and fed to the body's `{param}`
// bindings as evaluator args (same mechanism as `for`-loop vars), so a reactive
// arg (`badge(score)`) updates the body on the per-turn refresh. `slot` projects
// the caller's children (default slot) or a matching `fill NAME` (named slot),
// rendered in the caller's scope.

import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

const spanTexts = (msgs: unknown[]): unknown[] =>
  msgs
    .filter((m: any) => m.params?.type === "span")
    .map((m: any) => m.params?.content?.text);

const run = (h: UIHarness, fn: string): void =>
  (h.game.story as any).EvaluateFunction(fn, []);
const refresh = (h: UIHarness): void =>
  (h.game.module.ui as any).refreshLayouts();

describe("reactive components (C1)", () => {
  test("a component renders its body with a literal arg bound to its param", async () => {
    const h = createHarness(
      `component greeting(who) with
  text "Hi {who}"
end
layout main with
  greeting("World")
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("Hi World");
  });

  test("a component with two params binds them positionally", async () => {
    const h = createHarness(
      `component stat_row(label, value) with
  text "{label}: {value}"
end
layout main with
  stat_row("HP", 100)
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("HP: 100");
  });

  test("default slot projects the caller's children", async () => {
    const h = createHarness(
      `component card(title) with
  box:
    text "{title}"
    slot
end
layout main with
  card("Inventory"):
    text "body content"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const texts = spanTexts(h.snapshotFiltered("ui/create"));
    expect(texts).toEqual(
      expect.arrayContaining(["Inventory", "body content"]),
    );
  });

  test("named slot projects a matching `fill`", async () => {
    const h = createHarness(
      `component panel with
  box:
    slot
    slot footer
end
layout main with
  panel:
    text "main body"
    fill footer:
      text "footer body"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const texts = spanTexts(h.snapshotFiltered("ui/create"));
    expect(texts).toEqual(
      expect.arrayContaining(["main body", "footer body"]),
    );
  });

  test("a reactive arg updates the body binding on refresh", async () => {
    const h = createHarness(
      `store score = 0
function inc()
  score = score + 1
end
component badge(n) with
  text "score: {n}"
end
layout main with
  badge(score)
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("score: 0");

    h.reset();
    run(h, "inc");
    refresh(h);
    const update = h
      .snapshotFiltered("ui/update")
      .find((m: any) => m.params?.content?.text === "score: 1");
    expect(update).toBeTruthy();
  });

  test("a component called inside a `for` receives the loop var as an arg", async () => {
    const h = createHarness(
      `store items = {"a", "b"}
component row_item(x) with
  text "item: {x}"
end
layout main with
  for it in items do
    row_item(it)
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const texts = spanTexts(h.snapshotFiltered("ui/create"));
    expect(texts).toEqual(expect.arrayContaining(["item: a", "item: b"]));
  });

  test("an interpolated quoted-string arg renders + reacts", async () => {
    const h = createHarness(
      `store score = 0
function inc()
  score = score + 1
end
component card(title) with
  text "{title}"
layout main with
  card("Score is {score}")
`,
      0,
      { reactive: true },
    );
    await h.ready;
    // `"Score is {score}"` interpolated at the call site → passed to the param.
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("Score is 0");

    h.reset();
    run(h, "inc");
    refresh(h);
    const upd = h
      .snapshotFiltered("ui/update")
      .find((m: any) => m.params?.content?.text === "Score is 1");
    expect(upd).toBeTruthy();
  });
});
