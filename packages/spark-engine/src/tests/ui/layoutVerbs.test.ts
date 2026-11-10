import { describe, expect, test, vi } from "vitest";
import { LAYOUT_VERBS } from "@impower/sparkdown/language/sparkdown.layout-verbs";
import type { LayoutInstruction } from "../../game/core/types/Instruction";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SOURCE = `layout main {
  textbox {
    dialogue {
      text
    }
  }
}
layout hud {
  text "HP"
}

scene start
  Hello.
end
`;

const unknownVerb = (control: string): LayoutInstruction =>
  ({ control, name: "hud" }) as unknown as LayoutInstruction;

const warnings = (log: ReturnType<typeof vi.spyOn>) =>
  log.mock.calls
    .filter(([, severity]) => severity === "warning")
    .map(([message]) => String(message));

describe("layout verbs the engine does not handle", () => {
  test("an unknown verb opens no layout and is reported once", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    const ui: any = h.game.module.ui;
    const log = vi.spyOn(h.game, "log");

    await ui.applyLayoutInstructions([unknownVerb("reveal")], true);
    await ui.applyLayoutInstructions([unknownVerb("reveal")], true);
    await flushMicrotasks();

    expect(ui._mountedLayouts.has("hud")).toBe(false);
    expect(ui.openedLayoutsAfter([unknownVerb("reveal")])).toEqual(["main"]);
    expect(
      h.snapshotFiltered("ui/create").map((m: any) => m.params?.name),
    ).not.toContain("hud");
    const reported = warnings(log).filter((m) => m.includes("`reveal`"));
    expect(reported).toHaveLength(1);
  });

  test("an unknown verb beside a known one leaves the known one working", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    const ui: any = h.game.module.ui;

    await ui.applyLayoutInstructions(
      [unknownVerb("reveal"), { control: "open", name: "hud" }],
      true,
    );
    await flushMicrotasks();

    expect(ui._mountedLayouts.has("hud")).toBe(true);
  });

  test.each(LAYOUT_VERBS)("`%s` is handled, not reported as unknown", async (verb) => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    const ui: any = h.game.module.ui;
    const log = vi.spyOn(h.game, "log");

    await ui.applyLayoutInstructions([{ control: verb, name: "hud" }], true);
    await flushMicrotasks();

    expect(warnings(log).filter((m) => m.includes(`\`${verb}\``))).toEqual([]);
  });
});
