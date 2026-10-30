import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

const hpUpdate = (h: UIHarness): string | undefined => {
  const m = h
    .snapshotFiltered("ui/update")
    .find(
      (x: any) =>
        typeof x.params?.content?.text === "string" &&
        x.params.content.text.startsWith("HP:"),
    ) as any;
  return m?.params?.content?.text;
};

describe("reactive @event handlers (Phase 3 I5)", () => {
  test("ref handler (`@click=fn`) runs the function and flushes bound content", async () => {
    const h = createHarness(
      `store hp = 100
function heal()
  hp = hp + 5
end
layout hud with
  text "HP: {hp}"
  button "Heal" @click=heal
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const buttonId = h.observedElementIds()[0];
    expect(buttonId).toBeTruthy();
    h.reset();
    h.emitEvent("click", buttonId!);
    expect(hpUpdate(h)).toBe("HP: 105");
  });

  test("call handler (`@click=fn(args)`) evaluates the call and flushes", async () => {
    const h = createHarness(
      `store hp = 100
function take_damage(n)
  hp = hp - n
end
layout hud with
  text "HP: {hp}"
  button "Hit" @click=take_damage(10)
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const buttonId = h.observedElementIds()[0];
    expect(buttonId).toBeTruthy();
    h.reset();
    h.emitEvent("click", buttonId!);
    expect(hpUpdate(h)).toBe("HP: 90");
  });

  test("the handler element is observed at mount (ui/observe emitted)", async () => {
    const h = createHarness(
      `store hp = 100
function heal()
  hp = hp + 5
end
layout hud with
  button "Heal" @click=heal
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const observe = h
      .snapshotFiltered("ui/observe")
      .find((m: any) => m.params?.event === "click") as any;
    expect(observe).toBeTruthy();
  });
});
