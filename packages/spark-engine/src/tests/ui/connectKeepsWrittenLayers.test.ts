import { describe, expect, test } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
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

define hat as image with
  src = "https://example.com/hat.png"
end



scene start
  [[show backdrop sky]]
  The backdrop is up.

  [[show portrait red]]
  A red portrait.

  [[animate portrait with shake]]
  The red portrait shakes.

  A plain line.

  [[show portrait red]]
  Red again.

  [[show portrait hat]]
  A hat replaces it.
end
`;

const portraitWrites = (messages: any[]) =>
  JSON.stringify(
    messages.filter(
      (m: any) =>
        m?.method === "ui/write-image" && m.params?.target === "portrait",
    ),
  );

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((line) => line.includes(text));

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

  test("a line that shows a picture of its own neither shows nor waits for the one before", async () => {
    const { h, ui } = await previewAfterConnect(5, "A hat replaces it.");
    const events = ui._state.image?.portrait ?? [];
    expect(events.map((e: any) => [e.control, e.assets ?? []])).toEqual([
      ["show", ["hat"]],
    ]);
    const writes = portraitWrites(h.messages);
    expect(writes).toContain("hat.png");
    expect(writes).not.toContain("red.png");
    const requested = JSON.stringify(
      h.messages.filter((m: any) => m?.method === "assets/load"),
    );
    expect(requested).toContain("hat.png");
    expect(requested).not.toContain("red.png");
  });

  test("a reset drops what the connect cleared", async () => {
    const cp = await checkpointAfter(2);
    const h = createHarness(SOURCE, 0, {
      loadCheckpoint: cp,
      beforeConnect: (game) => {
        game.context.system.previewing = undefined;
        game.markPreviewing(2 ** 40);
      },
    });
    await h.ready;
    const ui: any = h.game.module.ui;
    h.game.reset();
    h.jumpToFlow("start");
    h.nextBeat();
    h.nextBeat();
    const animate = h.nextBeat();
    expect(Object.keys(animate?.image ?? {})).toEqual(["portrait"]);
    h.reset();
    new Coordinator(h.game, animate!);
    await flushMicrotasks();
    const events = ui._state.image?.portrait ?? [];
    expect(events.map((e: any) => [e.control, e.assets ?? []])).toEqual([
      ["animate", []],
    ]);
    expect(portraitWrites(h.messages)).not.toContain("red.png");
  });
});
