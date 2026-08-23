// Layout directives that tore down more than they were asked to, or less.
//
// Both fail live and self-heal on restore, so a serialized-state assertion
// agrees with the buggy run — the DOM is the only witness.

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const drive = async (h: any, instant = true) => {
  const beat = h.nextBeat();
  if (beat) {
    await h.display(beat, instant);
    await flushMicrotasks();
  }
  return beat;
};

describe("navigate never closes `main`", () => {
  // `[[navigate to menu]]` parses with an EMPTY screen — `to` is consumed as
  // the keyword — so the screen filter collapsed to `n !== name` and handed
  // `main` to `closeLayout`, tearing down textbox / stage / portrait / choices
  // mid-session. `saveLayoutState.recordOpen` already spared `main`; the
  // runtime path had forgotten the same invariant.
  const SOURCE = `layout main with
  textbox:
    dialogue:
      text
end
layout menu with
  text "Menu"
end
-> start
scene start
  [[navigate to menu]]
  Hello.
end
`;

  test("an unscoped navigate leaves `main` mounted", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    const ui: any = h.game.module.ui;
    expect(ui._mountedLayouts.has("main")).toBe(true);

    h.reset();
    await drive(h); // the [[navigate …]] beat

    // The target opened…
    expect(ui._mountedLayouts.has("menu")).toBe(true);
    // …and the primary subtree is still there.
    expect(ui._mountedLayouts.has("main")).toBe(true);
  });
});

describe("close and open of the SAME layout in one beat", () => {
  // Directives fold into serialized state sequentially but used to dispatch
  // through one `Promise.all`. `openLayout` tests `_mountedLayouts.has(name)`
  // synchronously, so it no-opped while the close's exit was still awaiting —
  // and the close then removed the layout. The state said open; the DOM
  // disagreed.
  //
  // The close needs a real EXIT TRANSITION for the window to exist at all: an
  // instant close resolves before the open is dispatched, so the same source
  // passes either way. That is exactly why this is a live-only defect — every
  // fast path hides it.
  const SOURCE = `layout main with
  textbox:
    dialogue:
      text
end
layout hud with
  text "HUD"
end
-> start
scene start
  [[open hud]]
  Hello.
  [[close hud with fade over 0.5s]] [[open hud]]
  Bye.
end
`;

  test("the layout ends the beat mounted", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    const ui: any = h.game.module.ui;

    h.reset();
    await drive(h); // [[open hud]]
    expect(ui._mountedLayouts.has("hud")).toBe(true);
    await drive(h); // "Hello."
    await drive(h, /* instant */ false); // [[close hud …]] [[open hud]]

    expect(ui._mountedLayouts.has("hud")).toBe(true);
  });
});

describe("navigate is a barrier across DIFFERENT layout names", () => {
  // `navigateScreen` computes what to tear down from a live read of the whole
  // `_mountedLayouts` set, so racing it against a concurrently-running open
  // for another name made the outcome timing-dependent: whether the navigate
  // saw (and closed) the freshly-opened layout depended on how far the other
  // group's await chain had progressed (#370). Navigate now runs as a
  // barrier, so the outcome is deterministic in authored order.
  const SOURCE = `layout main with
  textbox:
    dialogue:
      text
end
layout hud with
  text "HUD"
end
layout menu with
  text "Menu"
end
-> start
scene start
  [[open hud with fade over 0.5s]] [[navigate to menu]]
  Hello.
end
`;

  test("an open before a navigate settles first and is then replaced by it", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    const ui: any = h.game.module.ui;

    h.reset();
    // NOT instant: the open's entry transition is what used to leave the race
    // window — an instant run resolves everything in dispatch order and
    // passes with or without the barrier.
    await drive(h, /* instant */ false);

    // Deterministic authored-order semantics: the open completed, and the
    // navigate — which replaces the screen stack — then closed it.
    expect(ui._mountedLayouts.has("menu")).toBe(true);
    expect(ui._mountedLayouts.has("hud")).toBe(false);
    // The navigate exemption still holds.
    expect(ui._mountedLayouts.has("main")).toBe(true);
  });
});
