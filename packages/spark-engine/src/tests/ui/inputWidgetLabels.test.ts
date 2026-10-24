// An input widget's quoted content is its visible label (Widgets.md §5.1):
// `slider "Master Volume"` labels the slider. The widget renders as a real
// <label> holding the text and the <input>, so the text names the control and a
// click on it reaches the control.

import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

const creates = (h: UIHarness): any[] =>
  h.snapshotFiltered("ui/create").map((m: any) => m.params);

const createdOfType = (h: UIHarness, type: string): any[] =>
  creates(h).filter((p) => p.type === type);

/** Every text a span under `id` carries, in creation order. */
const textsUnder = (h: UIHarness, id: string): string[] => {
  const all = creates(h);
  const under = new Set([id]);
  const texts: string[] = [];
  for (const p of all) {
    if (p.parent && under.has(p.parent)) {
      under.add(p.element);
      if (p.content?.text) texts.push(p.content.text);
    }
  }
  return texts;
};

describe("input widget labels", () => {
  test("a slider's content renders as a label around the control", async () => {
    const h = createHarness(
      `store volume = 80
layout settings with
  slider "Master Volume" #min=0 #max=100 #value={volume}
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const [label] = createdOfType(h, "label");
    expect(label, "no <label> was created for the slider").toBeTruthy();
    expect(textsUnder(h, label.element)).toEqual(["Master Volume"]);
    const [input] = createdOfType(h, "input");
    expect(input.parent).toBe(label.element);
    expect(input.attributes.type).toBe("range");
  });

  test("a checkbox's content renders as a label after the box", async () => {
    const h = createHarness(
      `store music_muted = false
layout settings with
  checkbox "Mute Music" #checked={music_muted}
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const [label] = createdOfType(h, "label");
    expect(label, "no <label> was created for the checkbox").toBeTruthy();
    expect(textsUnder(h, label.element)).toEqual(["Mute Music"]);
    const children = creates(h).filter((p) => p.parent === label.element);
    expect(children.map((p) => p.type)).toEqual(["input", "span"]);
  });

  test("bound label content follows the store", async () => {
    const h = createHarness(
      `store who = "Ada"
layout settings with
  switch "Notify {who}"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const [label] = createdOfType(h, "label");
    expect(textsUnder(h, label.element)).toEqual(["Notify Ada"]);
    h.reset();
    (h.game.story as any).variablesState.$("who", "Grace");
    (h.game.module.ui as any).refreshLayouts();
    const update = h
      .snapshotFiltered("ui/update")
      .find((m: any) => m.params?.content?.text === "Notify Grace");
    expect(update).toBeTruthy();
  });

  test("a widget without content renders the bare control", async () => {
    const h = createHarness(
      `store volume = 80
layout settings with
  slider #value={volume}
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(createdOfType(h, "label")).toEqual([]);
    expect(createdOfType(h, "input")).toHaveLength(1);
  });

  test("props, bindings and write-back stay on the control", async () => {
    const h = createHarness(
      `store volume = 80
layout settings with
  slider "Master Volume" #min=0 #max=100 #value={volume} #margin-bottom=18 @input={ volume = event.value }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const [input] = createdOfType(h, "input");
    expect(input.attributes).toMatchObject({ min: "0", max: "100", value: "80" });
    expect(input.style?.["margin-bottom"]).toBe("18");
    const [label] = createdOfType(h, "label");
    expect(label.style?.["margin-bottom"]).toBeUndefined();
    // The control is the one element observed for events.
    const observed = h.observedElementIds();
    expect(observed).toHaveLength(1);
    h.emitEvent("input", observed[0]!, { value: 30 });
    expect((h.game.story as any).variablesState.$("volume")).toBe(30);
    h.reset();
    (h.game.story as any).variablesState.$("volume", 55);
    (h.game.module.ui as any).refreshLayouts();
    const update = h
      .snapshotFiltered("ui/update")
      .find((m: any) => m.params?.attributes?.value === "55");
    expect(update).toBeTruthy();
  });
});
