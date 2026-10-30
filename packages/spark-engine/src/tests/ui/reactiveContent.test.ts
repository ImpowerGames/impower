import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

const HUD = `store hp = 100
layout hud with
  text "HP: {hp}"
end
`;

describe("reactive content binding (Phase 3 I2)", () => {
  test("mounts {expr} content evaluated to its live value", async () => {
    const h = createHarness(HUD, 0, { reactive: true });
    await h.ready;
    const span = h
      .snapshotFiltered("ui/create")
      .find(
        (m: any) =>
          m.params?.type === "span" &&
          typeof m.params?.content?.text === "string" &&
          m.params.content.text.startsWith("HP:"),
      ) as any;
    expect(span?.params?.content?.text).toBe("HP: 100");
  });

  test("re-evaluates and updates the span when the bound state changes", async () => {
    const h = createHarness(HUD, 0, { reactive: true });
    await h.ready;
    h.reset();
    (h.game.story as any).variablesState.$("hp", 50);
    (h.game.module.ui as any).refreshLayouts();
    const update = h
      .snapshotFiltered("ui/update")
      .find(
        (m: any) =>
          typeof m.params?.content?.text === "string" &&
          m.params.content.text.startsWith("HP:"),
      ) as any;
    expect(update?.params?.content?.text).toBe("HP: 50");
  });

  test("emits no update when the resolved value is unchanged (equality-gated)", async () => {
    const h = createHarness(HUD, 0, { reactive: true });
    await h.ready;
    h.reset();
    (h.game.module.ui as any).refreshLayouts();
    expect(h.snapshotFiltered("ui/update")).toEqual([]);
  });

  test("static (binding-free) content is not registered for re-eval", async () => {
    const h = createHarness(
      `layout hud with
  text "static label"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const span = h
      .snapshotFiltered("ui/create")
      .find(
        (m: any) =>
          m.params?.type === "span" && m.params?.content?.text === "static label",
      );
    expect(span).toBeTruthy();
    h.reset();
    (h.game.module.ui as any).refreshLayouts();
    expect(h.snapshotFiltered("ui/update")).toEqual([]);
  });
});
