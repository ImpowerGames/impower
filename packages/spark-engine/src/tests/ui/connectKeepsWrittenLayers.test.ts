// A connect clears every clear-on-continue layer, and the beat displayed after
// it is the first the page sees (#1662). Play keeps the picture on a layer
// such a beat writes to (`[[animate portrait with shake]]` shakes the portrait
// the line before showed), so the first beat after a connect shows that
// picture again, and a layer the beat does not write stays empty.

import { describe, expect, test } from "vitest";
import {
  MAIN_URI,
  createHarness,
  flushMicrotasks,
} from "./harness/uiTestHarness";

const SOURCE = `define sky as image with
  src = "https://example.com/sky.png"
end

define red as image with
  src = "https://example.com/red.png"
end

-> start

scene start
  [[show backdrop sky]]
  The backdrop is up.

  [[show portrait red]]
  A red portrait.

  [[animate portrait with shake]]
  The red portrait shakes.

  A plain line.
end
`;

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((line) => line.includes(text));

/** Save the game once its first `beats` beats are displayed, as a route to
 *  the beat after them does. */
async function checkpointAfter(beats: number) {
  const h = createHarness(SOURCE);
  await h.ready;
  h.jumpToFlow("start");
  for (let i = 0; i < beats; i += 1) {
    const beat = h.nextBeat();
    expect(beat).toBeTruthy();
    await h.display(beat!, true);
    await flushMicrotasks();
  }
  return h.game.save();
}

async function previewAfterConnect(beats: number, previewLine: string) {
  const cp = await checkpointAfter(beats);
  const h = createHarness(SOURCE, 0, {
    loadCheckpoint: cp,
    beforeConnect: (game) => {
      game.context.system.previewing = undefined;
      game.markPreviewing(2 ** 40);
    },
  });
  await h.ready;
  const ui: any = h.game.module.ui;
  expect(ui.getTransientTargets()).toContain("portrait");
  expect(ui.getTransientTargets()).not.toContain("backdrop");
  // The checkpoint stands for the route to the beat, which the preview
  // continues from, as it does when a route replay left the checkpoint.
  h.game.simulation = "success";
  h.reset();
  expect(
    await (h.game as any).preview(MAIN_URI, lineOf(previewLine)),
  ).toBeTruthy();
  await flushMicrotasks();
  return { h, ui };
}

describe("the first beat after a connect keeps the layers it writes (#1662)", () => {
  test("a beat that animates the portrait shows the portrait before it", async () => {
    const { h, ui } = await previewAfterConnect(2, "The red portrait shakes.");
    const events = ui._state.image?.portrait ?? [];
    expect(events.map((e: any) => [e.control, e.assets ?? []])).toEqual([
      ["show", ["red"]],
      ["animate", []],
    ]);
    const writes = h.messages.filter(
      (m: any) =>
        m?.method === "ui/write-image" && m.params?.target === "portrait",
    );
    expect(writes.length).toBeGreaterThan(0);
    expect(JSON.stringify(writes)).toContain("red.png");
  });

  test("a line that writes no picture leaves the portrait empty", async () => {
    const { ui } = await previewAfterConnect(3, "A plain line.");
    expect(ui._state.image?.portrait).toBeUndefined();
    expect(ui._state.image?.backdrop?.[0]?.assets).toEqual(["sky"]);
  });
});
