import { describe, expect, it } from "vitest";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const ASSETS: File[] = [
  { uri: "inmemory:///bg.png", type: "image", name: "bg", ext: "png", src: "/file:/proj/bg.png?v=1" },
  { uri: "inmemory:///dusk.png", type: "image", name: "dusk", ext: "png", src: "/file:/proj/dusk.png?v=1" },
  { uri: "inmemory:///bunny.png", type: "image", name: "bunny", ext: "png", src: "/file:/proj/bunny.png?v=1" },
  { uri: "inmemory:///hero.png", type: "image", name: "hero", ext: "png", src: "/file:/proj/hero.png?v=1" },
  { uri: "inmemory:///mia.png", type: "image", name: "mia", ext: "png", src: "/file:/proj/mia.png?v=1" },
];

const STORY = `animation quickflash {
  target = layer.screen
  keyframes {
    {
      opacity = "1"
    }
    {
      opacity = "0"
    }
  }
  timing {
    duration = "0.25s"
  }
}

define slowfade as transition with
  on_hide = animation.fadeout
  on_show = animation.fadein
  screen = animation.quickflash
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
  ...(animation.arm ? { arm: animation.arm } : {}),
});

const names = (animations: any[] | undefined) => (animations ?? []).map(timing);

describe("`using` plays its transition in place of a picture line's own show or hide (I-2883)", () => {
  it("`[[show portrait hero using fade over 2s with shake]]` sends the arriving picture a 2s `fadein` and a 300ms `shake`, and the replaced one a 2s `fadeout`", async () => {
    const { instruction } = await played("show portrait hero using fade over 2s with shake");
    expect(names(instruction.content.enterAnimations)).toEqual([
      { name: "fadein", delay: "0s", duration: "2s" },
      { name: "shake", delay: "0s", duration: "300ms" },
    ]);
    expect(names(instruction.content.previousHideAnimations)).toEqual([
      { name: "fadeout", delay: "0s", duration: "2s" },
      { name: "shake", delay: "0s", duration: "300ms" },
    ]);
  });

  it("`[[show portrait mia using screenfade over 1s]]` plays `blackpulse` on the screen layer", async () => {
    const { instruction } = await played("show portrait mia using screenfade over 1s");
    expect(names(instruction.targetAnimations)).toContainEqual(expect.objectContaining({ name: "blackpulse", arm: "screen" }));
    expect(names(instruction.content.enterAnimations).map((a) => a.name)).toEqual(["waitin"]);
    expect(names(instruction.content.previousHideAnimations).map((a) => a.name)).toEqual(["waitout"]);
  });

  it("`[[animate backdrop dusk using fade]]` sends `fadein` for the added picture", async () => {
    const { instruction } = await played("animate backdrop dusk using fade");
    expect(names(instruction.content.enterAnimations)).toEqual([{ name: "fadein", delay: "0s", duration: "0.5s" }]);
  });

  it("`[[hide portrait using fade over 1s wait]]` holds the story for one second", async () => {
    const { held, instruction } = await played("hide portrait using fade over 1s wait");
    expect(names(instruction.targetAnimations)).toEqual([{ name: "fadeout", delay: "0s", duration: "1s" }]);
    expect(held).toBe(1);
  });

  it("with no timing words of the line's own, the transition plays its declared timing, and `after` delays it", async () => {
    expect(names((await played("show portrait hero using fade")).instruction.content.enterAnimations)).toEqual([
      { name: "fadein", delay: "0s", duration: "0.5s" },
    ]);
    expect(names((await played("show portrait hero with shake using fade after 1s")).instruction.content.enterAnimations)).toEqual([
      { name: "fadein", delay: "1s", duration: "0.5s" },
      { name: "shake", delay: "0s", duration: "300ms" },
    ]);
  });

  it("`over` stretches every part of the transition by the same factor", async () => {
    const { instruction } = await played("show portrait hero using slowfade over 2s");
    expect(names(instruction.content.enterAnimations)).toEqual([{ name: "fadein", delay: "0s", duration: "2s" }]);
    expect(names(instruction.content.previousHideAnimations)).toEqual([{ name: "fadeout", delay: "0s", duration: "2s" }]);
    expect(names(instruction.targetAnimations)).toContainEqual({ name: "quickflash", delay: "0s", duration: "1s", arm: "screen" });
  });

  it("`over 0` plays the transition at once", async () => {
    const { held, instruction } = await played("hide portrait using fade over 0 wait");
    expect(names(instruction.targetAnimations)).toEqual([{ name: "fadeout", delay: "0s", duration: "0s" }]);
    expect(held).toBe(0);
  });

  it("a typewriter's `fade_duration` does not stretch the transition, and the line's own `over` still does", async () => {
    const h = createHarness(`define portrait as typewriter with\n  fade_duration = 5\nend\n${STORY}`, 0, { assets: ASSETS });
    await h.ready;
    h.jumpToFlow("start");
    const write = async (line: string) => {
      const beat = h.game.module.interpreter.parse(`[[${line}]] Hello`, "main", {} as any);
      h.reset();
      await h.game.module.ui.image.write("portrait", beat.image!["portrait"]!, false);
      await flushMicrotasks();
      const instruction = h.messages
        .filter((m: any) => m?.method === "ui/write-image" && m.params?.target === "portrait")
        .at(-1)?.params.instructions.at(-1);
      const firstLetter = Object.values(beat.text ?? {}).flat()[0] as { after?: number } | undefined;
      return { held: firstLetter?.after ?? 0, enter: names(instruction.content.enterAnimations) };
    };
    expect(await write("show portrait hero using fade wait")).toEqual({
      held: 0.5,
      enter: [{ name: "fadein", delay: "0s", duration: "0.5s" }],
    });
    expect(await write("show portrait mia using fade over 1s wait")).toEqual({
      held: 1,
      enter: [{ name: "fadein", delay: "0s", duration: "1s" }],
    });
  });

  it("a `hide` that names its picture sends the transition's `on_hide` on the leaving picture", async () => {
    const { instruction } = await played("hide portrait bunny using fade over 1s with spin over 1s once");
    expect(names(instruction.content.exitAnimations)).toEqual([
      { name: "fadeout", delay: "0s", duration: "1s" },
      { name: "spin", delay: "0s", duration: "1s" },
    ]);
  });
});
