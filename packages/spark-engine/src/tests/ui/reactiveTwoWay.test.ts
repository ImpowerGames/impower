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

  test("@input inline-closure writes the typed value back (event.value)", async () => {
    const h = createHarness(
      `store name = "Zelda"
screen form with
  field #value={name} @input={ name = event.value }
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

  test("@change inline-closure reading event.checked toggles a boolean", async () => {
    const h = createHarness(
      `store muted = false
screen form with
  checkbox #checked={muted} @change={ muted = event.checked }
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

  test("@click inline-closure runs multiple statements (`;`-separated)", async () => {
    const h = createHarness(
      `store score = 10
store combo = 3
screen form with
  button "Reset" @click={ score = 0; combo = 0 }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const btnId = h.observedElementIds()[0];
    expect(btnId).toBeTruthy();
    h.emitEvent("click", btnId!, {});
    expect(evalGlobal(h, "score")).toBe(0);
    expect(evalGlobal(h, "combo")).toBe(0);
  });

  test("a numeric input writes a NUMBER back (store keeps its type)", async () => {
    // A range/number control sends a JS number (getEventData), so the write-back
    // must keep `volume` numeric — not flip it to the string "80", which would
    // make `volume > 100` lexicographic.
    const h = createHarness(
      `store volume = 50
screen form with
  slider #value={volume} #min=0 #max=100 @input={ volume = event.value }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const id = h.observedElementIds()[0];
    expect(id).toBeTruthy();
    h.emitEvent("input", id!, { value: 80 });
    expect(evalGlobal(h, "volume")).toBe(80);
    expect(typeof evalGlobal(h, "volume")).toBe("number");
  });

  test("a fractional numeric input writes a float", async () => {
    const h = createHarness(
      `store rate = 1
screen form with
  slider #value={rate} #min=0 #max=2 @input={ rate = event.value }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const id = h.observedElementIds()[0];
    h.emitEvent("input", id!, { value: 0.5 });
    expect(evalGlobal(h, "rate")).toBe(0.5);
  });

  test("a text input still writes a string", async () => {
    const h = createHarness(
      `store name = "Zelda"
screen form with
  field #value={name} @input={ name = event.value }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const id = h.observedElementIds()[0];
    h.emitEvent("input", id!, { value: "Link" });
    expect(evalGlobal(h, "name")).toBe("Link");
    expect(typeof evalGlobal(h, "name")).toBe("string");
  });

  test("@click inline-closure can call a function (bare call fires, no `&`)", async () => {
    const h = createHarness(
      `store score = 7
function reset_score()
  score = 0
end
screen form with
  button "Reset" @click={ reset_score() }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const btnId = h.observedElementIds()[0];
    expect(btnId).toBeTruthy();
    h.emitEvent("click", btnId!, {});
    expect(evalGlobal(h, "score")).toBe(0);
  });

  test("@input inline-closure writes a property target (`obj.field = event.value`)", async () => {
    // A property-target write inside a closure (`player.name = …`) is what a
    // table reinterpretation of `{…}` could NOT express — verify it works, and
    // observe it through the re-rendered bound value (the runtime table isn't a
    // plain JS object, so we assert the binding sees the new value).
    const h = createHarness(
      `store player = { name = "Zelda" }
screen form with
  field #value={player.name} @input={ player.name = event.value }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const fieldId = h.observedElementIds()[0];
    expect(fieldId).toBeTruthy();
    h.reset();
    h.emitEvent("input", fieldId!, { value: "Link" });
    const update = h
      .snapshotFiltered("ui/update")
      .find(
        (m: any) => m.params?.attributes && "value" in m.params.attributes,
      ) as any;
    expect(update?.params?.attributes?.value).toBe("Link");
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
