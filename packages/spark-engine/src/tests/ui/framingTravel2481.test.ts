import { describe, expect, it } from "vitest";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const ASSETS: File[] = [
  { uri: "inmemory:///bg.png", type: "image", name: "bg", ext: "png", src: "/file:/proj/bg.png?v=1" },
  { uri: "inmemory:///bunny.png", type: "image", name: "bunny", ext: "png", src: "/file:/proj/bunny.png?v=1" },
];

const SOFA_FRAMING = `framing sofa {
  x = 60%
  y = 100%
  zoom = 1.2
}
`;

const SOURCE = `${SOFA_FRAMING}
scene start
  [[show backdrop bg at right]]
  One.
  [[animate backdrop to sofa over 5s]]
  Two.
  [[animate backdrop to left]]
  Three.
  [[animate backdrop to center over 2s after 1s ease linear]]
  Four.
  [[animate backdrop to sofa with shake over 1s]]
  Five.
  [[animate portrait to sofa over 1s]]
  Six.
  [[show portrait bunny at left]]
  Seven.
  Eight.
  [[animate portrait to sofa over 1s]]
  Nine.
end
`;

const SOFA = { x: 0.6, y: 1, zoom: 1.2 };
const RIGHT = { x: 1, y: 0.5, zoom: 1 };
const LEFT = { x: 0, y: 0.5, zoom: 1 };

type Harness = ReturnType<typeof createHarness>;

const writes = (h: Harness, target: string) =>
  h.messages.filter((m: any) => m?.method === "ui/write-image" && m.params?.target === target);

const lastWrite = (h: Harness, target: string) => writes(h, target).at(-1)?.params;

const framingsSent = (h: Harness, target: string) =>
  lastWrite(h, target)
    ?.instructions.filter((i: any) => i.content)
    .map((i: any) => i.framing ?? "default");

async function after(beats: number, instant = false, h: Harness = createHarness(SOURCE, 0, { assets: ASSETS })) {
  await h.ready;
  h.jumpToFlow("start");
  for (let i = 0; i < beats; i += 1) {
    const beat = h.nextBeat();
    expect(beat).toBeTruthy();
    await h.display(beat!, instant);
    await flushMicrotasks();
  }
  return h;
}

async function restored(h: Harness, target: string) {
  h.reset();
  await (h.game.module.ui as any).onRestore();
  await flushMicrotasks();
  return framingsSent(h, target);
}

