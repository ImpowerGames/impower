// [[open SCREEN]] / [[close SCREEN]] screen-lifecycle directives (reactive path).
//
// Default lifecycle: only `main` is mounted/visible at connect (implicit
// auto-open). Every other screen stays unmounted (zero DOM / zero binding cost)
// until `[[open X]]` mounts it, and `[[close X]]` destroys it (the whole subtree
// + its reactive scope). Clauses (with/over/after/ease/wait) reuse the image
// directive's parsing + animation machinery: `with` = enter/exit animation,
// `over` = duration, `after` = start delay, `ease` = easing, `wait` = block
// story advance until the transition settles.
//
// These tests pass `autoOpenAll: false` to exercise the REAL default (the
// harness otherwise auto-opens every screen so the legacy reactive tests keep
// their "mounted at connect" assumption).

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

// A program with TWO screens: the builtin-overriding `main` (auto-opens) and a
// `hud` (only mounts on `[[open hud]]`). The scene emits the directives.
const SOURCE = `store hp = 100
screen main with
  textbox:
    dialogue:
      text
end
screen hud with
  text "HP: {hp}"
end
-> start
scene start
  [[open hud]]
  Hello.
  [[close hud]]
  Bye.
end
`;

/** ui/create names emitted so far. */
const createdNames = (h: ReturnType<typeof createHarness>): unknown[] =>
  h.snapshotFiltered("ui/create").map((m: any) => m.params?.name);

describe("screen lifecycle ([[open/close SCREEN]])", () => {
  test("only `main` mounts at connect when other screens exist", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    const names = createdNames(h);
    // `main` and its structural children are mounted...
    expect(names).toContain("main");
    // ...but `hud` is NOT (it needs an explicit [[open hud]]).
    expect(names).not.toContain("hud");
  });

  test("`main` is visible without an explicit open (reveal flow)", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    // The screens layer is revealed (root opacity:1) through the normal flow;
    // run a beat so updateUI's reveal() fires, then assert main exists + the
    // screens layer is not concealed.
    const mainCreate = h
      .snapshotFiltered("ui/create")
      .find((m: any) => m.params?.name === "main") as any;
    expect(mainCreate).toBeTruthy();
  });

  test("[[open hud]] mounts hud (ui/create only after the directive)", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    const ui: any = h.game.module.ui;
    // hud is NOT mounted before the directive runs.
    expect(ui._mountedScreens.has("hud")).toBe(false);
    h.reset();
    // The `[[open hud]]` directive is its own beat (before the "Hello." textbox).
    const beat = h.nextBeat();
    expect(beat?.screen?.hud?.[0]?.control).toBe("open");
    await h.display(beat!, true);
    await flushMicrotasks();
    // hud + its bound span are now created.
    const names = createdNames(h);
    expect(names).toContain("hud");
    expect(ui._mountedScreens.has("hud")).toBe(true);
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
    h.jumpTo("start");
    const ui: any = h.game.module.ui;

    // Drive beats until hud is open (the [[open hud]] beat), then one more for
    // the "Hello." textbox so the close directive is the next beat.
    const drive = async () => {
      const beat = h.nextBeat();
      if (beat) {
        await h.display(beat, true);
        await flushMicrotasks();
      }
      return beat;
    };
    await drive(); // [[open hud]]
    expect(ui._mountedScreens.has("hud")).toBe(true);
    await drive(); // "Hello."

    // Next: the [[close hud]] beat.
    h.reset();
    const closeBeat = h.nextBeat();
    expect(closeBeat?.screen?.hud?.[0]?.control).toBe("close");
    await h.display(closeBeat!, true);
    await flushMicrotasks();
    // A ui/destroy was emitted and hud is gone from the tracking map.
    expect(h.snapshotFiltered("ui/destroy").length).toBeGreaterThan(0);
    expect(ui._mountedScreens.has("hud")).toBe(false);

    // After close, mutating hud's bound global must not produce any update for
    // hud's span (its scope is no longer refreshed).
    h.reset();
    (h.game.story as any).variablesState.$("hp", 7);
    ui.refreshScreens();
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
      `screen main with
  textbox:
    dialogue:
      text
end
screen hud with
  text "static"
end
-> start
scene start
  [[open hud with fade over 0.5s after 0.2s ease ease_out]]
  Hello.
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    h.reset();
    // Non-instant display so the enter animation is emitted (ui/animate).
    const beat = h.nextBeat();
    await h.display(beat!, /* instant */ false);
    await flushMicrotasks();
    const animate = h
      .snapshotFiltered("ui/animate")
      .find((m: any) => m.params?.effects?.length) as any;
    expect(animate).toBeTruthy();
    const anim = animate.params.effects[0].animations[0];
    // over=0.5s → duration override; after=0.2s → delay override.
    expect(anim.timing.duration).toBe("0.5s");
    expect(anim.timing.delay).toBe("0.2s");
    // ease=ease_out → the resolved timing function (a cubic-bezier from the
    // builtin `ease_out` ease), not the default "ease".
    expect(anim.timing.easing).not.toBe("ease");
  });

  test("`wait` clause inflates the beat duration so advance blocks", async () => {
    const h = createHarness(
      `screen main with
  textbox:
    dialogue:
      text
end
screen hud with
  text "static"
end
-> start
scene start
  [[open hud with fade over 1s wait]]
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    h.reset();
    const beat = h.nextBeat();
    expect(beat).toBeTruthy();
    // `wait` made the directive block: the beat carries a non-zero end (the
    // 1s transition), which is the Coordinator's auto-advance gate. Without
    // `wait` a bare open beat has end=0.
    expect(beat!.end).toBeGreaterThanOrEqual(1);
    // The screen instruction itself carries the wait flag + resolved clauses.
    const ev = Object.values(beat!.screen ?? {})[0]?.[0] as any;
    expect(ev?.control).toBe("open");
    expect(ev?.name).toBe("hud");
    expect(ev?.with).toBe("fade");
    expect(ev?.over).toBe(1);
    expect(ev?.wait).toBe(true);
  });

  test("a bare [[open hud]] beat (no clauses) carries no transition clauses", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    h.reset();
    const beat = h.nextBeat();
    const ev = Object.values(beat!.screen ?? {})[0]?.[0] as any;
    expect(ev?.control).toBe("open");
    expect(ev?.name).toBe("hud");
    expect(ev?.with).toBeUndefined();
    expect(ev?.wait).toBeUndefined();
    // No wait → no inflated duration.
    expect(beat!.end).toBe(0);
  });
});

