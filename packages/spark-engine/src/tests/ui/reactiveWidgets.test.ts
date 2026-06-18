// Interactive widget coverage (spec §10.1): link (clickable), dropdown/option
// (native <select>/<option> with selected value + @change write-back), and the
// slider's engine-computed `--_fill-percentage`.

import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

const evalGlobal = (h: UIHarness, name: string): unknown =>
  (h.game.story as any).variablesState.$(name);

const created = (h: UIHarness, type: string): any[] =>
  h.snapshotFiltered("ui/create").filter((m: any) => m.params?.type === type);

describe("interactive widgets", () => {
  test("link is clickable (content + @click)", async () => {
    const h = createHarness(
      `store n = 0
function bump()
  n = n + 1
end
screen form with
  link "Continue" @click=bump
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const id = h.observedElementIds()[0];
    expect(id).toBeTruthy();
    h.emitEvent("click", id!, {});
    expect(evalGlobal(h, "n")).toBe(1);
  });

  test("dropdown renders a <select> with <option> children", async () => {
    const h = createHarness(
      `store difficulty = "normal"
screen form with
  dropdown #value={difficulty} @change={ difficulty = event.value }:
    option "Easy" #value="easy"
    option "Normal" #value="normal"
    option "Hard" #value="hard"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(created(h, "select")).toHaveLength(1);
    expect(created(h, "option")).toHaveLength(3);
  });

  test("dropdown selects the bound value after its options exist", async () => {
    const h = createHarness(
      `store difficulty = "hard"
screen form with
  dropdown #value={difficulty}:
    option "Easy" #value="easy"
    option "Hard" #value="hard"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    // The selected value is applied via a ui/update AFTER the options mount
    // (a <select>.value can't select an option that doesn't exist yet).
    const update = h
      .snapshotFiltered("ui/update")
      .find(
        (m: any) => m.params?.attributes && "value" in m.params.attributes,
      ) as any;
    expect(update?.params?.attributes?.value).toBe("hard");
  });

  test("dropdown writes the chosen value back on @change", async () => {
    const h = createHarness(
      `store difficulty = "normal"
screen form with
  dropdown #value={difficulty} @change={ difficulty = event.value }:
    option "Easy" #value="easy"
    option "Hard" #value="hard"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const selectId = h.observedElementIds()[0];
    expect(selectId).toBeTruthy();
    h.emitEvent("change", selectId!, { value: "easy" });
    expect(evalGlobal(h, "difficulty")).toBe("easy");
  });

  test("an option's value defaults to its label text", async () => {
    const h = createHarness(
      `store choice = "Banana"
screen form with
  dropdown #value={choice}:
    option "Apple"
    option "Banana"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const optionCreates = created(h, "option");
    const values = optionCreates.map((m) => m.params?.attributes?.value);
    expect(values).toEqual(["Apple", "Banana"]);
  });

  test("a label-defaulted option value tracks a reactive label (no desync)", async () => {
    const h = createHarness(
      `store label = "Apple"
store choice = "Apple"
screen form with
  dropdown #value={choice}:
    option "{label}"
    option "Banana"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    h.reset();
    (h.game.story as any).variablesState.$("label", "Cherry");
    (h.game.module.ui as any).refreshScreens();
    // The option's value attribute must follow its reactive label, not stay
    // stale at "Apple" (which would mismatch the visible "Cherry").
    const valueUpdate = h
      .snapshotFiltered("ui/update")
      .find(
        (m: any) => m.params?.attributes?.value === "Cherry",
      );
    expect(valueUpdate).toBeTruthy();
  });

  test("slider exposes an engine-computed --_fill-percentage", async () => {
    const h = createHarness(
      `store volume = 25
screen form with
  slider #value={volume} #min=0 #max=100
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const fill = h
      .snapshotFiltered("ui/update")
      .find(
        (m: any) => m.params?.style && "--_fill-percentage" in m.params.style,
      ) as any;
    expect(fill?.params?.style?.["--_fill-percentage"]).toBe("25%");
  });

  test("slider --_fill-percentage follows the value reactively", async () => {
    const h = createHarness(
      `store volume = 25
screen form with
  slider #value={volume} #min=0 #max=100
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    h.reset();
    (h.game.story as any).variablesState.$("volume", 75);
    (h.game.module.ui as any).refreshScreens();
    const fill = h
      .snapshotFiltered("ui/update")
      .find(
        (m: any) => m.params?.style && "--_fill-percentage" in m.params.style,
      ) as any;
    expect(fill?.params?.style?.["--_fill-percentage"]).toBe("75%");
  });
});
