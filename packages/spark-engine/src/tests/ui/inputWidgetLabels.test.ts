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

  test("hiding a labelled widget hides its label too", async () => {
    const h = createHarness(
      `store shown = true
layout settings with
  slider "Private volume" #displayed={shown} #value=5
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    // One query, so creates and updates share one id numbering.
    const ui = (): any[] => h.snapshotFiltered("ui/").map((m: any) => m);
    const label = ui().find(
      (m) => m.method === "ui/create" && m.params.type === "label",
    ).params;
    const input = ui().find(
      (m) => m.method === "ui/create" && m.params.type === "input",
    ).params;
    expect(label.style?.displayed).toBe("true");
    expect(input.style?.displayed).toBeUndefined();

    // Ids are numbered in first-seen order, so messages sent after a point
    // keep the numbering of the creates above.
    let seen = ui().length;
    (h.game.story as any).variablesState.$("shown", false);
    (h.game.module.ui as any).refreshLayouts();
    const hidden = ui()
      .slice(seen)
      .filter(
        (m) => m.method === "ui/update" && m.params.style?.displayed === "false",
      );
    expect(hidden.map((m) => m.params.element)).toEqual([label.element]);

    seen = ui().length;
    (h.game.module.ui as any).hide("slider");
    // A direct UI call's messages go out on the next microtask.
    await Promise.resolve();
    const hiddenByName = ui()
      .slice(seen)
      .filter(
        (m) => m.method === "ui/update" && m.params.style?.display === "none",
      );
    expect(hiddenByName.map((m) => m.params.element)).toEqual([label.element]);
  });

  test("removing a labelled widget drops its control's event handler", async () => {
    const h = createHarness(
      `store show = true
store volume = 80
layout settings with
  if show then
    slider "Volume" #value={volume} @input={ volume = event.value }
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const events = (h.game.module.ui as any)._events;
    expect(Object.keys(events.input ?? {})).toHaveLength(1);
    (h.game.story as any).variablesState.$("show", false);
    (h.game.module.ui as any).refreshLayouts();
    expect(createdOfType(h, "label")).toHaveLength(1);
    expect(Object.keys(events.input ?? {})).toEqual([]);
    expect(h.snapshotFiltered("ui/unobserve")).toHaveLength(1);
  });

  test("removing a container drops the handlers of controls inside it", async () => {
    const h = createHarness(
      `store show = true
store n = 0
layout settings with
  if show then
    row {
      button "Bump" @click={ n = n + 1 }
    }
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const events = (h.game.module.ui as any)._events;
    expect(Object.keys(events.click ?? {})).toHaveLength(1);
    (h.game.story as any).variablesState.$("show", false);
    (h.game.module.ui as any).refreshLayouts();
    expect(Object.keys(events.click ?? {})).toEqual([]);
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
