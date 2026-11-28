import { describe, expect, it } from "vitest";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const ASSETS: File[] = [
  { uri: "inmemory:///bg.png", type: "image", name: "bg", ext: "png", src: "/file:/proj/bg.png?v=1" },
  { uri: "inmemory:///bg_room.png", type: "image", name: "bg_room", ext: "png", src: "/file:/proj/bg_room.png?v=1" },
  { uri: "inmemory:///dusk.png", type: "image", name: "dusk", ext: "png", src: "/file:/proj/dusk.png?v=1" },
  { uri: "inmemory:///bunny.png", type: "image", name: "bunny", ext: "png", src: "/file:/proj/bunny.png?v=1" },
  { uri: "inmemory:///hero.png", type: "image", name: "hero", ext: "png", src: "/file:/proj/hero.png?v=1" },
];

const STORY = `animation childfade {
  target = layer.instance
  keyframes {
    {
      opacity = "0"
    }
  }
  timing {
    duration = "1s"
  }
}

scene start
  Hi.
end
`;

type Harness = ReturnType<typeof createHarness>;

let shared: Promise<Harness> | undefined;

function sharedHarness(): Promise<Harness> {
  shared ??= (async () => {
    const h = createHarness(STORY, 0, { assets: ASSETS });
    await h.ready;
    h.jumpToFlow("start");
    return h;
  })();
  return shared;
}

async function played(line: string) {
  const h = await sharedHarness();
  const ui = h.game.module.ui;
  for (const [layer, picture] of [["backdrop", "bg"], ["portrait", "bunny"]] as const) {
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
});

const names = (animations: any[] | undefined) => (animations ?? []).map(timing);

