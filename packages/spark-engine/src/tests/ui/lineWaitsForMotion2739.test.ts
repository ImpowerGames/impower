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

scene instant
  <speed=0>All at once.
end

scene typed
  Typed out.
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

  test("shows a line at <speed=0> in full from the moment its element appears", async () => {
    const s = await scene();
    s.h.jumpToFlow("instant");
    await play(s.h, s.h.nextBeat()! as any);
    expect(motions(s.h)).toEqual([{ element: s.action, presence: "show" }]);
    expect(s.h.heldPresence()).toHaveLength(1);
    expect(heldWrites(s.h, "action")).toEqual([]);
    const [write] = typedWrites(s.h, "action");
    expect(write?.params.instructions.map((i: any) => i.text).join("")).toBe("All at once.");
  });

  test("holds a typed line of the same script until its element has arrived", async () => {
    const s = await scene();
    s.h.jumpToFlow("typed");
    await play(s.h, s.h.nextBeat()! as any);
    expect(motions(s.h)).toEqual([{ element: s.action, presence: "show" }]);
    expect(typedWrites(s.h, "action")).toEqual([]);
    expect(heldWrites(s.h, "action")).toHaveLength(1);
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

const BESIDE = (stream: boolean) => `define ui as config with
  layouts_initial = { ${stream ? '"textstream"' : ""} }
end

define SPRITE as image with
  src = "https://example.com/hero.png"
end

define OTHER as image with
  src = "https://example.com/other.png"
end

style portrait {
  opacity = 1
  @initial { opacity = 0 }
  @show { transition-duration = 500ms }
}

style action {
  opacity = 1
  @initial { opacity = 0 }
  @show { transition-duration = 500ms }
}

layout main {
  portrait {
    image
  }
  action {
    text
  }
}

layout menu {
  panel {
    text "Menu"
  }
}

scene picture
  [[show portrait SPRITE]]
end

scene words
  A typed line.
end

scene swap
  [[show portrait OTHER]] A typed line.
end

scene opening
  [[open menu with fadein]] Another typed line.
end
`;

async function beside(stream = false) {
  const h = createHarness(BESIDE(stream), 0, {
    reactive: true,
    autoOpenAll: false,
    holdPresence: true,
    beforeConnect: playing,
  });
  await h.ready;
  h.releasePresence();
  await flushMicrotasks(30);
  h.reset();
  return h;
}

const typedOut = (h: UIHarness) =>
  wire(h.messages).filter(
    (m: any) =>
      m?.method === "ui/write-text" &&
      m.params.instructions.some((i: any) => (i.after ?? 0) > 0),
  );

describe("everything a line changes waits for its motion (#2739)", () => {
  test("a picture-only line does not continue until its arrival ends", async () => {
    const h = await beside();
    h.jumpToFlow("picture");
    const coordinator = new Coordinator(h.game, h.nextBeat()!);
    await tick(coordinator);
    expect(h.heldPresence().length).toBeGreaterThan(0);
    expect(coordinator.shouldContinue()).toBe(0);
    h.releasePresence();
    await flushMicrotasks(40);
    await tick(coordinator, 1);
    expect(coordinator.shouldContinue()).toBe(1);
  });

  test("one click during a picture-only line's arrival finishes it and moves on", async () => {
    const h = await beside();
    h.jumpToFlow("picture");
    const coordinator = new Coordinator(h.game, h.nextBeat()!);
    await tick(coordinator);
    const [portrait] = h.game.module.ui.findIds("portrait");
    expect(presenceOf(h, portrait!)).toBe("initial");
    coordinator.onMessage({
      jsonrpc: "2.0",
      method: "event",
      params: { type: "pointerdown", button: 0 },
    } as any);
    expect(coordinator.shouldContinue()).toBe(1);
    await flushMicrotasks(40);
    expect(presenceOf(h, portrait!)).toBeNull();
  });

  test("a picture changed on an element already shown waits for the line's arrival", async () => {
    const h = await beside();
    const ui = h.game.module.ui;
    h.jumpToFlow("picture");
    ui.setMotion(true);
    await ui.image.write("portrait", h.nextBeat()!.image!["portrait"]! as any, false);
    h.releasePresence();
    await flushMicrotasks(30);
    h.reset();
    h.jumpToFlow("swap");
    await tick(new Coordinator(h.game, h.nextBeat()!));
    expect(h.heldPresence().length).toBeGreaterThan(0);
    expect(imageWrites(h, "portrait").filter((m: any) => m.params.instructions.length > 0)).toEqual([]);
    h.releasePresence();
    await flushMicrotasks(40);
    expect(imageWrites(h, "portrait").filter((m: any) => m.params.instructions.length > 0)).toHaveLength(1);
  });

  test("a layout opened with a with clause on the line holds the typing until its animation ends", async () => {
    const h = await beside();
    h.jumpToFlow("words");
    await tick(new Coordinator(h.game, h.nextBeat()!));
    h.releasePresence();
    await flushMicrotasks(40);
    h.reset();
    h.jumpToFlow("opening");
    await tick(new Coordinator(h.game, h.nextBeat()!));
    expect(h.heldPresence()).toEqual([]);
    const [animate] = wire(h.messages).filter((m: any) => m?.method === "ui/animate");
    expect(animate).toBeDefined();
    expect(typedOut(h).filter((m: any) => !m.params.held)).toEqual([]);
    h.game.connection.receive({ jsonrpc: "2.0", id: animate.id, result: [0] } as any);
    await flushMicrotasks(40);
    expect(typedOut(h).filter((m: any) => !m.params.held)).toHaveLength(1);
  });

  test("a line shown in a box and a stream at once holds the typing in both", async () => {
    const h = await beside(true);
    h.jumpToFlow("words");
    await tick(new Coordinator(h.game, h.nextBeat()!));
    expect(h.heldPresence().length).toBeGreaterThan(0);
    const writes = typedOut(h);
    expect(new Set(writes.map((m: any) => m.params.target)).size).toBeGreaterThan(1);
    expect(writes.filter((m: any) => !m.params.held)).toEqual([]);
    h.releasePresence();
    await flushMicrotasks(40);
    expect(typedOut(h).filter((m: any) => !m.params.held).length).toBe(writes.length);
  });
});
