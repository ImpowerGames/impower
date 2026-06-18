// Two-way binding: input widgets render as real <input>s with a one-way bound
// value/checked, and @input/@change handlers receive an `event` table
// (event.value / event.checked) to write back into Luau state.

import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

const evalGlobal = (h: UIHarness, name: string): unknown =>
  (h.game.story as any).variablesState.$(name);

describe("two-way binding (input write-back)", () => {
  test("field renders as <input> with its bound value", async () => {
    const h = createHarness(
      `store name = "Zelda"
screen form with
  field #value={name}
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const input = h
      .snapshotFiltered("ui/create")
      .find((m: any) => m.params?.type === "input") as any;
    expect(input).toBeTruthy();
    expect(input.params.attributes.type).toBe("text");
    expect(input.params.attributes.value).toBe("Zelda");
  });

  test("@input ref handler writes the typed value back (implicit event arg)", async () => {
    const h = createHarness(
      `store name = "Zelda"
function set_name(event)
  name = event.value
end
screen form with
  field #value={name} @input=set_name
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const fieldId = h.observedElementIds()[0];
    expect(fieldId).toBeTruthy();
    h.emitEvent("input", fieldId!, { value: "Link" });
    expect(evalGlobal(h, "name")).toBe("Link");
  });

  test("@change call handler reading event.checked toggles a boolean", async () => {
    const h = createHarness(
      `store muted = false
function set_muted(event)
  muted = event.checked
end
screen form with
  checkbox #checked={muted} @change=set_muted(event)
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const boxId = h.observedElementIds()[0];
    expect(boxId).toBeTruthy();
    h.emitEvent("change", boxId!, { checked: true });
    expect(evalGlobal(h, "muted")).toBe(true);
  });

  test("one-way value follows state on a programmatic change", async () => {
    const h = createHarness(
      `store name = "Zelda"
function clear_name(event)
  name = ""
end
screen form with
  field #value={name} @input=set_name
  button "Clear" @click=clear_name
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    h.reset();
    (h.game.story as any).variablesState.$("name", "Ganon");
    (h.game.module.ui as any).refreshScreens();
    const update = h
      .snapshotFiltered("ui/update")
      .find((m: any) => m.params?.attributes && "value" in m.params.attributes) as any;
    expect(update?.params?.attributes?.value).toBe("Ganon");
  });
});
