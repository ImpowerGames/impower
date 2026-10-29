import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SOURCE = `define BG as image with
  src = "https://example.com/bg.png"
end

layout main with
  stage {
    backdrop {
      image
    }
  }
  textbox {
    dialogue {
      text
    }
  }
end

-> start

scene start
  [[show backdrop BG]]
  After the backdrop.
end
`;

async function withBackdropShowing() {
  const h = createHarness(SOURCE);
  await h.ready;
  h.jumpToFlow("start");
  const beat = h.nextBeat();
  await h.display(beat!, true);
  await flushMicrotasks();
  return h;
}

const imageWrites = (h: { snapshotFiltered: (p: string) => unknown[] }) =>
  h.snapshotFiltered("ui/write-image");

describe("forgetting displayed images", () => {
  test("showing a backdrop records it", async () => {
    const h = await withBackdropShowing();
    const ui: any = h.game.module.ui;
    expect(Object.keys(ui._state.image ?? {})).toContain("backdrop");
  });

  test("restore re-applies the recorded image", async () => {
    const h = await withBackdropShowing();
    const ui: any = h.game.module.ui;
    h.reset();
    await ui.onRestore();
    await flushMicrotasks();
    expect(imageWrites(h).length).toBeGreaterThan(0);
  });

  test("forgetting first leaves restore with nothing to re-apply", async () => {
    const h = await withBackdropShowing();
    const ui: any = h.game.module.ui;
    ui.forgetDisplayedImages();
    expect(ui._state.image).toBeUndefined();
    h.reset();
    await ui.onRestore();
    await flushMicrotasks();
    expect(imageWrites(h)).toEqual([]);
  });
});
