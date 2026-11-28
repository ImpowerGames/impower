import { describe, expect, it } from "vitest";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DECLARATIONS = `define animation with
  show = { timing = { delay = 0.5 } }
  hide = { timing = { delay = 1.25 } }
end
animation slow_in {
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
define only_in as transition with
  on_show = animation.slow_in
end
define only_out as transition with
  on_hide = animation.late_out
end
layout main {
  backdrop { image }
  textbox { dialogue #clear { text } }
}
layout inventory { bag { text "Bag" } }
layout other { text "Other" }
scene start
  Hi.
end
`;

const PRESENCE_STYLE = `style bag {
  @initial { opacity = 0 }
  @show { transition-duration = 280ms }
  @hide { opacity = 0 }
}
`;

const ART: File = { uri: "inmemory:///bg.png", type: "image", name: "bg", ext: "png", src: "/file:/proj/bg.png?v=1" };

const wire = (messages: any[]): any[] =>
  messages.flatMap((m) =>
    (m.method === "ui/beat" || m.method === "ui/batch") && Array.isArray(m.params?.messages) ? wire(m.params.messages) : [m],
  );

const held = (beat: any): number => (Object.values(beat.text ?? {}).flat()[0] as { after?: number } | undefined)?.after ?? 0;

const seconds = (value: unknown): number =>
  typeof value === "number" ? value : parseFloat(String(value ?? "0")) / (String(value).endsWith("ms") ? 1000 : 1);

const span = (played: any[]): number =>
  Math.max(0, ...played.map((a) => seconds(a.timing.delay) + seconds(a.timing.duration)));

async function screen(verb: string, effect: string, styled = false) {
  const h = createHarness(`${styled ? PRESENCE_STYLE : ""}${DECLARATIONS}`, 0, { reactive: true, autoOpenAll: false });
  await h.ready;
  h.jumpToFlow("start");
  expect(h.errors).toEqual([]);
  const ui = h.game.module.ui;
  if (verb === "close") await ui.applyLayoutInstructions([{ control: "open", name: "inventory" }], true);
  if (verb === "navigate") await ui.applyLayoutInstructions([{ control: "open", name: "other" }], true);
  ui.setMotion(true);
  const beat = h.game.module.interpreter.parse(
    `[[${verb} ${verb === "navigate" ? "to " : ""}inventory ${effect} wait]] Hello`,
    "main",
    {} as any,
  );
  h.reset();
  await ui.applyLayoutInstructions(beat.layout!["inventory"]!, false);
  await flushMicrotasks(50);
  const played = wire(h.messages)
    .filter((m) => m.method === "ui/animate")
    .flatMap((m) => m.params?.effects ?? [])
    .flatMap((e: any) => e.animations ?? []);
  return { beat, played };
}

async function picture(directive: string) {
  const h = createHarness(DECLARATIONS, 0, { assets: [ART] });
  await h.ready;
  h.jumpToFlow("start");
  expect(h.errors).toEqual([]);
  const ui = h.game.module.ui;
  await ui.image.write("backdrop", [{ control: "show", assets: ["bg"] }], true);
  const beat = h.game.module.interpreter.parse(`[[${directive} wait]] Hello`, "main", {} as any);
  h.reset();
  await ui.image.write("backdrop", beat.image!["backdrop"]!, false);
  await flushMicrotasks(50);
  const played = wire(h.messages)
    .filter((m) => m.method === "ui/write-image")
    .flatMap((m) => m.params?.instructions ?? [])
    .flatMap((e: any) => [
      ...(e.targetAnimations ?? []),
      ...(e.content?.enterAnimations ?? []),
      ...(e.content?.previousHideAnimations ?? []),
      ...(e.content?.exitAnimations ?? []),
    ]);
  return { beat, played };
}

describe("`wait` holds exactly as long as what a screen line plays (I-2882)", () => {
  it.each([
    ["open", "with mixed over 2s"],
    ["close", "with mixed over 2s"],
    ["navigate", "with mixed over 2s"],
    ["open", "with only_out"],
    ["close", "with only_in"],
    ["navigate", "with only_in"],
    ["open", "with late_out"],
    ["close", "with late_out after 0s over 2s"],
    ["open", "with nonexistent"],
    ["open", "with nonexistent over 2s"],
    ["open", ""],
    ["close", ""],
  ])("`[[%s inventory %s wait]]`", async (verb, effect) => {
    const { beat, played } = await screen(verb, effect);
    expect(held(beat)).toBe(span(played));
  });

  it.each(["open", "close"])(
    "`[[%s inventory wait]]` on a layout with presence styles plays no default animation and holds for none",
    async (verb) => {
      const { beat, played } = await screen(verb, "", true);
      expect(played.map((a) => a.$name)).not.toContain(verb === "open" ? "show" : "hide");
      expect(held(beat)).toBe(span(played));
    },
  );
});

describe("`wait` holds exactly as long as what a picture line plays (I-2882)", () => {
  it.each([
    "hide backdrop with only_in",
    "hide backdrop with mixed over 2s",
    "show backdrop bg with only_out",
    "show backdrop bg with mixed over 2s",
    "show backdrop bg with nonexistent over 2s",
    "show backdrop bg",
    "hide backdrop",
  ])("`[[%s wait]]`", async (directive) => {
    const { beat, played } = await picture(directive);
    expect(held(beat)).toBe(span(played));
  });

  it("a transition missing its `on_hide` hides with the declared `hide`, and `wait` holds for that", async () => {
    const { beat, played } = await picture("hide backdrop with only_in");
    expect(played).toEqual(
      expect.arrayContaining([expect.objectContaining({ $name: "hide", timing: expect.objectContaining({ delay: "1.25s" }) })]),
    );
    expect(played.map((a) => a.$name)).not.toContain("slow_in");
    expect(held(beat)).toBe(1.25);
  });
});
