// Side-effect import FIRST: the inkjs engine has a Container/Value/Object
// module cycle, and importing UIModule cold lets Object.ts load first, which
// makes `Container extends InkObject` see undefined.
import "@impower/sparkdown/src/inkjs/engine/Container";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, it } from "vitest";
import { createHarness, flushMicrotasks } from "../ui/harness/uiTestHarness";
import { UIModule } from "../../game/modules/ui/classes/UIModule";

// The `loading` layout is engine-managed: `load` beats drive it, nothing
// else moves it, and a preview never shows it.

const ASSETS: File[] = [
  {
    uri: "file://proj/room.png",
    type: "image",
    name: "room",
    ext: "png",
    src: "/file:/proj/room.png?v=1",
  },
];

const STORY = `layout menu with
  text "Menu"
end

scene A
  Hi there.
  -> load B
end

scene B
  [[show backdrop room]]
  Line three.
  done
end
`;

describe("the loading layout", () => {
  it("is what `-> load` lowers to: a load beat before the divert", async () => {
    const h = createHarness(STORY, 0, { assets: ASSETS, autoOpenAll: false });
    await h.ready;
    h.jumpTo("A");
    const first = h.nextBeat();
    expect(first?.text).toBeDefined();
    const second = h.nextBeat();
    expect(second?.load).toEqual([{ name: "B" }]);
    expect(second?.text).toBeUndefined();
  });

  it("never mounts in preview, even when the author opens it", async () => {
    const h = createHarness(STORY, 0, { assets: ASSETS, autoOpenAll: false });
    await h.ready;
    const ui: any = h.game.module.ui;
    await ui.openLayout("loading");
    expect(ui._mountedLayouts.has("loading")).toBe(false);
    ui.beginLoading();
    expect(ui._mountedLayouts.has("loading")).toBe(false);
  });

  it("is spared by navigation and never recorded into a checkpoint", async () => {
    const h = createHarness(STORY, 0, {
      assets: ASSETS,
      autoOpenAll: false,
      beforeConnect: (game) => {
        game.context.system.previewing = undefined;
      },
    });
    await h.ready;
    const ui: any = h.game.module.ui;
    ui.beginLoading();
    await flushMicrotasks(20);
    expect(ui._mountedLayouts.has("loading")).toBe(true);
    await ui.applyLayoutInstructions(
      [{ control: "open", name: "loading" }, { control: "navigate", name: "menu" }],
      true,
    );
    await flushMicrotasks(20);
    expect(ui._mountedLayouts.has("menu")).toBe(true);
    expect(ui._mountedLayouts.has("loading")).toBe(true);
    expect(ui._mountedLayouts.has("main")).toBe(true);
    const saved = JSON.parse(h.game.save());
    const openSet: Array<{ name: string }> = saved?.ui?.layout ?? [];
    expect(openSet.map((s) => s.name)).not.toContain("loading");
    expect(UIModule.MANAGED_LAYOUTS.has("loading")).toBe(true);
  });

  it("closes the way it opened, after the minimum display", async () => {
    const h = createHarness(STORY, 0, {
      assets: ASSETS,
      autoOpenAll: false,
      beforeConnect: (game) => {
        game.context.system.previewing = undefined;
      },
    });
    await h.ready;
    const ui: any = h.game.module.ui;
    ui.beginLoading("fade");
    await flushMicrotasks(20);
    h.reset();
    const closing = ui.endLoading();
    await flushMicrotasks(20);
    expect(ui._mountedLayouts.has("loading")).toBe(true);
    h.flushTimers();
    await closing;
    expect(ui._mountedLayouts.has("loading")).toBe(false);
    expect(h.messages.some((m) => m.method === "ui/animate")).toBe(true);
  });
});
