import { describe, expect, test } from "vitest";
import {
  createHarness,
  flushMicrotasks,
  MAIN_URI,
} from "./harness/uiTestHarness";

const SOURCE = `store hp = 100
layout main with
  textbox {
    dialogue {
      text
    }
  }
end
layout hud with
  text "HP: {hp}"
end

scene start
  [[open hud]]
  Hello.
  [[close hud]]
  Bye.
end
`;

const createdNames = (h: ReturnType<typeof createHarness>): unknown[] =>
  h.snapshotFiltered("ui/create").map((m: any) => m.params?.name);

describe("screen lifecycle ([[open/close SCREEN]])", () => {
  test("only `main` mounts at connect when other screens exist", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    const names = createdNames(h);
    expect(names).toContain("main");
    expect(names).not.toContain("hud");
  });

  test("`main` is visible without an explicit open (reveal flow)", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    const mainCreate = h
      .snapshotFiltered("ui/create")
      .find((m: any) => m.params?.name === "main") as any;
    expect(mainCreate).toBeTruthy();
  });

  test("[[open hud]] mounts hud (ui/create only after the directive)", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;
    expect(ui._mountedLayouts.has("hud")).toBe(false);
    h.reset();
    const beat = h.nextBeat();
    expect(beat?.layout?.["hud"]?.[0]?.control).toBe("open");
    await h.display(beat!, true);
    await flushMicrotasks();
    const names = createdNames(h);
    expect(names).toContain("hud");
    expect(ui._mountedLayouts.has("hud")).toBe(true);
    const span = h
      .snapshotFiltered("ui/create")
      .find(
        (m: any) =>
          m.params?.type === "span" &&
          typeof m.params?.content?.text === "string" &&
          m.params.content.text.startsWith("HP:"),
      ) as any;
    expect(span?.params?.content?.text).toBe("HP: 100");
  });

  test("[[close hud]] destroys it (ui/destroy; its scope no longer refreshes)", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;

    const drive = async () => {
      const beat = h.nextBeat();
      if (beat) {
        await h.display(beat, true);
        await flushMicrotasks();
      }
      return beat;
    };
    await drive();
    expect(ui._mountedLayouts.has("hud")).toBe(true);
    await drive();

    h.reset();
    const closeBeat = h.nextBeat();
    expect(closeBeat?.layout?.["hud"]?.[0]?.control).toBe("close");
    await h.display(closeBeat!, true);
    await flushMicrotasks();
    expect(h.snapshotFiltered("ui/destroy").length).toBeGreaterThan(0);
    expect(ui._mountedLayouts.has("hud")).toBe(false);

    h.reset();
    (h.game.story as any).variablesState.$("hp", 7);
    ui.refreshLayouts();
    const hudUpdate = h
      .snapshotFiltered("ui/update")
      .find(
        (m: any) =>
          typeof m.params?.content?.text === "string" &&
          m.params.content.text.startsWith("HP:"),
      );
    expect(hudUpdate).toBeUndefined();
  });

  test("clauses (with/over/after/ease) reach the enter animation", async () => {
    const h = createHarness(
      `layout main with
  textbox {
    dialogue {
      text
    }
  }
end
layout hud with
  text "static"
end

scene start
  [[open hud with fade over 0.5s after 0.2s ease ease_out]]
  Hello.
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpToFlow("start");
    h.reset();
    const beat = h.nextBeat();
    await h.display(beat!, false);
    await flushMicrotasks();
    const animate = h
      .snapshotFiltered("ui/animate")
      .find((m: any) => m.params?.effects?.length) as any;
    expect(animate).toBeTruthy();
    const anim = animate.params.effects[0].animations[0];
    expect(anim.timing.duration).toBe("0.5s");
    expect(anim.timing.delay).toBe("0.2s");
    expect(anim.timing.easing).not.toBe("ease");
  });

  test("`wait` clause inflates the beat duration so advance blocks", async () => {
    const h = createHarness(
      `layout main with
  textbox {
    dialogue {
      text
    }
  }
end
layout hud with
  text "static"
end

scene start
  [[open hud with fade over 1s wait]]
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpToFlow("start");
    h.reset();
    const beat = h.nextBeat();
    expect(beat).toBeTruthy();
    expect(beat!.end).toBeGreaterThanOrEqual(1);
    const ev = Object.values(beat!.layout ?? {})[0]?.[0] as any;
    expect(ev?.control).toBe("open");
    expect(ev?.name).toBe("hud");
    expect(ev?.with).toBe("fade");
    expect(ev?.over).toBe(1);
    expect(ev?.wait).toBe(true);
  });

  test("a bare [[open hud]] beat (no clauses) carries no transition clauses", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpToFlow("start");
    h.reset();
    const beat = h.nextBeat();
    const ev = Object.values(beat!.layout ?? {})[0]?.[0] as any;
    expect(ev?.control).toBe("open");
    expect(ev?.name).toBe("hud");
    expect(ev?.with).toBeUndefined();
    expect(ev?.wait).toBeUndefined();
    expect(beat!.end).toBe(0);
  });
});

