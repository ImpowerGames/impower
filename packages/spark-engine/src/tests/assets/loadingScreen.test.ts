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

/** The live `game.loading` table as a plain object. */
const loadingTable = (game: any): Record<string, unknown> => {
  const table = game.story.variablesState.GetVariableWithName("game");
  const loading = table?.value?.get("loading");
  const out: Record<string, unknown> = {};
  for (const [key, value] of loading?.value ?? []) {
    out[key] = value?.value;
  }
  return out;
};

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

  it("publishes its progress through game.loading, which a replaced layout can bind", async () => {
    const h = createHarness(
      `layout loading with
  text "Loading {game.loading.percent}%"
end

${STORY}`,
      0,
      {
        assets: ASSETS,
        autoOpenAll: false,
        beforeConnect: (game) => {
          game.context.system.previewing = undefined;
        },
      },
    );
    await h.ready;
    // The builtin carries every field from the start, so a layout mounted
    // before any load reads real values, not nil.
    expect(loadingTable(h.game)).toEqual({
      active: false,
      name: "",
      loaded: 0,
      total: 0,
      progress: 0,
      percent: 0,
    });
    const ui: any = h.game.module.ui;
    ui.beginLoading("fade", "B");
    await flushMicrotasks(20);
    expect(ui._mountedLayouts.has("loading")).toBe(true);
    expect(loadingTable(h.game)).toMatchObject({
      active: true,
      name: "B",
      loaded: 0,
      total: 0,
      progress: 0,
      percent: 0,
    });
    expect(JSON.stringify(h.messages)).toContain("Loading 0%");
    h.reset();
    ui.updateLoading({ loaded: 1, total: 4 });
    await flushMicrotasks(20);
    expect(loadingTable(h.game)).toMatchObject({
      loaded: 1,
      total: 4,
      progress: 0.25,
      percent: 25,
    });
    // The bound text re-rendered from the table, and only it: the update is
    // targeted, not a remount.
    const updates = h.snapshotFiltered("ui/update");
    expect(JSON.stringify(updates)).toContain("Loading 25%");
    expect(h.snapshotFiltered("ui/create")).toHaveLength(0);
    // A repeated report changes nothing, so no binding re-runs.
    h.reset();
    ui.updateLoading({ loaded: 1, total: 4 });
    await flushMicrotasks(20);
    expect(h.snapshotFiltered("ui/update")).toHaveLength(0);
    // Nothing of it is saved into a checkpoint.
    expect(h.game.save()).not.toContain("percent");
    const closing = ui.endLoading();
    h.flushTimers();
    await closing;
    expect(loadingTable(h.game)).toMatchObject({ active: false, percent: 25 });
  });

  it("shows a load that had nothing left to fetch as complete", async () => {
    const h = createHarness(STORY, 0, {
      assets: ASSETS,
      autoOpenAll: false,
      beforeConnect: (game) => {
        game.context.system.previewing = undefined;
      },
    });
    await h.ready;
    const ui: any = h.game.module.ui;
    ui.beginLoading("fade", "B");
    await flushMicrotasks(20);
    const closing = ui.endLoading();
    h.flushTimers();
    await closing;
    expect(loadingTable(h.game)).toMatchObject({
      active: false,
      progress: 1,
      percent: 100,
    });
  });
});
