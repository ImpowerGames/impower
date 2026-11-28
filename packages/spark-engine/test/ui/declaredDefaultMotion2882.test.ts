import { describe, expect, it } from "vitest";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFAULTS = `define animation with
  show = { timing = { delay = 0.5 } }
  hide = { timing = { delay = 1.25 } }
end
`;

const ART: File = { uri: "inmemory:///bg.png", type: "image", name: "bg", ext: "png", src: "/file:/proj/bg.png?v=1" };

const held = (beat: any): number => (Object.values(beat.text ?? {}).flat()[0] as { after?: number } | undefined)?.after ?? 0;

const wire = (messages: any[]): any[] =>
  messages.flatMap((m) =>
    (m.method === "ui/beat" || m.method === "ui/batch") && Array.isArray(m.params?.messages) ? wire(m.params.messages) : [m],
  );

const lastImageWrite = (h: ReturnType<typeof createHarness>, target: string) =>
  wire(h.messages)
    .filter((m) => m.method === "ui/write-image" && m.params?.target === target)
    .at(-1)?.params;

describe("the line's own show and hide play their declared timing, and `wait` counts it (I-2882)", () => {
  it("`[[open inventory wait]]` plays the declared `show` delay and holds for it", async () => {
    const h = createHarness(
      `${DEFAULTS}
layout main {
  textbox {
    dialogue #clear {
      text
    }
  }
}
layout inventory {
  text "Bag"
}
scene start
  Hi.
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpToFlow("start");
    expect(h.errors).toEqual([]);
    const beat = h.game.module.interpreter.parse("[[open inventory wait]] Hello", "main", {} as any);
    h.reset();
    await h.game.module.ui.applyLayoutInstructions(beat.layout!["inventory"]!, false);
    await flushMicrotasks();
    const animations = wire(h.messages)
      .filter((m) => m.method === "ui/animate")
      .flatMap((m) => m.params?.effects ?? [])
      .flatMap((e: any) => e.animations ?? []);
    expect(animations).toEqual(
      expect.arrayContaining([expect.objectContaining({ $name: "show", timing: expect.objectContaining({ delay: "0.5s" }) })]),
    );
    expect(held(beat)).toBe(0.5);
  });

  it("`[[hide backdrop wait]]` on a picture with `@hide` styles plays the declared `hide` delay", async () => {
    const h = createHarness(
      `${DEFAULTS}
style styled_exit {
  opacity = 1
  @initial { opacity = 0 }
  @show { transition-duration = 280ms }
  @hide { opacity = 0 }
}
layout main {
  backdrop styled_exit { image }
  textbox { dialogue #clear { text } }
}
scene start
  Hi.
end
`,
      0,
      { assets: [ART], reactive: true },
    );
    await h.ready;
    h.jumpToFlow("start");
    expect(h.errors).toEqual([]);
    const ui = h.game.module.ui;
    await ui.image.write("backdrop", [{ control: "show", assets: ["bg"] }], true);
    ui.setMotion(true);
    const beat = h.game.module.interpreter.parse("[[hide backdrop wait]] Hello", "main", {} as any);
    h.reset();
    await ui.image.write("backdrop", beat.image!["backdrop"]!, false);
    await flushMicrotasks(50);
    const animations = wire(h.messages)
      .filter((m) => m.method === "ui/write-image" && m.params?.target === "backdrop")
      .flatMap((m) => m.params?.instructions ?? [])
      .flatMap((e: any) => e.targetAnimations ?? []);
    expect(animations).toEqual(
      expect.arrayContaining([expect.objectContaining({ $name: "hide", timing: expect.objectContaining({ delay: "1.25s" }) })]),
    );
    expect(held(beat)).toBe(1.25);
  });

  it("`[[show backdrop bg wait]]` over a picture already shown holds for the replaced picture's declared `hide`", async () => {
    const h = createHarness(`${DEFAULTS}\nscene start\n  Hi.\nend\n`, 0, { assets: [ART] });
    await h.ready;
    h.jumpToFlow("start");
    expect(h.errors).toEqual([]);
    const ui = h.game.module.ui;
    await ui.image.write("backdrop", [{ control: "show", assets: ["bg"] }], true);
    const beat = h.game.module.interpreter.parse("[[show backdrop bg wait]] Hello", "main", {} as any);
    h.reset();
    await ui.image.write("backdrop", beat.image!["backdrop"]!, false);
    await flushMicrotasks();
    const content = lastImageWrite(h, "backdrop")?.instructions.at(-1)?.content;
    expect(content?.previousHideAnimations).toEqual(
      expect.arrayContaining([expect.objectContaining({ $name: "hide", timing: expect.objectContaining({ delay: "1.25s" }) })]),
    );
    expect(held(beat)).toBe(1.25);
  });

  it("`wait` on a transition stretched by `over` counts each animation at the length it plays, with its own declared delay", async () => {
    const h = createHarness(
      `animation slow_in {
  keyframes { { opacity = "0" } { opacity = "1" } }
  timing { duration = "4s" }
}
animation late_out {
  keyframes { { opacity = "1" } { opacity = "0" } }
  timing { duration = "1s"; delay = "5s" }
}
define mixed as transition with
  on_show = animation.slow_in
  on_hide = animation.late_out
end
scene start
  Hi.
end
`,
      0,
      { assets: [ART] },
    );
    await h.ready;
    h.jumpToFlow("start");
    expect(h.errors).toEqual([]);
    const ui = h.game.module.ui;
    await ui.image.write("backdrop", [{ control: "show", assets: ["bg"] }], true);
    const beat = h.game.module.interpreter.parse("[[show backdrop bg with mixed over 2s wait]] Hello", "main", {} as any);
    h.reset();
    await ui.image.write("backdrop", beat.image!["backdrop"]!, false);
    await flushMicrotasks();
    const content = lastImageWrite(h, "backdrop")?.instructions.at(-1)?.content;
    expect(content?.enterAnimations).toEqual(
      expect.arrayContaining([expect.objectContaining({ timing: expect.objectContaining({ delay: "0s", duration: "2s" }) })]),
    );
    expect(content?.previousHideAnimations).toEqual(
      expect.arrayContaining([expect.objectContaining({ timing: expect.objectContaining({ delay: "5s", duration: "0.5s" }) })]),
    );
    expect(held(beat)).toBe(5.5);
  });
});