const NAV_SOURCE = `store hp = 100
layout main with
  textbox {
    dialogue {
      text
    }
  }
end
screen overlay with
end
screen menu with
end
layout hud in overlay with
  text "HP: {hp}"
end
layout pause in menu with
  text "Paused"
end
layout settings in menu with
  text "Settings"
end

scene start
  [[open hud]]
  [[open pause]]
  Hello.
  [[navigate menu to settings]]
  Bye.
end
`;

describe("screen navigation ([[navigate <container> to <screen>]])", () => {
  const drive = async (h: ReturnType<typeof createHarness>) => {
    const beat = h.nextBeat();
    if (beat) {
      await h.display(beat, true);
      await flushMicrotasks();
    }
    return beat;
  };

  test("parses as control=navigate, container=<first>, name=<after `to`>", async () => {
    const h = createHarness(NAV_SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpToFlow("start");
    await drive(h);
    await drive(h);
    await drive(h);
    h.reset();
    const navBeat = h.nextBeat();
    const ev = Object.values(navBeat!.layout ?? {})[0]?.[0] as any;
    expect(ev?.control).toBe("navigate");
    expect(ev?.screen).toBe("menu");
    expect(ev?.name).toBe("settings");
  });

  test("closes open screens in the container (except target), leaves others", async () => {
    const h = createHarness(NAV_SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;

    await drive(h);
    await drive(h);
    await drive(h);
    expect(ui._mountedLayouts.has("main")).toBe(true);
    expect(ui._mountedLayouts.has("hud")).toBe(true);
    expect(ui._mountedLayouts.has("pause")).toBe(true);

    await drive(h);
    expect(ui._mountedLayouts.has("settings")).toBe(true);
    expect(ui._mountedLayouts.has("pause")).toBe(false);
    expect(ui._mountedLayouts.has("hud")).toBe(true);
    expect(ui._mountedLayouts.has("main")).toBe(true);
    expect(h.snapshotFiltered("ui/destroy").length).toBeGreaterThan(0);
  });

  test("the mounted target records its container (for later navigates)", async () => {
    const h = createHarness(NAV_SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;
    await drive(h);
    await drive(h);
    await drive(h);
    await drive(h);
    expect(ui._mountedLayouts.get("settings")?.screen).toBe("menu");
    expect(ui._mountedLayouts.get("hud")?.screen).toBe("overlay");
    expect(ui._mountedLayouts.get("main")?.screen).toBeUndefined();
  });

  test("incomplete `[[navigate <container>]]` (no `to`) is a runtime no-op", async () => {
    const h = createHarness(
      `layout main with
  textbox {
    dialogue {
      text
    }
  }
end
layout pause in menu with
  text "Paused"
end

scene start
  [[open pause]]
  [[navigate menu]]
  Hello.
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;
    await drive(h);
    expect(ui._mountedLayouts.has("pause")).toBe(true);
    h.reset();
    const navBeat = h.nextBeat();
    const ev = Object.values(navBeat!.layout ?? {})[0]?.[0] as any;
    expect(ev?.control).toBe("navigate");
    expect(ev?.screen).toBe("menu");
    expect(ev?.name).toBe("");
    await h.display(navBeat!, true);
    await flushMicrotasks();
    expect(ui._mountedLayouts.has("pause")).toBe(true);
  });
});

describe("screen scrub/restore (reactive screens survive checkpoint restore)", () => {
  const drive = async (h: ReturnType<typeof createHarness>) => {
    const beat = h.nextBeat();
    if (beat) {
      await h.display(beat, true);
      await flushMicrotasks();
    }
    return beat;
  };

  test("openLayout records the open set into serialized UIState (_state.layout)", async () => {
    const h = createHarness(NAV_SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;
    expect(ui._state.layout ?? []).toEqual([]);
    await drive(h);
    await drive(h);
    expect(ui._state.layout).toEqual([
      { name: "hud", screen: "overlay" },
      { name: "pause", screen: "menu" },
    ]);
  });

  test("closeLayout removes it from the serialized set", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;
    await drive(h);
    expect(ui._state.layout).toEqual([{ name: "hud" }]);
    await drive(h);
    await drive(h);
    expect(ui._state.layout).toEqual([]);
  });

  test("navigate leaves the set as the destination (closed source dropped)", async () => {
    const h = createHarness(NAV_SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;
    await drive(h);
    await drive(h);
    await drive(h);
    await drive(h);
    expect(ui._state.layout).toEqual([
      { name: "hud", screen: "overlay" },
      { name: "settings", screen: "menu" },
    ]);
  });

  test("a checkpoint restore re-mounts the open screens (the scrub fix)", async () => {
    const h1 = createHarness(NAV_SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h1.ready;
    h1.jumpToFlow("start");
    await drive(h1);
    await drive(h1);
    const ui1: any = h1.game.module.ui;
    expect(ui1._mountedLayouts.has("hud")).toBe(true);
    expect(ui1._mountedLayouts.has("pause")).toBe(true);
    const cp = h1.game.save();
    expect(typeof cp).toBe("string");

    const h2 = createHarness(NAV_SOURCE, 0, {
      reactive: true,
      autoOpenAll: false,
      loadCheckpoint: cp as string,
    });
    await h2.ready;
    const ui2: any = h2.game.module.ui;
    expect(ui2._mountedLayouts.has("main")).toBe(true);
    expect(ui2._mountedLayouts.has("hud")).toBe(true);
    expect(ui2._mountedLayouts.has("pause")).toBe(true);
  });

  test("restore after navigate shows the destination, not the closed source", async () => {
    const h1 = createHarness(NAV_SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h1.ready;
    h1.jumpToFlow("start");
    await drive(h1);
    await drive(h1);
    await drive(h1);
    await drive(h1);
    const cp = h1.game.save();

    const h2 = createHarness(NAV_SOURCE, 0, {
      reactive: true,
      autoOpenAll: false,
      loadCheckpoint: cp as string,
    });
    await h2.ready;
    const ui2: any = h2.game.module.ui;
    expect(ui2._mountedLayouts.has("hud")).toBe(true);
    expect(ui2._mountedLayouts.has("settings")).toBe(true);
    expect(ui2._mountedLayouts.has("pause")).toBe(false);
  });

  test("UNCONNECTED route simulation records the open-set (real production scrub path)", async () => {
    const h1 = createHarness(NAV_SOURCE, 0, { connect: false });
    const g1: any = h1.game;
    g1.setStartFrom({ file: MAIN_URI, line: 27 });
    g1.simulate();
    expect(g1.module.ui._reactive).toBe(false);
    expect(g1.module.ui._state.layout).toEqual([
      { name: "hud", screen: "overlay" },
      { name: "settings", screen: "menu" },
    ]);
    const cp = g1.save();
    expect(typeof cp).toBe("string");

    const h2 = createHarness(NAV_SOURCE, 0, {
      autoOpenAll: false,
      loadCheckpoint: cp as string,
    });
    await h2.ready;
    const ui2: any = h2.game.module.ui;
    expect(ui2._mountedLayouts.has("hud")).toBe(true);
    expect(ui2._mountedLayouts.has("settings")).toBe(true);
    expect(ui2._mountedLayouts.has("pause")).toBe(false);
  });
});
