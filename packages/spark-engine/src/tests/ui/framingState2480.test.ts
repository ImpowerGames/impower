import { describe, expect, it } from "vitest";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const ASSETS: File[] = [
  { uri: "inmemory:///bg.png", type: "image", name: "bg", ext: "png", src: "/file:/proj/bg.png?v=1" },
  { uri: "inmemory:///sky.png", type: "image", name: "sky", ext: "png", src: "/file:/proj/sky.png?v=1" },
];

const SOURCE = `framing sofa {
  x = 60%
  y = 100%
  zoom = 1.2
}

scene start
  [[show backdrop bg at sofa]]
  One.
  [[show backdrop sky]]
  Two.
  [[show backdrop bg at right]]
  Three.
  [[hide backdrop]]
  Four.
  [[show backdrop]]
  Five.
end
`;

const SOFA = { x: 0.6, y: 1, zoom: 1.2 };
const RIGHT = { x: 1, y: 0.5, zoom: 1 };

type Harness = ReturnType<typeof createHarness>;

const backdropWrites = (h: Harness) =>
  h.messages.filter((m: any) => m?.method === "ui/write-image" && m.params?.target === "backdrop");

const framingsSent = (h: Harness) =>
  backdropWrites(h)
    .at(-1)
    ?.params.instructions.filter((i: any) => i.content)
    .map((i: any) => i.framing ?? "default");

async function after(beats: number, h: Harness = createHarness(SOURCE, 0, { assets: ASSETS })) {
  await h.ready;
  h.jumpToFlow("start");
  for (let i = 0; i < beats; i += 1) {
    const beat = h.nextBeat();
    expect(beat).toBeTruthy();
    await h.display(beat!, true);
    await flushMicrotasks();
  }
  return h;
}

async function restored(h: Harness) {
  h.reset();
  await (h.game.module.ui as any).onRestore();
  await flushMicrotasks();
  return framingsSent(h);
}

describe("a layer's framing in the image state (I-2480)", () => {
  it("show … at sends the picture at that framing", async () => {
    const h = await after(1);
    expect(framingsSent(h)).toEqual([SOFA]);
    expect(await restored(h)).toEqual([SOFA]);
  });

  it("a show of a picture without at puts the layer back at the default framing", async () => {
    const h = await after(2);
    expect(framingsSent(h)).toEqual(["default"]);
    expect(await restored(h)).toEqual(["default"]);
  });

  it("hiding the layer drops the framing, and showing the layer again keeps the default", async () => {
    const h = await after(4);
    expect(await restored(h)).toEqual(["default"]);
    const shown = await after(5);
    expect(await restored(shown)).toEqual(["default"]);
  });

  it("clearing the layer drops the framing", async () => {
    const h = await after(3);
    await (h.game.module.ui as any).image.clear("backdrop");
    expect((h.game.module.ui as any)._state.image?.backdrop).toBeUndefined();
    expect(await restored(h)).toBeUndefined();
  });

  it("the framing survives a save and a checkpoint restore", async () => {
    const h = await after(3);
    expect(await restored(h)).toEqual([RIGHT]);
    const saved = h.game.save();
    const loaded = createHarness(SOURCE, 0, { assets: ASSETS, loadCheckpoint: saved });
    await loaded.ready;
    expect(await restored(loaded)).toEqual([RIGHT]);
  });
});
