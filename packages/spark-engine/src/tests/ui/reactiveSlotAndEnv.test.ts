import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

const spanTexts = (msgs: unknown[]): unknown[] =>
  msgs
    .filter((m: any) => m.params?.type === "span")
    .map((m: any) => m.params?.content?.text);

const allTexts = (msgs: unknown[]): unknown[] => {
  const out: unknown[] = [];
  const visit = (m: any): void => {
    if (!m) return;
    if (Array.isArray(m.params?.messages)) {
      m.params.messages.forEach(visit);
      return;
    }
    const text = m.params?.content?.text;
    if (typeof text === "string") {
      out.push(text);
    }
  };
  msgs.forEach(visit);
  return out;
};

const run = (h: UIHarness, fn: string): void =>
  (h.game.story as any).EvaluateFunction(fn, []);
const refresh = (h: UIHarness): void =>
  (h.game.module.ui as any).refreshLayouts();
const handlerIds = (h: UIHarness, event: string): string[] =>
  Object.keys((h.game.module.ui as any)._events?.[event] ?? {});

describe("slot inside a control block", () => {
  test("a slot inside `if` still renders the caller's children", async () => {
    const h = createHarness(
      `store expanded = true
component card with
  text "title"
  if expanded then
    slot
  end
end
layout main with
  card()
    text "child content"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const texts = spanTexts(h.snapshotFiltered("ui/create"));
    expect(texts).toContain("title");
    expect(texts).toContain("child content");
  });

  test("a slot inside `for` still renders the caller's children", async () => {
    const h = createHarness(
      `store rows = { 1 }
component card with
  for r in rows do
    slot
  end
end
layout main with
  card()
    text "inside the loop"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain(
      "inside the loop",
    );
  });
});

describe("nested for reuses an iteration", () => {
  test("outer loop vars re-sync when the outer value is replaced", async () => {
    const h = createHarness(
      `store players = { { name = "A" }, { name = "B" } }
store list = { "one" }
function swap()
  players = { { name = "C" }, { name = "D" } }
end
layout main with
  for k, player in players do
    for x in list do
      text "{player.name}:{x}"
    end
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(allTexts(h.snapshot())).toContain("A:one");

    const seen = h.snapshot().length;
    run(h, "swap");
    refresh(h);

    const after = allTexts(h.snapshot().slice(seen));
    expect(after).toContain("C:one");
    expect(after).not.toContain("A:one");
  });
});

describe("event handlers are released with their element", () => {
  test("dropped `for` rows do not leave their handlers behind", async () => {
    const h = createHarness(
      `store rows = { 1, 2, 3 }
function noop()
end
function drop()
  rows = { 1 }
end
layout main with
  for r in rows do
    button "Row" @click=noop
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const before = handlerIds(h, "click");
    expect(before.length).toBe(3);

    run(h, "drop");
    refresh(h);

    const after = handlerIds(h, "click");
    expect(after.length).toBe(1);
  });
});
