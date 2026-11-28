import { describe, expect, it } from "vitest";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const ASSETS: File[] = [
  { uri: "inmemory:///bg.png", type: "image", name: "bg", ext: "png", src: "/file:/proj/bg.png?v=1" },
  { uri: "inmemory:///bunny.png", type: "image", name: "bunny", ext: "png", src: "/file:/proj/bunny.png?v=1" },
];

type Harness = ReturnType<typeof createHarness>;

let shared: Promise<Harness> | undefined;

function sharedHarness(): Promise<Harness> {
  shared ??= (async () => {
    const h = createHarness("scene start\n  Hi.\nend\n", 0, { assets: ASSETS });
    await h.ready;
    h.jumpToFlow("start");
    return h;
  })();
  return shared;
}

async function played(line: string, shown: readonly (readonly [layer: string, picture: string])[] = [["backdrop", "bg"], ["portrait", "bunny"]]) {
  const h = await sharedHarness();
  const ui = h.game.module.ui;
  for (const [layer, picture] of shown) {
    await ui.image.write(layer, [{ control: "show", assets: [picture] }], true);
  }
  await flushMicrotasks();
  const target = line.split(" ")[1]!;
  const beat = h.game.module.interpreter.parse(`[[${line}]] Hello`, "main", {} as any);
  h.reset();
  await ui.image.write(target, beat.image![target]!, false);
  await flushMicrotasks();
  const write = h.messages
    .filter((m: any) => m?.method === "ui/write-image" && m.params?.target === target)
    .at(-1)?.params;
  const firstLetter = Object.values(beat.text ?? {}).flat()[0] as { after?: number } | undefined;
  return { held: firstLetter?.after ?? 0, instruction: write?.instructions.at(-1) };
}

const timing = (animation: any) => ({
  name: animation.$name,
  delay: animation.timing.delay,
  duration: animation.timing.duration,
  easing: animation.timing.easing,
  iterations: animation.timing.iterations,
});

describe("every `with` on an `animate` line plays, each with its own timing (I-2853)", () => {
  it("two `with` clauses send two animations for the layer with their own timings", async () => {
    const { instruction } = await played("animate portrait with shake over 1s with spin over 5s ease linear");
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "shake", delay: "0s", duration: "1s" }),
      expect.objectContaining({ name: "spin", delay: "0s", duration: "5s", easing: "cubic-bezier(0,0,1,1)" }),
    ]);
    expect(instruction.targetAnimations[0].timing.easing).not.toBe("cubic-bezier(0,0,1,1)");
  });

  it("`loop` on a `with` repeats it without end and `once` plays it through one time", async () => {
    const { instruction } = await played("animate portrait with shake loop with spin over 2s once");
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "shake", iterations: "infinite" }),
      expect.objectContaining({ name: "spin", duration: "2s", iterations: 1 }),
    ]);
  });

  it("a `with` that is not given `loop` or `once` keeps its definition's repeat count", async () => {
    const { instruction } = await played("animate portrait with spin over 2s with shake");
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "spin", iterations: "infinite" }),
      expect.objectContaining({ name: "shake", iterations: 1 }),
    ]);
  });

  it("`wait` holds the story for the longest of the travel and every `with`, each counted as its `after` plus its length", async () => {
    const { held, instruction } = await played("animate backdrop to left over 4s with shake after 3s over 1s wait");
    expect(held).toBe(4);
    expect(instruction.travel.timing).toEqual(expect.objectContaining({ delay: "0s", duration: "4s" }));
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "shake", delay: "3s", duration: "1s" }),
    ]);
  });

  it("`wait` holds for the `with` that ends last", async () => {
    const { held } = await played("animate portrait with shake over 1s with spin after 2s over 5s once wait");
    expect(held).toBe(7);
  });

  it("without `wait` the story does not hold", async () => {
    const { held } = await played("animate portrait with shake over 1s with spin over 5s");
    expect(held).toBe(0);
  });

  it("a `with` without its own length counts its definition's length for `wait`", async () => {
    const { held } = await played("animate portrait with shake with spin over 0.1s once wait");
    expect(held).toBe(0.3);
  });
});

