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

define SPRITE as image with
  src = "https://example.com/hero.png"
end

style dialogue {
  opacity = 1
  @initial { opacity = 0 }
  @show { transition-duration = 280ms }
  @hide { opacity = 0 }
}

style action {
  opacity = 1
  @initial { opacity = 0 }
  @hide { opacity = 0 }
}

layout main {
  portrait {
    image
  }
  dialogue {
    text
  }
  action {
    text
  }
}

scene start
  [[show portrait SPRITE]]
end
`;

const playing = (game: Game) => {
  game.context.system.previewing = undefined;
  game.context.system.composeBeats = true;
};

const wire = (messages: any[]): any[] =>
  messages.flatMap((m: any) =>
    (m?.method === "ui/batch" || m?.method === "ui/beat") &&
    Array.isArray(m.params?.messages)
      ? wire(m.params.messages)
      : [m],
  );

const motions = (h: UIHarness) =>
  wire(h.messages)
    .filter((m: any) => m?.method === "ui/presence")
    .flatMap((m: any) => m.params.effects);

const textWrites = (h: UIHarness, target: string) =>
  wire(h.messages).filter(
    (m: any) =>
      m?.method === "ui/write-text" &&
      m.params?.target === target &&
      m.params.instructions.length > 0,
  );

const typedWrites = (h: UIHarness, target: string) =>
  textWrites(h, target).filter((m: any) => !m.params.held);

const heldWrites = (h: UIHarness, target: string) =>
  textWrites(h, target).filter((m: any) => m.params.held);

const imageWrites = (h: UIHarness, target: string) =>
  wire(h.messages).filter(
    (m: any) => m?.method === "ui/write-image" && m.params?.target === target,
  );

const presenceOf = (h: UIHarness, id: string) => {
  let presence: string | null | undefined;
  for (const m of wire(h.messages)) {
    if (
      (m?.method === "ui/create" || m?.method === "ui/update") &&
      m.params?.element === id &&
      m.params.attributes &&
      PRESENCE in m.params.attributes
    ) {
      presence = m.params.attributes[PRESENCE];
    }
  }
  return presence;
};

const typed = (text: string, pause = 0.05) =>
  [...text].map((letter, i) => ({ text: letter, after: i * pause }));

const LEAD = 20;

interface Scene {
  h: UIHarness;
  clock: { now: number };
  sounds: number[];
  portrait: string;
  dialogue: string;
  action: string;
}

async function scene(withPortrait = false): Promise<Scene> {
  const h = createHarness(SOURCE, 0, {
    reactive: true,
    autoOpenAll: false,
    holdPresence: true,
    beforeConnect: playing,
  });
  await h.ready;
  const clock = { now: 0 };
  h.game.context.system.now = () => clock.now;
  const audio = h.game.module.audio as any;
  const sounds: number[] = [];
  let next = 0;
  audio.schedule = () => (next += 1);
  audio.isReady = () => true;
  audio.triggerAll = (_ids: number[], time: number) => {
    sounds.push(time);
  };
  const ui = h.game.module.ui;
  if (withPortrait) {
    h.jumpToFlow("start");
    ui.setMotion(true);
    await ui.image.write("portrait", h.nextBeat()!.image!["portrait"]! as any, false);
    h.releasePresence();
    await flushMicrotasks(30);
  }
  const [portrait] = ui.findIds("portrait");
  const [dialogue] = ui.findIds("dialogue");
  const [action] = ui.findIds("action");
  h.reset();
  return { h, clock, sounds, portrait: portrait!, dialogue: dialogue!, action: action! };
}

async function tick(coordinator: Coordinator<Game>, times = 10) {
  for (let i = 0; i < times; i += 1) {
    await flushMicrotasks(10);
    (coordinator as any)._onTick?.(100);
  }
  await flushMicrotasks(20);
}

async function play(h: UIHarness, beat: Record<string, unknown>) {
  const coordinator = new Coordinator(h.game, { end: 0, ...beat } as any);
  await tick(coordinator);
  return coordinator;
}

async function release(s: Scene, at: number) {
  s.clock.now = at;
  s.h.releasePresence();
  await flushMicrotasks(40);
}

const sound = { sound: [{ control: "play", assets: ["beep"] }] };

const dialogueLine = {
  text: { dialogue: typed("Hi there.") },
  audio: sound,
  image: { portrait: [{ control: "animate", with: "shake" }] },
};

describe("a line that makes an element arrive (#2739)", () => {
  test("schedules its text, its sound and its animate after the arrival ends", async () => {
    const s = await scene(true);
    const coordinator = await play(s.h, dialogueLine);
    expect(motions(s.h)).toEqual([{ element: s.dialogue, presence: "show" }]);
    expect(typedWrites(s.h, "dialogue")).toEqual([]);
    expect(heldWrites(s.h, "dialogue")).toHaveLength(1);
    expect(imageWrites(s.h, "portrait")).toEqual([]);
    expect(s.sounds).toEqual([]);
    expect((coordinator as any)._finishedExecution).toBe(false);

    await release(s, 500);
    await tick(coordinator, 1);

    const [write] = typedWrites(s.h, "dialogue");
    expect(write?.params.time).toBeGreaterThanOrEqual(500);
    expect(write?.params.instructions.map((i: any) => i.text).join("")).toBe("Hi there.");
    const [animate] = imageWrites(s.h, "portrait");
    expect(animate?.params.time).toBeGreaterThanOrEqual(500);
    expect(s.sounds).toEqual([500 + LEAD]);
  });

  test("ends a leaving element's motion before an arriving element's begins", async () => {
    const s = await scene();
    const first = await play(s.h, { text: { dialogue: typed("Hi.") } });
    await release(s, 300);
    await tick(first, 1);
    s.h.reset();

    const coordinator = await play(s.h, { text: { action: typed("Then.") } });
    expect(motions(s.h)).toEqual([{ element: s.dialogue, presence: "hide" }]);
    expect(typedWrites(s.h, "action")).toEqual([]);

    await release(s, 600);
    expect(motions(s.h)).toEqual([
      { element: s.dialogue, presence: "hide" },
      { element: s.action, presence: "show" },
    ]);
    expect(presenceOf(s.h, s.dialogue)).toBeNull();
    expect(typedWrites(s.h, "action")).toEqual([]);

    await release(s, 900);
    await tick(coordinator, 1);
    const [write] = typedWrites(s.h, "action");
    expect(write?.params.time).toBeGreaterThanOrEqual(900);
  });

  test("shows untyped text in full from the moment its element appears", async () => {
    const s = await scene();
    await play(s.h, { text: { dialogue: typed("All at once.", 0) } });
    expect(motions(s.h)).toEqual([{ element: s.dialogue, presence: "show" }]);
    expect(s.h.heldPresence()).toHaveLength(1);
    const [write] = textWrites(s.h, "dialogue");
    expect(write?.params.instructions.map((i: any) => i.text).join("")).toBe("All at once.");
    expect(write?.params.instructions.every((i: any) => !i.after)).toBe(true);
  });

  test("finishes the motion and shows the whole line on one click during the wait", async () => {
    const s = await scene(true);
    const coordinator = await play(s.h, dialogueLine);
    expect(typedWrites(s.h, "dialogue")).toEqual([]);

    s.clock.now = 100;
    coordinator.onMessage({
      jsonrpc: "2.0",
      method: "event",
      params: { type: "pointerdown", button: 0 },
    } as any);
    coordinator.onUpdate({ deltaMS: 100 } as any);
    await tick(coordinator, 1);

    expect(presenceOf(s.h, s.dialogue)).toBeNull();
    const writes = typedWrites(s.h, "dialogue");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.params).toMatchObject({ instant: true });
    expect(writes[0]?.params.instructions.map((i: any) => i.text).join("")).toBe("Hi there.");
    expect((coordinator as any)._finishedExecution).toBe(true);
    expect(s.sounds).toEqual([100 + LEAD]);

    await release(s, 400);
    await tick(coordinator, 1);
    expect(typedWrites(s.h, "dialogue")).toHaveLength(1);
    expect(s.sounds).toHaveLength(1);
  });

  test("waits for nothing when the line is displayed instantly", async () => {
    const s = await scene(true);
    const coordinator = new Coordinator(s.h.game, { end: 0, ...dialogueLine } as any, {
      settled: "presented",
    });
    await tick(coordinator, 1);
    expect(motions(s.h)).toEqual([]);
    const [write] = textWrites(s.h, "dialogue");
    expect(write?.params.instant).toBe(true);
    expect(write?.params.instructions.map((i: any) => i.text).join("")).toBe("Hi there.");
    expect((coordinator as any)._finishedExecution).toBe(true);
  });

  test("starts at once when the line causes no motion", async () => {
    const s = await scene();
    const first = await play(s.h, { text: { dialogue: typed("Hi.") } });
    await release(s, 300);
    await tick(first, 1);
    s.h.reset();
    s.sounds.length = 0;

    s.clock.now = 400;
    await play(s.h, { text: { dialogue: typed("Again.") }, audio: sound });
    expect(motions(s.h)).toEqual([]);
    const [write] = textWrites(s.h, "dialogue");
    expect(write?.params.time).toBe(400 + LEAD);
    expect(s.sounds).toEqual([400 + LEAD]);
  });
});