describe("a layer's picture travels to a framing with animate … to (I-2481)", () => {
  it("to sends the player the framing with the line's over, and the default easing", async () => {
    const h = await after(2);
    const [instruction] = lastWrite(h, "backdrop")!.instructions;
    expect(instruction).not.toHaveProperty("content");
    expect(instruction.travel).toEqual({
      framing: SOFA,
      timing: expect.objectContaining({ delay: "0s", duration: "5s", easing: "ease" }),
    });
  });

  it("to sets the layer's framing, so a checkpoint restore shows the picture arrived", async () => {
    const h = await after(2);
    expect(await restored(h, "backdrop")).toEqual([SOFA]);
  });

  it("a save made during a travel loads with the picture arrived", async () => {
    const h = await after(2);
    const saved = h.game.save();
    const loaded = createHarness(SOURCE, 0, { assets: ASSETS, loadCheckpoint: saved });
    await loaded.ready;
    expect(await restored(loaded, "backdrop")).toEqual([SOFA]);
  });

  it("to without over arrives at once", async () => {
    const h = await after(3);
    const [instruction] = lastWrite(h, "backdrop")!.instructions;
    expect(instruction.travel).toEqual({
      framing: LEFT,
      timing: expect.objectContaining({ delay: "0s", duration: "0s" }),
    });
    expect(await restored(h, "backdrop")).toEqual([LEFT]);
  });

  it("to times the travel with the line's after and ease, and to center travels to the default framing", async () => {
    const h = await after(4);
    const [instruction] = lastWrite(h, "backdrop")!.instructions;
    expect(instruction.travel.framing).toBeUndefined();
    expect(instruction.travel.timing).toEqual(expect.objectContaining({ delay: "1s", duration: "2s" }));
    expect(instruction.travel.timing.easing).not.toBe("ease");
    expect(await restored(h, "backdrop")).toEqual(["default"]);
  });

  it("a beat presented at once sends the travel with no duration", async () => {
    const h = await after(2, true);
    const [instruction] = lastWrite(h, "backdrop")!.instructions;
    expect(instruction.travel).toEqual({
      framing: SOFA,
      timing: expect.objectContaining({ delay: "0s", duration: "0s" }),
    });
  });

  it("to and with on one line both run", async () => {
    const h = await after(5);
    const [instruction] = lastWrite(h, "backdrop")!.instructions;
    expect(instruction.travel).toEqual({
      framing: SOFA,
      timing: expect.objectContaining({ duration: "1s" }),
    });
    expect(instruction.targetAnimations).toEqual([
      expect.objectContaining({ $name: "shake", timing: expect.objectContaining({ duration: "1s" }) }),
    ]);
  });

  it("to on a layer that shows no picture changes nothing", async () => {
    const h = await after(6);
    for (const write of writes(h, "portrait")) {
      for (const instruction of write.params.instructions) {
        expect(instruction).not.toHaveProperty("travel");
        expect(instruction).not.toHaveProperty("framing");
      }
    }
    const state = (h.game.module.ui as any)._state.image?.portrait ?? [];
    expect(JSON.stringify(state)).not.toContain("sofa");
    expect(await restored(h, "portrait")).toEqual(undefined);
  });

  it("a cleared layer kept for a beat that only animates it comes back with its framing and travels from there", async () => {
    const h = await after(7);
    const ui = h.game.module.ui as any;
    await ui.clearTransientPictures(["portrait"]);
    const eighth = h.nextBeat()!;
    await h.display(eighth, false);
    const ninth = h.nextBeat()!;
    const sent = writes(h, "portrait").length;
    await ui.image.restoreCleared(ninth);
    await h.display(ninth, false);
    await flushMicrotasks();
    const [restore, travel] = writes(h, "portrait").slice(sent).map((m: any) => m.params);
    expect(restore.instructions.filter((i: any) => i.content).map((i: any) => i.framing)).toEqual([LEFT]);
    expect(travel.instructions).toEqual([
      expect.objectContaining({ travel: { framing: SOFA, timing: expect.objectContaining({ duration: "1s" }) } }),
    ]);
    expect(await restored(h, "portrait")).toEqual([SOFA]);
  });

  it("wait holds the story until the travel arrives, and a to with no over and wait holds nothing", async () => {
    const h = createHarness(`${SOFA_FRAMING}scene start\n  Hi.\nend\n`, 0, { assets: ASSETS });
    await h.ready;
    const firstLetter = (line: string) => {
      const text = h.game.module.interpreter.parse(`${line} Hello`, "main", {} as any).text ?? {};
      return Object.values(text).flat()[0] as { after?: number };
    };
    expect(firstLetter("[[animate backdrop to sofa over 1s after 0.5s wait]]").after).toBe(1.5);
    expect(firstLetter("[[animate backdrop to sofa wait]]").after ?? 0).toBe(0);
  });

  it("of two to on one line, the one that starts last sets the framing, whatever their order", async () => {
    const source = `${SOFA_FRAMING}
scene start
  [[show backdrop bg at right]]
  One.
  [[animate backdrop to left over 2s after 4s]][[animate backdrop to sofa over 4s after 2s]]
  Two.
  [[animate backdrop to sofa over 1s after 1s]][[animate backdrop to left over 1s after 1s]]
  Three.
end
`;
    const h = await after(2, false, createHarness(source, 0, { assets: ASSETS }));
    const [toLeft, toSofa] = lastWrite(h, "backdrop")!.instructions;
    expect(toLeft.travel.framing).toEqual(LEFT);
    expect(toSofa.travel.framing).toEqual(SOFA);
    expect(await restored(h, "backdrop")).toEqual([LEFT]);
    const tied = await after(3, false, createHarness(source, 0, { assets: ASSETS }));
    expect(await restored(tied, "backdrop")).toEqual([LEFT]);
    const instant = await after(2, true, createHarness(source, 0, { assets: ASSETS }));
    expect(lastWrite(instant, "backdrop")!.instructions.map((i: any) => i.travel.framing)).toEqual([LEFT, LEFT]);
  });

  it("the framing the layer is going to survives as the layer's state", async () => {
    const h = await after(1);
    expect(await restored(h, "backdrop")).toEqual([RIGHT]);
  });
});