describe("every `with` plays wherever an `animate` line's instruction is read (I-2853)", () => {
  it("an `animate` line that names a picture plays every `with` on the layer, together", async () => {
    const { instruction } = await played("animate portrait bunny with shake over 1s with spin over 5s");
    expect(instruction.content.enterAnimations.map(timing)).toEqual([expect.objectContaining({ name: "show" })]);
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "shake", duration: "1s" }),
      expect.objectContaining({ name: "spin", duration: "5s" }),
    ]);
  });

  it("a transition among several `with` clauses on an `animate` line that names a picture plays the animation it plays alone", async () => {
    const alone = (await played("animate portrait bunny with fade over 1s")).instruction.targetAnimations?.[0];
    expect(alone).toBeTruthy();
    const { instruction } = await played("animate portrait bunny with fade over 1s with shake over 2s");
    expect(instruction.targetAnimations.map(timing)).toEqual([
      timing(alone),
      expect.objectContaining({ name: "shake", duration: "2s" }),
    ]);
  });

  it("an `animate` line that names a picture and one `with` plays it on the layer and `show` on the picture (I-2884)", async () => {
    const { instruction } = await played("animate portrait bunny with spin over 5s");
    expect(instruction.content.enterAnimations.map(timing)).toEqual([expect.objectContaining({ name: "show" })]);
    expect(instruction.targetAnimations.map(timing)).toEqual([expect.objectContaining({ name: "spin", duration: "5s" })]);
  });

  it("a save written when a layer's `with` was one name restores that animation", async () => {
    const h: Harness = createHarness("scene start\n  [[show portrait bunny]]\n  One.\nend\n", 0, { assets: ASSETS });
    await h.ready;
    h.jumpToFlow("start");
    await h.display(h.nextBeat()!, true);
    await flushMicrotasks();
    const saved = JSON.parse(h.game.save());
    saved.modules.ui.image.portrait = [
      { control: "show", assets: ["bunny"], over: 0 },
      { control: "animate", with: "fadeout", over: 0 },
    ];
    await h.game.module.ui.load(saved.modules.ui);
    h.reset();
    await (h.game.module.ui as any).onRestore();
    await flushMicrotasks();
    const restored = h.messages.filter((m: any) => m?.method === "ui/write-image" && m.params?.target === "portrait").at(-1)?.params;
    const names = restored.instructions.flatMap((i: any) => i.targetAnimations ?? []).map((a: any) => a.$name);
    expect(names).toContain("fadeout");
  });

  it("a `with` without its own `over` plays and waits for its definition's length on a layer whose typewriter fades", async () => {
    const h: Harness = createHarness("define portrait as typewriter with\n  fade_duration = 5\nend\nscene start\n  Hi.\nend\n", 0, {
      assets: ASSETS,
    });
    await h.ready;
    const beat = h.game.module.interpreter.parse("[[animate portrait with shake with spin over 2s once wait]] Hello", "main", {} as any);
    const entries = beat.image!["portrait"]![0]!.with!;
    expect(entries.map((entry) => entry.over)).toEqual([undefined, 2]);
    const firstLetter = Object.values(beat.text ?? {}).flat()[0] as { after?: number };
    expect(firstLetter.after).toBe(2);
  });
});

describe("a line's animations travel in one list in written `with` order (I-2870)", () => {
  const sent = (animations: any[]) => animations.map((a: any) => ({ name: a.$name, arm: a.arm }));

  it.each([
    ["animate portrait with shake over 1s with screenfade over 1s", ["shake", "blackpulse"]],
    ["animate portrait with screenfade over 1s with shake over 1s", ["blackpulse", "shake"]],
  ])("`%s` sends the transition's arm in its written place", async (line, order) => {
    const { instruction } = await played(line);
    expect(instruction.affected).toBeUndefined();
    expect(sent(instruction.targetAnimations)).toEqual(
      order.map((name) => ({ name, arm: name === "blackpulse" ? "screen" : undefined })),
    );
  });

  it("a `hide` with a transition and an animation sends both in written order", async () => {
    const { instruction } = await played("hide portrait with screenfade over 1s with spin over 1s");
    expect(sent(instruction.targetAnimations)).toEqual([
      { name: "hide", arm: undefined },
      { name: "waitout", arm: undefined },
      { name: "blackpulse", arm: "screen" },
      { name: "spin", arm: undefined },
    ]);
  });
});
