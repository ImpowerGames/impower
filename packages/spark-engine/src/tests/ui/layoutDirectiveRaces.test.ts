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
  const SOURCE = `layout main with
  textbox {
    dialogue {
      text
    }
  }
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
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;
    expect(ui._mountedLayouts.has("main")).toBe(true);

    h.reset();
    await drive(h);

    expect(ui._mountedLayouts.has("menu")).toBe(true);
    expect(ui._mountedLayouts.has("main")).toBe(true);
  });
});

describe("close and open of the SAME layout in one beat", () => {
  const SOURCE = `layout main with
  textbox {
    dialogue {
      text
    }
  }
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
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;

    h.reset();
    await drive(h);
    expect(ui._mountedLayouts.has("hud")).toBe(true);
    await drive(h);
    await drive(h, false);

    expect(ui._mountedLayouts.has("hud")).toBe(true);
  });
});

describe("navigate is a barrier across DIFFERENT layout names", () => {
  const SOURCE = `layout main with
  textbox {
    dialogue {
      text
    }
  }
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
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;

    h.reset();
    await drive(h, false);

    expect(ui._mountedLayouts.has("menu")).toBe(true);
    expect(ui._mountedLayouts.has("hud")).toBe(false);
    expect(ui._mountedLayouts.has("main")).toBe(true);
  });
});
