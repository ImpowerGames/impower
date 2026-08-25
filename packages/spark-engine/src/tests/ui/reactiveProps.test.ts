// Inline `#prop=value` on a GENERIC element (row/column/box/…) → an inline
// STYLE on the emitted create/update messages (spec §4.2: "the inline
// equivalent of a style rule"). The widget mounters route props to attributes;
// a plain container/leaf routes them to `style`, so the renderer de-aliases +
// prop→CSS + px-ifies them (getCssEquivalent).
//
// NOTE (known upstream limitation): the element-line LOWERER currently only
// captures inline props on UNCLASSED elements — a class in the header
// (`row.hud #gap=12`) drops both the class and the props at parse time, and the
// adjacency-content path hardcodes `classes: []`. That is a separate
// grammar/lowerer bug (tracked); these tests cover the engine-side application
// of props that DO reach the AST (unclassed elements), which is the piece the
// engine owns.

import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

const evalGlobal = (h: UIHarness, name: string): unknown =>
  (h.game.story as any).variablesState.$(name);

const createsNamed = (h: UIHarness, tag: string): any[] =>
  h
    .snapshotFiltered("ui/create")
    .filter((m: any) => String(m.params?.name ?? "").split(" ")[0] === tag);

describe("inline props on generic elements", () => {
  test("static #prop becomes an inline style on the create message", async () => {
    const h = createHarness(
      `layout main with
  row #gap=20 #background-color=darkred:
    text "A"
end
`,
      0,
      { reactive: true } as any,
    );
    await h.ready;
    const row = createsNamed(h, "row").find((m) => m.params?.style);
    expect(row).toBeTruthy();
    // Sparkle names are passed through as-authored; the renderer de-aliases +
    // px-ifies (getCssEquivalent). `#gap=20` → "20" (renderer → 20px).
    expect(row.params.style).toMatchObject({
      gap: "20",
      "background-color": "darkred",
    });
  });

  test("a space-separated class and inline props coexist on the same element", async () => {
    // Classes are SPACE-separated bare words after the tag (`column panel`), not
    // dot-prefixed. The class must survive alongside inline props: the element's
    // name carries `column panel` AND its style carries the props.
    const h = createHarness(
      `layout main with
  column panel #gap=16 #background-color=navy:
    text title "Hi"
end
`,
      0,
      { reactive: true } as any,
    );
    await h.ready;
    const panel = createsNamed(h, "column").find(
      (m) => String(m.params?.name) === "column panel",
    );
    expect(panel).toBeTruthy();
    expect(panel.params.style).toMatchObject({
      gap: "16",
      "background-color": "navy",
    });
    // The classed leaf keeps its class too.
    const title = createsNamed(h, "text").find(
      (m) => String(m.params?.name) === "text title",
    );
    expect(title).toBeTruthy();
  });

  test("a reactive #prop re-applies via ui/update when its dep changes", async () => {
    const h = createHarness(
      `store bg = "blue"
function setbg()
  bg = "green"
end
layout main with
  box #background-color={bg}:
    text "C"
  button "x" @click=setbg
end
`,
      0,
      { reactive: true } as any,
    );
    await h.ready;
    const box = createsNamed(h, "box").find((m) => m.params?.style);
    expect(box).toBeTruthy();
    // The reactive prop's initial value is resolved into the create style.
    expect(box.params.style).toMatchObject({ "background-color": "blue" });

    // Fire the click handler → bg = "green" → the box's reactive style
    // re-resolves and re-applies via ui/update.
    const obs = h.observedElementIds();
    expect(obs[0]).toBeTruthy();
    h.emitEvent("click", obs[0]!, {});
    expect(evalGlobal(h, "bg")).toBe("green");

    // A style update carrying the new background-color must be emitted (asserted
    // id-independently — the box's reactive-style entry re-applies the prop).
    const styleUpdates = h
      .snapshotFiltered("ui/update")
      .filter((m: any) => m.params?.style?.["background-color"] === "green");
    expect(styleUpdates.length).toBeGreaterThan(0);
  });
});
