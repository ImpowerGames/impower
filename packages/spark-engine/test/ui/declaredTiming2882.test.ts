import { describe, expect, it } from "vitest";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const ASSETS: File[] = [
  { uri: "inmemory:///bg.png", type: "image", name: "bg", ext: "png", src: "/file:/proj/bg.png?v=1" },
  { uri: "inmemory:///bunny.png", type: "image", name: "bunny", ext: "png", src: "/file:/proj/bunny.png?v=1" },
  { uri: "inmemory:///hero.png", type: "image", name: "hero", ext: "png", src: "/file:/proj/hero.png?v=1" },
];

const STORY = `animation pop {
  keyframes {
    {
      scale = "1"
    }
    {
      scale = "1.25"
    }
  }
  timing {
    delay = 0.5
    duration = "1s"
  }
}

define popin as transition with
  on_hide = animation.pop
  on_show = animation.pop
end

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

async function played(content: string, target: string) {
  const h = await sharedHarness();
  const ui = h.game.module.ui;
  for (const [layer, picture] of [["backdrop", "bg"], ["portrait", "bunny"]] as const) {
    await ui.image.write(layer, [{ control: "show", assets: [picture] }], true);
  }
  await flushMicrotasks();
  const beat = h.game.module.interpreter.parse(content, "main", {} as any);
  h.reset();
  await ui.image.write(target, beat.image![target]!, false);
  await flushMicrotasks();
  const write = h.messages
    .filter((m: any) => m?.method === "ui/write-image" && m.params?.target === target)
    .at(-1)?.params;
  const letters = Object.values(beat.text ?? {}).flat() as { text?: string; after?: number }[];
  return { letters, instruction: write?.instructions.at(-1) };
}

const line = async (directive: string) => {
  const target = directive.split(" ")[1]!;
  const { letters, instruction } = await played(`[[${directive}]] Hello`, target);
  return { held: letters[0]?.after ?? 0, instruction };
};

const timing = (animation: any) => ({
  name: animation.$name,
  delay: animation.timing.delay,
  duration: animation.timing.duration,
  easing: animation.timing.easing,
});

describe("a timing word times only what it is written on (I-2882)", () => {
  it("`[[animate backdrop to left over 4s with shake]]` sends a 4s travel and the shake at its declared 300ms and `ease-in-out`", async () => {
    const { instruction } = await line("animate backdrop to left over 4s with shake");
    expect(instruction.travel.timing).toEqual(expect.objectContaining({ delay: "0s", duration: "4s" }));
    expect(instruction.targetAnimations.map(timing)).toEqual([
      { name: "shake", delay: "0s", duration: "300ms", easing: "ease-in-out" },
    ]);
  });

  it("`[[animate backdrop to left with shake over 1s]]` sends a travel of no length and a 1s shake", async () => {
    const { instruction } = await line("animate backdrop to left with shake over 1s");
    expect(instruction.travel.timing).toEqual(expect.objectContaining({ delay: "0s", duration: "0s" }));
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "shake", delay: "0s", duration: "1s" }),
    ]);
  });

  it("`[[animate backdrop to left after 1s with shake]]` sends the shake with no delay", async () => {
    const { instruction } = await line("animate backdrop to left after 1s with shake");
    expect(instruction.travel.timing).toEqual(expect.objectContaining({ delay: "1s" }));
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "shake", delay: "0s", duration: "300ms" }),
    ]);
  });

  it("`ease` written for the travel leaves the shake its declared easing", async () => {
    const { instruction } = await line("animate backdrop to left over 1s ease linear with shake");
    expect(instruction.travel.timing).toEqual(expect.objectContaining({ easing: "cubic-bezier(0,0,1,1)" }));
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "shake", easing: "ease-in-out" }),
    ]);
  });

  it("`[[animate backdrop to left over 4s with shake after 3s over 1s wait]]` holds the story for four seconds", async () => {
    const { held, instruction } = await line("animate backdrop to left over 4s with shake after 3s over 1s wait");
    expect(held).toBe(4);
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "shake", delay: "3s", duration: "1s" }),
    ]);
  });
});

describe("a declared `delay` plays when no `after` is written (I-2882)", () => {
  it("an animation declared with a half-second delay plays with it after a `with` that writes no `after`", async () => {
    const { instruction } = await line("animate portrait with pop");
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "pop", delay: "0.5s", duration: "1s" }),
    ]);
  });

  it("a written `after` takes its place", async () => {
    const { instruction } = await line("animate portrait with pop after 2s");
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "pop", delay: "2s", duration: "1s" }),
    ]);
  });

  it("`wait` holds for the declared delay plus the declared length", async () => {
    expect((await line("animate portrait with pop wait")).held).toBe(1.5);
    expect((await line("animate portrait with pop after 2s wait")).held).toBe(3);
    expect((await line("animate portrait with pop over 2s wait")).held).toBe(2.5);
  });

  it("each animation of a transition plays its declared delay", async () => {
    const { held, instruction } = await line("show portrait hero with popin wait");
    expect(instruction.content.enterAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "pop", delay: "0.5s", duration: "1s" }),
    ]);
    expect(instruction.content.previousHideAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "pop", delay: "0.5s", duration: "1s" }),
    ]);
    expect(held).toBe(1.5);
  });

  it("a directive placed after a held one in its beat plays the declared delay from where it is placed", async () => {
    const placed = await played("[[animate backdrop with shake wait]] [[animate portrait with pop after 0s]] Hello", "portrait");
    expect(placed.instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "pop", delay: "0.3s" }),
    ]);
    const declared = await played("[[animate backdrop with shake wait]] [[animate portrait with pop]] Hello", "portrait");
    expect(declared.instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "pop", delay: "0.8s" }),
    ]);
    const written = await played("[[animate backdrop with shake wait]] [[animate portrait with pop after 1s]] Hello", "portrait");
    expect(written.instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "pop", delay: "1.3s" }),
    ]);
  });
});