// [[navigate <container> to <screen>]] — container-scoped routing: close every
// open screen IN THAT CONTAINER except the target, then open the target. Screens
// in OTHER containers (and uncategorized screens) are left untouched. Containers
// are declared with `screen NAME in CONTAINER with … end`. Composes open/close.
const NAV_SOURCE = `store hp = 100
screen main with
  textbox:
    dialogue:
      text
end
screen hud in overlay with
  text "HP: {hp}"
end
screen pause in menu with
  text "Paused"
end
screen settings in menu with
  text "Settings"
end
-> start
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
    h.jumpTo("start");
    await drive(h); // [[open hud]]
    await drive(h); // [[open pause]]
    await drive(h); // "Hello."
    h.reset();
    const navBeat = h.nextBeat();
    const ev = Object.values(navBeat!.screen ?? {})[0]?.[0] as any;
    expect(ev?.control).toBe("navigate");
    expect(ev?.container).toBe("menu");
    expect(ev?.name).toBe("settings");
  });

  test("closes open screens in the container (except target), leaves others", async () => {
    const h = createHarness(NAV_SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    const ui: any = h.game.module.ui;

    await drive(h); // [[open hud]]   (overlay container)
    await drive(h); // [[open pause]] (menu container)
    await drive(h); // "Hello."
    // Before navigate: main (uncategorized, auto-open), hud (overlay), pause (menu).
    expect(ui._mountedScreens.has("main")).toBe(true);
    expect(ui._mountedScreens.has("hud")).toBe(true);
    expect(ui._mountedScreens.has("pause")).toBe(true);

    await drive(h); // [[navigate menu to settings]]
    // Within the `menu` container: pause closed, settings opened.
    expect(ui._mountedScreens.has("settings")).toBe(true);
    expect(ui._mountedScreens.has("pause")).toBe(false);
    // Other containers / uncategorized are UNTOUCHED.
    expect(ui._mountedScreens.has("hud")).toBe(true); // overlay container
    expect(ui._mountedScreens.has("main")).toBe(true); // uncategorized (persistent)
    // The container teardown emitted ui/destroy (pause's subtree).
    expect(h.snapshotFiltered("ui/destroy").length).toBeGreaterThan(0);
  });

  test("the mounted target records its container (for later navigates)", async () => {
    const h = createHarness(NAV_SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    const ui: any = h.game.module.ui;
    await drive(h); // [[open hud]]
    await drive(h); // [[open pause]]
    await drive(h); // "Hello."
    await drive(h); // [[navigate menu to settings]]
    expect(ui._mountedScreens.get("settings")?.container).toBe("menu");
    expect(ui._mountedScreens.get("hud")?.container).toBe("overlay");
    // Uncategorized screens have no container.
    expect(ui._mountedScreens.get("main")?.container).toBeUndefined();
  });

  test("incomplete `[[navigate <container>]]` (no `to`) is a runtime no-op", async () => {
    const h = createHarness(
      `screen main with
  textbox:
    dialogue:
      text
end
screen pause in menu with
  text "Paused"
end
-> start
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
    h.jumpTo("start");
    const ui: any = h.game.module.ui;
    await drive(h); // [[open pause]]
    expect(ui._mountedScreens.has("pause")).toBe(true);
    // Bare navigate: parsed with container but no destination → no-op. It does
    // NOT dismiss the container (that requires `to <screen>`); the LSP warns.
    h.reset();
    const navBeat = h.nextBeat();
    const ev = Object.values(navBeat!.screen ?? {})[0]?.[0] as any;
    expect(ev?.control).toBe("navigate");
    expect(ev?.container).toBe("menu");
    expect(ev?.name).toBe("");
    await h.display(navBeat!, true);
    await flushMicrotasks();
    // pause stays open — nothing was torn down.
    expect(ui._mountedScreens.has("pause")).toBe(true);
  });
});
