// An input widget's quoted content is its visible label (Widgets.md §5.1):
// `slider "Master Volume"` labels the slider. The widget renders as a real
// <label> holding the text and the <input>, so the text names the control and a
// click on it reaches the control. The label is the widget's element: it
// carries the widget's name, classes and style props, and the <input> inside
// it takes the attributes, bindings and events.

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
    // The label holds the control, so hiding the label hides both.
    expect(label.style?.displayed).toBe("true");
    expect(input.parent).toBe(label.element);
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

  test("a widget's style binding is evaluated once", async () => {
    const h = createHarness(
      `store calls = 0
store flag = true
function shown()
  calls = calls + 1
  return flag
end
layout settings with
  slider "Volume" #displayed={shown()} #value=40
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const vs = (h.game.story as any).variablesState;
    const ui = (): any[] => h.snapshotFiltered("ui/").map((m: any) => m);
    const label = ui().find(
      (m) => m.method === "ui/create" && m.params.type === "label",
    ).params;
    const input = ui().find(
      (m) => m.method === "ui/create" && m.params.type === "input",
    ).params;
    expect(vs.$("calls")).toBe(1);
    expect(label.style?.displayed).toBe("true");
    expect(input.style?.displayed).toBeUndefined();

    const seen = ui().length;
    vs.$("flag", false);
    (h.game.module.ui as any).refreshLayouts();
    expect(vs.$("calls")).toBe(2);
    const hidden = ui()
      .slice(seen)
      .filter(
        (m) => m.method === "ui/update" && m.params.style?.displayed === "false",
      );
    expect(hidden.map((m) => m.params.element)).toEqual([label.element]);
  });

  test("a widget that is not interactable is so as a whole", async () => {
    const h = createHarness(
      `store locked = true
layout settings with
  checkbox "Locked checkbox" #interactable={not locked}
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const ui = (): any[] => h.snapshotFiltered("ui/").map((m: any) => m);
    const label = ui().find(
      (m) => m.method === "ui/create" && m.params.type === "label",
    ).params;
    const input = ui().find(
      (m) => m.method === "ui/create" && m.params.type === "input",
    ).params;
    // The label's wording would otherwise activate the control natively. The
    // control inherits the label's pointer setting through its builtin style
    // (`field_label` and `toggle_label` in builtins.sd).
    expect(label.style?.interactable).toBe("false");
    expect(input.name).toBe("control");
    expect(input.style?.interactable).toBeUndefined();

    const seen = ui().length;
    (h.game.story as any).variablesState.$("locked", false);
    (h.game.module.ui as any).refreshLayouts();
    const unlocked = ui()
      .slice(seen)
      .filter(
        (m) => m.method === "ui/update" && m.params.style?.interactable === "true",
      );
    expect(unlocked.map((m) => m.params.element)).toEqual([label.element]);
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

  test("a labelled widget's order and growth place its label in the row", async () => {
    const h = createHarness(
      `store first = 2
layout settings with
  row {
    slider "A" #order={first} #grow=1 #value=20
    slider "B" #order=1 #value=80
  }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const ui = (): any[] => h.snapshotFiltered("ui/").map((m: any) => m);
    const labels = ui()
      .filter((m) => m.method === "ui/create" && m.params.type === "label")
      .map((m) => m.params);
    const inputs = ui()
      .filter((m) => m.method === "ui/create" && m.params.type === "input")
      .map((m) => m.params);
    expect(labels.map((l) => l.style?.order)).toEqual(["2", "1"]);
    expect(labels[0].style?.grow).toBe("1");
    expect(inputs.map((i) => i.style?.order)).toEqual([undefined, undefined]);
    expect(inputs[0].style?.grow).toBeUndefined();

    const seen = ui().length;
    (h.game.story as any).variablesState.$("first", 0);
    (h.game.module.ui as any).refreshLayouts();
    const reordered = ui()
      .slice(seen)
      .filter((m) => m.method === "ui/update" && m.params.style?.order === "0");
    expect(reordered.map((m) => m.params.element)).toEqual([labels[0].element]);
  });

  test("every spelling of a placement prop places the label", async () => {
    const h = createHarness(
      `layout settings with
  column {
    checkbox "A" #self-align=end #position=absolute #i-l=40 #m-t=8
    checkbox "B" #align-self=end #left=40 #margin-top=8
  }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const labels = createdOfType(h, "label");
    const inputs = createdOfType(h, "input");
    expect(labels[0].style).toMatchObject({
      "self-align": "end",
      position: "absolute",
      "i-l": "40",
      "m-t": "8",
    });
    expect(labels[1].style).toMatchObject({
      "align-self": "end",
      left: "40",
      "margin-top": "8",
    });
    for (const input of inputs) {
      for (const prop of ["self-align", "align-self", "i-l", "left", "m-t", "margin-top", "position"]) {
        expect(input.style?.[prop], prop).toBeUndefined();
      }
    }
  });

  test("a placement prop keeps its transition on the label", async () => {
    const h = createHarness(
      `store offset = 0
layout settings with
  checkbox "Move me" #margin-left={offset} #transition-property="margin-left" #transition-duration="2s"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const [label] = createdOfType(h, "label");
    const [input] = createdOfType(h, "input");
    expect(label.style).toMatchObject({
      "margin-left": "0",
      "transition-property": "margin-left",
      "transition-duration": "2s",
    });
    expect(input.style?.["margin-left"]).toBeUndefined();
    expect(input.style?.["transition-duration"]).toBeUndefined();
  });

  // `#translate` is not among them: `translate` is an HTML attribute, so the
  // prop is one on every element. A style's `translate` reaches the label as a
  // class does.
  test("a labelled widget's opacity, transforms, width and animation act on all of it", async () => {
    const h = createHarness(
      `store fade = 0.5
layout settings with
  slider "Styled" #opacity={fade} #rotate="5deg" #scale=2 #width="40%" #animation="spin 1s" #value=5
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const ui = (): any[] => h.snapshotFiltered("ui/").map((m: any) => m);
    const [label] = createdOfType(h, "label");
    const [input] = createdOfType(h, "input");
    const props = {
      opacity: "0.5",
      rotate: "5deg",
      scale: "2",
      width: "40%",
      animation: "spin 1s",
    };
    expect(label.style).toMatchObject(props);
    for (const prop of Object.keys(props)) {
      expect(input.style?.[prop], prop).toBeUndefined();
    }

    const seen = ui().length;
    (h.game.story as any).variablesState.$("fade", 1);
    (h.game.module.ui as any).refreshLayouts();
    const faded = ui()
      .slice(seen)
      .filter((m) => m.method === "ui/update" && m.params.style?.opacity === "1");
    expect(faded.map((m) => m.params.element)).toEqual([label.element]);
  });

  test("a class on a labelled widget reaches its label and control", async () => {
    const h = createHarness(
      `style concealed with
  displayed = false
end
layout settings with
  slider.concealed "Secret volume" #value=5
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const all = creates(h);
    const classed = all.filter((p) => p.name?.split(" ").includes("concealed"));
    // One element carries the class, and it holds both the wording and the
    // control, so the style hides them together.
    expect(classed).toHaveLength(1);
    const [outer] = classed;
    expect(textsUnder(h, outer.element)).toEqual(["Secret volume"]);
    const [input] = createdOfType(h, "input");
    expect(input.parent).toBe(outer.element);
  });

  test("a labelled widget is found by its name", async () => {
    const h = createHarness(
      `layout settings with
  checkbox.big "Big box"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const [label] = createdOfType(h, "label");
    expect(label.name).toBe("checkbox big label toggle_label");
    // The control inside it is named `control`, so the widget's name finds the
    // label alone.
    const found = (h.game.module.ui as any)
      .findElements("checkbox big")
      .map((el: any) => el.name);
    expect(found).toEqual(["checkbox big label toggle_label"]);
  });

  test("style props act on the widget; attributes, bindings and write-back on the control", async () => {
    const h = createHarness(
      `store volume = 80
layout settings with
  slider "Master Volume" #min=0 #max=100 #value={volume} #background-color="red" #margin-bottom=18 @input={ volume = event.value }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const [input] = createdOfType(h, "input");
    expect(input.attributes).toMatchObject({ min: "0", max: "100", value: "80" });
    const [label] = createdOfType(h, "label");
    expect(label.style?.["background-color"]).toBe("red");
    expect(input.style?.["background-color"]).toBeUndefined();
    expect(label.style?.["margin-bottom"]).toBe("18");
    expect(input.style?.["margin-bottom"]).toBeUndefined();
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
