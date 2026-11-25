import { describe, expect, test } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import type { Game } from "../../game/core/classes/Game";
import {
  createHarness,
  flushMicrotasks,
  type UIHarness,
} from "./harness/uiTestHarness";

const PRESENCE = "data-presence";

const SOURCE = `define ui as config with
  layouts_initial = { }
end

store expanded = true

style dialogue {
  opacity = 1
  @initial { opacity = 0 }
  @show { transition-duration = 280ms }
  @hide { opacity = 0 }
}

layout main {
  if expanded then
    dialogue.first {
      text
    }
  else
    dialogue.second {
      text
    }
  end
}
`;

const wire = (messages: any[]): any[] =>
  messages.flatMap((m: any) =>
    (m?.method === "ui/batch" || m?.method === "ui/beat") &&
    Array.isArray(m.params?.messages)
      ? wire(m.params.messages)
      : [m],
  );

const marksOf = (h: UIHarness, id: string) =>
  wire(h.messages)
    .filter(
      (m: any) =>
        (m?.method === "ui/create" || m?.method === "ui/update") &&
        m.params?.element === id &&
        m.params.attributes &&
        PRESENCE in m.params.attributes,
    )
    .map((m: any) => m.params.attributes[PRESENCE]);

const motions = (h: UIHarness) =>
  wire(h.messages)
    .filter((m: any) => m?.method === "ui/presence")
    .flatMap((m: any) => m.params.effects);

const textWrites = (h: UIHarness) =>
  wire(h.messages).filter(
    (m: any) => m?.method === "ui/write-text" && m.params?.target === "dialogue",
  );

const playing = (game: Game) => {
  game.context.system.previewing = undefined;
  game.context.system.composeBeats = true;
};

async function play(h: UIHarness, beat: Record<string, unknown>) {
  const coordinator = new Coordinator(h.game, { end: 0, ...beat } as any);
  for (let i = 0; i < 10; i += 1) {
    await flushMicrotasks(10);
    (coordinator as any)._onTick?.(100);
  }
  await flushMicrotasks(20);
}

async function collapse(h: UIHarness) {
  (h.game.story as any).variablesState.$("expanded", false);
  h.game.module.ui.setMotion(true);
  h.game.module.ui.refreshLayouts();
  await flushMicrotasks(10);
}

describe("a box remounted with its line (#2787)", () => {
  test("arrives once, as a fresh mount does, and its line is written without a second arrival", async () => {
    const h = createHarness(SOURCE, 0, {
      reactive: true,
      autoOpenAll: false,
      holdPresence: true,
      beforeConnect: playing,
    });
    await h.ready;
    await play(h, { text: { dialogue: [{ text: "Hi." }] } });
    h.releasePresence();
    await flushMicrotasks(30);
    const [first] = h.game.module.ui.findIds("dialogue");
    h.reset();
    await collapse(h);
    const [second] = h.game.module.ui.findIds("dialogue");
    expect(second).not.toBe(first);
    expect(motions(h)).toEqual([
      { element: first, presence: "hide" },
      { element: second, presence: "show" },
    ]);
    expect(marksOf(h, second!)).toEqual(["initial"]);
    expect(textWrites(h).map((m: any) => m.params.instructions)).toEqual([
      [{ text: "Hi." }],
    ]);
  });
});
