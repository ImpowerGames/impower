import { describe, expect, it } from "vitest";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const ASSETS: File[] = [
  { uri: "inmemory:///bg.png", type: "image", name: "bg", ext: "png", src: "/file:/proj/bg.png?v=1" },
  { uri: "inmemory:///bunny.png", type: "image", name: "bunny", ext: "png", src: "/file:/proj/bunny.png?v=1" },
  { uri: "inmemory:///hero.png", type: "image", name: "hero", ext: "png", src: "/file:/proj/hero.png?v=1" },
  { uri: "inmemory:///rain.webm", type: "video", name: "rain", ext: "webm", src: "/file:/proj/rain.webm?v=1" },
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
  const beat = h.game.module.interpreter.parse(`[[${line}]] Hello`, "main", {} as any);
  const target = Object.keys(beat.image ?? {})[0]!;
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
  iterations: animation.timing.iterations,
});

const names = (animations: any[] | undefined) => (animations ?? []).map(timing);

describe("every `with` on a `show`, `hide` or bare picture line plays together (I-2855)", () => {
  it("a fade and a shake on a `show` give the arriving picture `fadein` and `shake` and the replaced one `fadeout` and `shake`", async () => {
    const { instruction } = await played("show portrait hero with fade over 0.5s with shake over 2s");
    expect(names(instruction.content.enterAnimations)).toEqual([
      expect.objectContaining({ name: "fadein", duration: "0.5s" }),
      expect.objectContaining({ name: "shake", duration: "2s" }),
    ]);
    expect(names(instruction.content.previousHideAnimations)).toEqual([
      expect.objectContaining({ name: "fadeout", duration: "0.5s" }),
      expect.objectContaining({ name: "shake", duration: "2s" }),
    ]);
  });

  it("a fade and a single spin on a `hide` send the leaving picture `fadeout` and one pass of `spin`", async () => {
    const { instruction } = await played("hide portrait with fade over 1s with spin over 1s once");
    expect(names(instruction.targetAnimations)).toEqual([
      expect.objectContaining({ name: "fadeout", duration: "1s" }),
      expect.objectContaining({ name: "spin", duration: "1s", iterations: 1 }),
    ]);
  });

  it("a `hide` that names its picture sends every exit on the picture", async () => {
    const { instruction } = await played("hide portrait bunny with fade over 1s with spin over 1s once");
    expect(names(instruction.content.exitAnimations)).toEqual([
      expect.objectContaining({ name: "fadeout", duration: "1s" }),
      expect.objectContaining({ name: "spin", duration: "1s", iterations: 1 }),
    ]);
  });

  it("`screenfade` beside a plain animation plays its `screen` arm on the screen and both `with` clauses on the picture", async () => {
    const { instruction } = await played("show portrait hero with screenfade over 1s with shake over 2s");
    expect(instruction.targetAnimations).toEqual([
      expect.objectContaining({ $name: "show" }),
      expect.objectContaining({ $name: "blackpulse", arm: "screen" }),
    ]);
    expect(names(instruction.content.enterAnimations)).toEqual([
      expect.objectContaining({ name: "waitin" }),
      expect.objectContaining({ name: "shake", duration: "2s" }),
    ]);
    expect(names(instruction.content.previousHideAnimations)).toEqual([
      expect.objectContaining({ name: "waitout" }),
      expect.objectContaining({ name: "shake", duration: "2s" }),
    ]);
  });

  it("a `show` of the layer's current picture plays every `with` on the layer", async () => {
    const { instruction } = await played("show portrait with shake over 1s with spin over 2s", [["portrait", "bunny"]]);
    expect(names(instruction.targetAnimations)).toEqual([
      expect.objectContaining({ name: "shake", duration: "1s" }),
      expect.objectContaining({ name: "spin", duration: "2s" }),
    ]);
  });

  it("`loop` on an entry repeats every animation its transition resolves to", async () => {
    const { instruction } = await played("show portrait hero with fade over 1s loop with shake once");
    expect(names(instruction.content.enterAnimations)).toEqual([
      expect.objectContaining({ name: "fadein", iterations: "infinite" }),
      expect.objectContaining({ name: "shake", iterations: 1 }),
    ]);
    expect(names(instruction.content.previousHideAnimations)[0]).toEqual(
      expect.objectContaining({ name: "fadeout", iterations: "infinite" }),
    );
  });

  it("a bare picture line `[[hero with fade over 0.5s with shake over 2s]]` plays both on the portrait", async () => {
    const { instruction } = await played("hero with fade over 0.5s with shake over 2s");
    expect(names(instruction.content.enterAnimations)).toEqual([
      expect.objectContaining({ name: "fadein", duration: "0.5s" }),
      expect.objectContaining({ name: "shake", duration: "2s" }),
    ]);
    expect(names(instruction.content.previousHideAnimations).map((a) => a.name)).toEqual(["fadeout", "shake"]);
  });

  it("a bare video line `[[rain once with fade with shake]]` plays the video once and both animations", async () => {
    const { instruction } = await played("rain once with fade with shake");
    expect(instruction.content.video).toEqual(expect.objectContaining({ loop: false }));
    expect(names(instruction.content.enterAnimations).map((a) => a.name)).toEqual(["fadein", "shake"]);
  });

  it("`[[show backdrop rain once with fade with shake]]` plays the video once and both animations", async () => {
    const { instruction } = await played("show backdrop rain once with fade with shake");
    expect(instruction.content.video).toEqual(expect.objectContaining({ loop: false }));
    expect(names(instruction.content.enterAnimations).map((a) => a.name)).toEqual(["fadein", "shake"]);
  });

  it("`wait` on a `show` holds for the longest `with`", async () => {
    const { held } = await played("show portrait hero with fade over 0.5s with shake over 2s wait");
    expect(held).toBe(2);
  });
});

describe("a `show` or `hide` line with one `with` sends what it sent before, as a one-item list (I-2855)", () => {
  it.each([
    ["show portrait hero with fade over 0.5s", ["fadein"], ["fadeout"], "0.5s"],
    ["show portrait hero with shake over 2s", ["shake"], ["shake"], "2s"],
    ["show portrait hero with screenfade over 1s", ["waitin"], ["waitout"], undefined],
    ["show portrait hero over 0.4s", ["show"], ["hide"], "0.4s"],
  ] as const)("`%s`", async (line, enter, previous, duration) => {
    const { instruction } = await played(line);
    expect(names(instruction.content.enterAnimations).map((a) => a.name)).toEqual(enter);
    expect(names(instruction.content.previousHideAnimations).map((a) => a.name)).toEqual(previous);
    if (duration) {
      expect(names(instruction.content.enterAnimations)[0]!.duration).toBe(duration);
      expect(names(instruction.content.previousHideAnimations)[0]!.duration).toBe(duration);
    }
  });

  it.each([
    ["hide portrait with fade over 1s", ["fadeout"]],
    ["hide portrait with spin over 1s once", ["spin"]],
    ["hide portrait over 0.3s", ["hide"]],
  ] as const)("`%s`", async (line, exits) => {
    const { instruction } = await played(line);
    expect(names(instruction.targetAnimations).map((a) => a.name)).toEqual(exits);
  });

  it("`hide portrait bunny with fade over 1s` sends one exit on the picture", async () => {
    const { instruction } = await played("hide portrait bunny with fade over 1s");
    expect(names(instruction.content.exitAnimations)).toEqual([expect.objectContaining({ name: "fadeout", duration: "1s" })]);
  });
});