describe("a picture line's own show or hide plays beside every `with` (I-2884)", () => {
  it("`[[show portrait hero with shake]]` sends the arriving picture `show` then `shake`, and the replaced one an instant `hide` then `shake`", async () => {
    const { instruction } = await played("show portrait hero with shake");
    expect(names(instruction.content.enterAnimations)).toEqual([
      { name: "show", delay: "0s", duration: 0 },
      { name: "shake", delay: "0s", duration: "300ms" },
    ]);
    expect(names(instruction.content.previousHideAnimations)).toEqual([
      { name: "hide", delay: "0s", duration: 0 },
      { name: "shake", delay: "0s", duration: "300ms" },
    ]);
  });

  it("`[[show backdrop bg_room over 2s with shake]]` sends a 2s `show` and a 300ms `shake`, and the replaced picture a 2s `hide`", async () => {
    const { instruction } = await played("show backdrop bg_room over 2s with shake");
    expect(names(instruction.content.enterAnimations)).toEqual([
      { name: "show", delay: "0s", duration: "2s" },
      { name: "shake", delay: "0s", duration: "300ms" },
    ]);
    expect(names(instruction.content.previousHideAnimations)).toEqual([
      { name: "hide", delay: "0s", duration: "2s" },
      { name: "shake", delay: "0s", duration: "300ms" },
    ]);
  });

  it("`[[hide portrait after 1s with spin over 1s once]]` sends a `hide` delayed by a second and the `spin`", async () => {
    const { instruction } = await played("hide portrait after 1s with spin over 1s once");
    expect(names(instruction.targetAnimations)).toEqual([
      { name: "hide", delay: "1s", duration: 0 },
      { name: "spin", delay: "0s", duration: "1s" },
    ]);
  });

  it("a `hide` that names its picture sends its own `hide` before the `with`", async () => {
    const { instruction } = await played("hide portrait bunny with spin over 1s once");
    expect(names(instruction.content.exitAnimations)).toEqual([
      { name: "hide", delay: "0s", duration: 0 },
      { name: "spin", delay: "0s", duration: "1s" },
    ]);
  });

  it("`[[animate backdrop dusk with shake]]` sends the `shake` for the layer and `show` for the added picture", async () => {
    const { instruction } = await played("animate backdrop dusk with shake");
    expect(names(instruction.content.enterAnimations)).toEqual([{ name: "show", delay: "0s", duration: 0 }]);
    expect(names(instruction.targetAnimations)).toEqual([{ name: "shake", delay: "0s", duration: "300ms" }]);
  });

  it("`[[animate backdrop dusk with shake with spin]]` sends both `with` animations for the layer and `show` for the added picture", async () => {
    const { instruction } = await played("animate backdrop dusk with shake with spin over 1s");
    expect(names(instruction.content.enterAnimations)).toEqual([{ name: "show", delay: "0s", duration: 0 }]);
    expect(names(instruction.targetAnimations)).toEqual([
      { name: "shake", delay: "0s", duration: "300ms" },
      { name: "spin", delay: "0s", duration: "1s" },
    ]);
  });

  it("the arriving picture's `show` starts from the `hide` look, while the layer's reveal keeps the `show` look alone", async () => {
    const { instruction } = await played("show backdrop bg_room after 5s over 1s with shake");
    expect(instruction.content.enterAnimations[0].keyframes).toEqual([{ opacity: "0" }, { opacity: "1" }]);
    expect(instruction.content.previousHideAnimations[0].keyframes).toEqual([{ opacity: "0" }]);
    const reveal = instruction.targetAnimations.find((animation: any) => animation.$name === "show");
    expect(reveal.keyframes).toEqual([{ opacity: "1" }]);
    expect(reveal.timing.delay).toBe("5s");
  });

  it("an instant own hide waits for every leaving `with` that sets the same property, and for no other", async () => {
    const replaced = (await played("show portrait hero with fade")).instruction;
    expect(names(replaced.content.previousHideAnimations)).toEqual([
      { name: "hide", delay: "0.5s", duration: 0 },
      { name: "fadeout", delay: "0s", duration: "0.5s" },
    ]);
    expect(replaced.content.previousHideAnimations[1].keyframes).toEqual([{ opacity: "0" }]);
    const hidden = (await played("hide portrait with fade over 1s with spin over 2s once")).instruction;
    expect(names(hidden.targetAnimations)).toEqual([
      { name: "hide", delay: "1s", duration: 0 },
      { name: "fadeout", delay: "0s", duration: "1s" },
      { name: "spin", delay: "0s", duration: "2s" },
    ]);
    const child = (await played("hide portrait with childfade")).instruction;
    expect(names(child.targetAnimations)[0]).toEqual({ name: "hide", delay: "0s", duration: 0 });
    const shaken = (await played("show portrait hero with shake")).instruction;
    expect(names(shaken.content.previousHideAnimations)[0]).toEqual({ name: "hide", delay: "0s", duration: 0 });
    const timed = (await played("hide portrait over 1s with fade over 2s")).instruction;
    expect(names(timed.targetAnimations)[0]).toEqual({ name: "hide", delay: "0s", duration: "1s" });
    const using = (await played("hide portrait using fade")).instruction;
    expect(using.targetAnimations.map((a: any) => a.keyframes)).toEqual([[{ opacity: "0" }]]);
  });

  it("a pictured show `using` a transition with extra parts and a `with` plays the transition's parts and the `with` together", async () => {
    const { instruction } = await played("show portrait hero using screenfade over 1s with shake");
    expect(instruction.targetAnimations).toContainEqual(expect.objectContaining({ $name: "blackpulse", arm: "screen" }));
    expect(names(instruction.content.enterAnimations).map((a) => a.name)).toEqual(["waitin", "shake"]);
    expect(names(instruction.content.previousHideAnimations).map((a) => a.name)).toEqual(["waitout", "shake"]);
  });

  it("`[[show backdrop bg_room over 2s with shake wait]]` holds the story for two seconds", async () => {
    const { held } = await played("show backdrop bg_room over 2s with shake wait");
    expect(held).toBe(2);
  });
});
