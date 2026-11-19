import { describe, expect, test } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const script = (element: string) => `define ui as config with
  layouts_initial = { "textbox", "hud" }
end

layout hud {
  ${element}
}

scene start
  Rain falls.
end
`;

async function reportsAfterWriting(element: string, target: string): Promise<string[]> {
  const h = createHarness(script(element), 0, { reactive: true });
  await h.ready;
  new Coordinator(h.game, {
    end: 0,
    text: { [target]: [{ text: "12:00" }] },
  } as any);
  await flushMicrotasks(30);
  return h.messages
    .filter((m: any) => m?.method === "game/runtimeError")
    .map((m: any) => String(m.params?.message ?? ""))
    .filter((message) => message.includes("No layout element is named"));
}

describe("a write to a target no layout element is named after (#2552)", () => {
  test("reports a runtime warning when only a class names the target", async () => {
    expect(await reportsAfterWriting("text.clock", "clock")).toEqual([
      "No layout element is named `clock`, so the line written to it draws nothing.",
    ]);
  });

  test("reports nothing when an element is named after the target", async () => {
    expect(await reportsAfterWriting("clock { text }", "clock")).toEqual([]);
  });

  test("reports a runtime warning for a dotted target", async () => {
    expect(await reportsAfterWriting("clock { text }", "hud.clock")).toEqual([
      "No layout element is named `hud.clock`, so the line written to it draws nothing.",
    ]);
  });
});
