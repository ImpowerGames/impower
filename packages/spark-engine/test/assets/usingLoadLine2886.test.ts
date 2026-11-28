import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, it } from "vitest";
import { createHarness, flushMicrotasks } from "../ui/harness/uiTestHarness";

const ASSETS: File[] = [
  {
    uri: "inmemory:///room.png",
    type: "image",
    name: "room",
    ext: "png",
    src: "/file:/proj/room.png?v=1",
  },
];

const story = (load: string) => `define assets as config with
  loading_transition = "screenfade"
end

scene A
  Hi there.
  ${load}
  After.
end

scene Chapter2
  [[show backdrop room]]
  Line three.
  done
end
`;

const loadBeat = async (load: string) => {
  const h = createHarness(story(load), 0, {
    assets: ASSETS,
    autoOpenAll: false,
    beforeConnect: (game) => {
      game.context.system.previewing = undefined;
    },
  });
  await h.ready;
  h.jumpToFlow("A");
  h.nextBeat();
  const beat = h.nextBeat();
  return { h, loads: beat?.load };
};

const openedWith = async (load: string) => {
  const { h, loads } = await loadBeat(load);
  const ui: any = h.game.module.ui;
  let opened: string | undefined;
  const begin = ui.beginLoading.bind(ui);
  ui.beginLoading = (transition?: string, scene?: string) => {
    begin(transition, scene);
    opened = ui._loading?.transition;
  };
  h.reset();
  h.game.module.assets.runLoad(loads ?? []);
  await flushMicrotasks(20);
  const animations = JSON.stringify(h.messages.filter((m) => m.method === "ui/animate").map((m) => m.params));
  return { loads, opened, animations };
};

describe("`using` on a `load` line names the loading screen's transition (I-2886)", () => {
  it("opens `loading` with the `using` transition in place of `assets.loading_transition`", async () => {
    const { loads, opened, animations } = await openedWith("[[load Chapter2 using fade]]");
    expect(loads).toEqual([{ name: "Chapter2", using: "fade" }]);
    expect(opened).toBe("fade");
    expect(animations).toContain("fadein");
    expect(animations).not.toContain("blackpulse");
  });

  it("opens `loading` with `assets.loading_transition` when the line names none", async () => {
    const { loads, opened } = await openedWith("[[load Chapter2]]");
    expect(loads).toEqual([{ name: "Chapter2" }]);
    expect(opened).toBe("screenfade");
  });
});
