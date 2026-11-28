import { describe, expect, test } from "vitest";
import { Coordinator } from "../../src/game/core/classes/Coordinator";
import type { Game } from "../../src/game/core/classes/Game";
import {
  createHarness,
  flushMicrotasks,
  type UIHarness,
} from "./harness/uiTestHarness";

const SOURCE = `define ui as config with
  layouts_initial = { }
end

define SPRITE as image with
  src = "https://example.com/hero.png"
end

style portrait {
  opacity = 1
  @initial { opacity = 0 }
  @show { transition-duration = 500ms }
  @hide { opacity = 0 }
}

style dialogue {
  opacity = 1
  @initial { opacity = 0 }
  @show { transition-duration = 500ms }
  @hide { opacity = 0 }
}

style caption {
  opacity = 1
  @initial { opacity = 0 }
  @show { transition-duration = 500ms }
  @hide { opacity = 0 }
}

style action {
  transition = layout 0.5s
}

layout main {
  portrait #clear {
    image
  }
  dialogue #clear {
    text
  }
  caption #clear {
    text
  }
  action #clear {
    text
  }
}

layout menu {
  panel {
    text "Menu"
  }
}

scene start
  [[show portrait SPRITE]]
end
`;

const INLINE = SOURCE.replace(/style action \{[^}]*\}/, "").replace(
  "  action #clear {",
  "  action #clear #transition-property=layout #transition-duration=0.5s {",
);

const LEAD = 20;

const typed = (text: string) =>
  [...text].map((letter, i) => ({ text: letter, after: i * 0.05 }));

const sound = { sound: [{ control: "play", assets: ["beep"] }] };

const shake = { portrait: [{ control: "animate", with: [{ name: "shake" }] }] };

const wire = (messages: any[]): any[] =>
  messages.flatMap((m: any) =>
    (m?.method === "ui/batch" || m?.method === "ui/beat") &&
    Array.isArray(m.params?.messages)
      ? wire(m.params.messages)
      : [m],
  );

const updates = (h: UIHarness, id: string) =>
  wire(h.messages).filter(
    (m: any) =>
      (m?.method === "ui/create" || m?.method === "ui/update") &&
      m.params?.element === id,
  );

const last = (h: UIHarness, id: string, read: (params: any) => unknown) => {
  let value: unknown;
  for (const m of updates(h, id)) {
    const found = read(m.params);
    if (found !== undefined) {
      value = found;
    }
  }
  return value;
};

const markOf = (h: UIHarness, id: string) =>
  last(h, id, (p) =>
    p.attributes && "data-presence" in p.attributes
      ? p.attributes["data-presence"]
      : undefined,
  );

const displayOf = (h: UIHarness, id: string) =>
  last(h, id, (p) => (p.style && "display" in p.style ? p.style.display : undefined));

const visibilityOf = (h: UIHarness, id: string) =>
  last(h, id, (p) =>
    p.style && "visibility" in p.style ? p.style.visibility : undefined,
  );

const typedWrites = (h: UIHarness, words: string) =>
  wire(h.messages).filter(
    (m: any) =>
      m?.method === "ui/write-text" &&
      !m.params.held &&
      !m.params.instant &&
      m.params.instructions.map((i: any) => i.text).join("") === words,
  );

const instantWrites = (h: UIHarness, words: string) =>
  wire(h.messages).filter(
    (m: any) =>
      m?.method === "ui/write-text" &&
      m.params.instant &&
      m.params.instructions.map((i: any) => i.text).join("") === words,
  );

const shakes = (h: UIHarness) =>
  wire(h.messages).filter(
    (m: any) =>
      m?.method === "ui/write-image" &&
      m.params.target === "portrait" &&
      !m.params.instant &&
      m.params.instructions.some((i: any) => i.control === "animate"),
  );

const layoutSettles = (h: UIHarness) =>
  wire(h.messages).filter(
    (m: any) => m?.method === "ui/layout" && m.params?.settle,
  );

const animateRequests = (h: UIHarness) =>
  wire(h.messages).filter((m: any) => m?.method === "ui/animate");

const playing = (game: Game) => {
  game.context.system.previewing = undefined;
  game.context.system.composeBeats = true;
};

async function tick(coordinator: Coordinator<Game>, times = 10) {
  for (let i = 0; i < times; i += 1) {
    await flushMicrotasks(10);
    (coordinator as any)._onTick?.(100);
  }
  await flushMicrotasks(20);
}

interface Scene {
  h: UIHarness;
  clock: { now: number };
  sounds: number[];
  ids: { portrait: string; dialogue: string; caption: string; action: string };
}

async function scene(
  holdLayout: boolean,
  source = SOURCE,
  menuOpen = false,
): Promise<Scene> {
  const h = createHarness(source, 0, {
    reactive: true,
    autoOpenAll: false,
    holdPresence: true,
    holdLayout,
    holdAnimations: true,
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
  audio.triggerAll = (ids: number[], time: number) => {
    if (ids.length > 0) {
      sounds.push(time);
    }
  };
  const ui = h.game.module.ui;
  h.jumpToFlow("start");
  ui.setMotion(true);
  await ui.image.write("portrait", h.nextBeat()!.image!["portrait"]! as any, false);
  h.releasePresence();
  await flushMicrotasks(30);
  const prior = new Coordinator(h.game, {
    end: 0,
    text: { dialogue: typed("Hi."), action: typed("First.") },
    image: { portrait: [{ control: "show", assets: ["SPRITE"] }] },
  } as any);
  await tick(prior);
  h.releasePresence();
  h.releaseLayout();
  await flushMicrotasks(40);
  await tick(prior, 2);
  const ids = {
    portrait: ui.findIds("portrait")[0]!,
    dialogue: ui.findIds("dialogue")[0]!,
    caption: ui.findIds("caption")[0]!,
    action: ui.findIds("action")[0]!,
  };
  if (menuOpen) {
    await ui.openLayout("menu", undefined, true);
    await flushMicrotasks(30);
  }
  h.reset();
  sounds.length = 0;
  return { h, clock, sounds, ids };
}

const answerAnimations = (h: UIHarness) => {
  for (const request of animateRequests(h)) {
    h.game.connection.receive({ jsonrpc: "2.0", id: request.id, result: [0] } as any);
  }
};

interface Kind {
  name: string;
  holdLayout: boolean;
  source?: string;
  menuOpen?: boolean;
  playedOut?: (s: Scene) => void;
  settled?: (s: Scene) => void;
  words: string;
  beat: (words: string) => Record<string, unknown>;
  pending: (s: Scene) => void;
  release: (s: Scene) => void;
  final: (s: Scene) => void;
}

const kinds: Kind[] = [
  {
    name: "an arrival",
    holdLayout: false,
    words: "Arriving.",
    beat: (words) => ({
      text: { dialogue: typed("Hi."), action: typed("First."), caption: typed(words) },
      audio: sound,
      image: shake,
    }),
    pending: (s) => {
      expect(s.h.heldPresence()).not.toEqual([]);
      expect(markOf(s.h, s.ids.caption)).toBe("initial");
    },
    release: (s) => {
      s.h.releasePresence();
    },
    final: (s) => {
      expect((s.h.game.module.ui as any)._presence.has(
        (s.h.game.module.ui as any).findElements("caption", true)[0],
      )).toBe(false);
      expect(displayOf(s.h, s.ids.caption)).toBeNull();
    },
  },
  {
    name: "a departure",
    holdLayout: false,
    words: "Leaving.",
    beat: (words) => ({
      text: { action: typed(words) },
      audio: sound,
      image: shake,
    }),
    pending: (s) => {
      expect(s.h.heldPresence()).not.toEqual([]);
      expect(displayOf(s.h, s.ids.dialogue)).not.toBe("none");
    },
    release: (s) => {
      s.h.releasePresence();
    },
    final: (s) => {
      expect(displayOf(s.h, s.ids.dialogue)).toBe("none");
    },
  },
  {
    name: "a using transition",
    holdLayout: false,
    words: "Menu.",
    beat: (words) => ({
      text: { dialogue: typed("Hi."), action: typed(words) },
      layout: { menu: [{ control: "open", name: "menu", using: "fade" }] },
      audio: sound,
      image: shake,
    }),
    pending: (s) => {
      expect(animateRequests(s.h)).toHaveLength(1);
    },
    release: (s) => {
      answerAnimations(s.h);
    },
    final: (s) => {
      const menu = (s.h.game.module.ui as any)._mountedLayouts.get("menu")?.element?.id;
      expect(menu).toBeDefined();
      expect(visibilityOf(s.h, menu)).toBeNull();
    },
  },
  {
    name: "a layout move",
    holdLayout: true,
    words: "A much longer line that makes the box grow.",
    beat: (words) => ({
      text: { dialogue: typed("Hi."), action: typed(words) },
      audio: sound,
      image: shake,
    }),
    pending: (s) => {
      expect(s.h.heldLayout()).not.toEqual([]);
    },
    release: (s) => {
      s.h.releaseLayout([s.ids.action]);
    },
    final: () => {},
  },
  {
    name: "an inline layout move",
    holdLayout: true,
    source: INLINE,
    words: "A much longer line that makes the inline box grow.",
    beat: (words) => ({
      text: { dialogue: typed("Hi."), action: typed(words) },
      audio: sound,
      image: shake,
    }),
    pending: (s) => {
      expect(s.h.heldLayout()).not.toEqual([]);
    },
    release: (s) => {
      s.h.releaseLayout([s.ids.action]);
    },
    final: () => {},
    settled: (s) => {
      expect(layoutSettles(s.h)).toHaveLength(1);
    },
  },
  {
    name: "a with beside a styled arrival",
    holdLayout: false,
    words: "Menu.",
    beat: (words) => ({
      text: { dialogue: typed("Hi."), action: typed(words) },
      layout: { menu: [{ control: "open", name: "menu", with: [{ name: "shake" }] }] },
      audio: sound,
      image: shake,
    }),
    pending: (s) => {
      expect(s.h.heldPresence()).not.toEqual([]);
      expect(animateRequests(s.h)).toHaveLength(1);
    },
    release: (s) => {
      s.h.releasePresence();
      answerAnimations(s.h);
    },
    final: (s) => {
      expect((s.h.game.module.ui as any)._mountedLayouts.get("menu")?.element?.id).toBeDefined();
    },
  },
  {
    name: "a with beside a styled departure",
    holdLayout: false,
    menuOpen: true,
    words: "Closing.",
    beat: (words) => ({
      text: { dialogue: typed("Hi."), action: typed(words) },
      layout: { menu: [{ control: "close", name: "menu", with: [{ name: "shake" }] }] },
      audio: sound,
      image: shake,
    }),
    pending: (s) => {
      expect(s.h.heldPresence()).not.toEqual([]);
      expect(animateRequests(s.h)).toHaveLength(1);
      expect(destroyedIn(s.h, menuOf(s.h))).toEqual([]);
    },
    release: (s) => {
      s.h.releasePresence();
      answerAnimations(s.h);
    },
    final: (s) => {
      expect(destroyedIn(s.h, menuOf(s.h))).toHaveLength(1);
      expect((s.h.game.module.ui as any)._retiring.size).toBe(0);
    },
    settled: (s) => {
      expect(destroyedIn(s.h, menuOf(s.h))).toHaveLength(1);
    },
  },
  {
    name: "a retiring layout departure",
    holdLayout: false,
    menuOpen: true,
    words: "Closing.",
    beat: (words) => ({
      text: { dialogue: typed("Hi."), action: typed(words) },
      layout: { menu: [{ control: "close", name: "menu", using: "fade" }] },
      audio: sound,
      image: shake,
    }),
    pending: (s) => {
      expect(animateRequests(s.h)).toHaveLength(1);
      expect(destroyedIn(s.h, menuOf(s.h))).toEqual([]);
    },
    release: (s) => {
      answerAnimations(s.h);
    },
    final: (s) => {
      expect(destroyedIn(s.h, menuOf(s.h))).toHaveLength(1);
    },
    playedOut: (s) => {
      const menu = menuOf(s.h);
      const beats = s.h.messages.filter(
        (m: any) =>
          m?.method === "ui/beat" &&
          wire(m.params.messages).some(
            (inner: any) => inner?.method === "ui/destroy" && inner.params?.element === menu,
          ),
      );
      expect(beats).toHaveLength(1);
      expect(
        wire(beats[0].params.messages).some((inner: any) => inner?.method === "ui/layout"),
      ).toBe(true);
    },
    settled: (s) => {
      expect(destroyedIn(s.h, menuOf(s.h))).toHaveLength(1);
    },
  },
];

const menuOf = (h: UIHarness): string => animateRequests(h)[0]?.params.effects[0]?.element;

const destroyedIn = (h: UIHarness, id: string) =>
  wire(h.messages).filter(
    (m: any) => m?.method === "ui/destroy" && m.params?.element === id,
  );

interface Ending {
  name: string;
  run: (s: Scene, coordinator: Coordinator<Game>, kind: Kind) => Promise<void>;
  check: (s: Scene, kind: Kind, before: number) => void;
}

const MOTION_END = 700;

const endings: Ending[] = [
  {
    name: "plays out",
    run: async (s, coordinator, kind) => {
      s.clock.now = MOTION_END;
      kind.release(s);
      await flushMicrotasks(60);
      await tick(coordinator, 2);
    },
    check: (s, kind) => {
      kind.final(s);
      const [write] = typedWrites(s.h, kind.words);
      expect(write?.params.time).toBeGreaterThanOrEqual(MOTION_END);
      expect(s.sounds).toEqual([MOTION_END + LEAD]);
      const [animate] = shakes(s.h);
      expect(animate?.params.time).toBeGreaterThanOrEqual(MOTION_END);
      expect((s.h.game.module.ui as any)._line).toBeUndefined();
      kind.playedOut?.(s);
    },
  },
  {
    name: "one click",
    run: async (s, coordinator) => {
      s.clock.now = 100;
      coordinator.onMessage({
        jsonrpc: "2.0",
        method: "event",
        params: { type: "pointerdown", button: 0 },
      } as any);
      coordinator.shouldContinue();
      await flushMicrotasks(40);
    },
    check: (s, kind) => {
      expect((s.h.game.module.ui as any)._line).toBeUndefined();
      expect(instantWrites(s.h, kind.words)).toHaveLength(1);
      expect(s.sounds).toEqual([100 + LEAD]);
      if (kind.name === "an arrival") {
        expect(markOf(s.h, s.ids.caption)).toBeNull();
      }
      if (kind.name === "a departure") {
        expect(displayOf(s.h, s.ids.dialogue)).toBe("none");
      }
      if (kind.name === "a using transition" || kind.name === "a with beside a styled arrival") {
        const menu = (s.h.game.module.ui as any)._mountedLayouts.get("menu")?.element?.id;
        if (kind.name === "a using transition") {
          expect(visibilityOf(s.h, menu)).toBeNull();
        }
        expect(markOf(s.h, menu)).toBeNull();
      }
      if (kind.name === "a layout move") {
        expect(layoutSettles(s.h)).toHaveLength(1);
      }
      kind.settled?.(s);
    },
  },
  {
    name: "a replacing line",
    run: async (s, _coordinator, kind) => {
      await tick(new Coordinator(s.h.game, { end: 0, ...kind.beat("Replaced.") } as any));
      s.clock.now = MOTION_END;
      kind.release(s);
      s.h.releasePresence();
      s.h.releaseLayout();
      answerAnimations(s.h);
      await flushMicrotasks(60);
    },
    check: (s, kind) => {
      expect(typedWrites(s.h, kind.words)).toEqual([]);
      kind.final(s);
    },
  },
  {
    name: "an instant display",
    run: async (s, _coordinator, kind) => {
      await tick(
        new Coordinator(s.h.game, { end: 0, ...kind.beat(kind.words) } as any, {
          settled: "presented",
        }),
        2,
      );
    },
    check: (s, kind) => {
      expect((s.h.game.module.ui as any)._line).toBeUndefined();
      expect(typedWrites(s.h, kind.words)).toEqual([]);
      expect(instantWrites(s.h, kind.words).length).toBeGreaterThan(0);
      if (kind.name === "an arrival") {
        expect(markOf(s.h, s.ids.caption)).toBeNull();
      }
      if (kind.name === "a departure") {
        expect(displayOf(s.h, s.ids.dialogue)).toBe("none");
      }
      if (kind.name === "a layout move") {
        expect(layoutSettles(s.h)).toHaveLength(1);
      }
      kind.settled?.(s);
    },
  },
  {
    name: "a reset",
    run: async (s, _coordinator, kind) => {
      s.h.game.reset();
      s.clock.now = MOTION_END;
      kind.release(s);
      await flushMicrotasks(60);
    },
    check: (s, kind) => {
      expect((s.h.game.module.ui as any)._line).toBeUndefined();
      expect(typedWrites(s.h, kind.words)).toEqual([]);
      expect(s.sounds).toEqual([]);
      if (kind.name === "a layout move") {
        expect(layoutSettles(s.h)).toHaveLength(1);
      }
      kind.settled?.(s);
    },
  },
];

describe("every kind of motion a line owns, with every way its wait ends (#2739)", () => {
  for (const kind of kinds) {
    for (const ending of endings) {
      test(`${kind.name}: ${ending.name}`, async () => {
        const s = await scene(kind.holdLayout, kind.source, kind.menuOpen);
        const coordinator = new Coordinator(s.h.game, {
          end: 0,
          ...kind.beat(kind.words),
        } as any);
        await tick(coordinator);
        kind.pending(s);
        expect(typedWrites(s.h, kind.words)).toEqual([]);
        expect(shakes(s.h)).toEqual([]);
        expect(s.sounds).toEqual([]);
        await ending.run(s, coordinator, kind);
        ending.check(s, kind, 0);
      });
    }
  }
});

describe("a line orders its departures, its moves and its arrivals (#2739)", () => {
  test("removes the departures and waits for the moves they start before an arrival begins", async () => {
    const s = await scene(true);
    const presenceRequests = () =>
      wire(s.h.messages)
        .filter((m: any) => m?.method === "ui/presence")
        .flatMap((m: any) => m.params.effects);
    const layoutRequests = () =>
      wire(s.h.messages).filter((m: any) => m?.method === "ui/layout" && !m.params?.settle);
    const words = "A much longer line beside a caption.";
    const coordinator = new Coordinator(s.h.game, {
      end: 0,
      text: { action: typed(words), caption: typed("Caption.") },
      image: { portrait: [{ control: "show", assets: ["SPRITE"] }] },
      audio: sound,
    } as any);
    await tick(coordinator);
    expect(presenceRequests()).toEqual([{ element: s.ids.dialogue, presence: "hide" }]);
    expect(layoutRequests()).toHaveLength(1);
    expect(displayOf(s.h, s.ids.dialogue)).not.toBe("none");

    s.clock.now = 300;
    s.h.releasePresence();
    s.h.releaseLayout([s.ids.action]);
    await flushMicrotasks(60);
    expect(displayOf(s.h, s.ids.dialogue)).toBe("none");
    expect(layoutRequests()).toHaveLength(2);
    expect(presenceRequests().filter((e: any) => e.presence === "show")).toEqual([]);

    s.clock.now = 600;
    s.h.releaseLayout([s.ids.action]);
    await flushMicrotasks(60);
    expect(presenceRequests().filter((e: any) => e.presence === "show")).toEqual([
      { element: s.ids.caption, presence: "show" },
    ]);
    expect(typedWrites(s.h, words)).toEqual([]);

    s.clock.now = 900;
    s.h.releasePresence();
    await flushMicrotasks(60);
    await tick(coordinator, 2);
    expect(typedWrites(s.h, words)[0]?.params.time).toBeGreaterThanOrEqual(900);
    expect(s.sounds).toEqual([900 + LEAD]);
  });
});

describe("the gaps round 4 named, exercised (#2739)", () => {
  test("a player that never answers holds the line, however long, until one click settles it", async () => {
    const s = await scene(true);
    const words = "A much longer line the player never answers for.";
    const coordinator = new Coordinator(s.h.game, {
      end: 0,
      text: { dialogue: typed("Hi."), action: typed(words) },
      audio: sound,
    } as any);
    await tick(coordinator);
    expect(s.h.heldLayout()).not.toEqual([]);
    for (let i = 0; i < 30; i += 1) {
      s.clock.now += 1_000;
      (coordinator as any)._elapsedMS += 1_000;
      await tick(coordinator, 1);
      expect(coordinator.shouldContinue()).toBe(0);
    }
    expect(typedWrites(s.h, words)).toEqual([]);
    expect(s.sounds).toEqual([]);
    coordinator.onMessage({
      jsonrpc: "2.0",
      method: "event",
      params: { type: "pointerdown", button: 0 },
    } as any);
    coordinator.shouldContinue();
    await flushMicrotasks(40);
    expect(instantWrites(s.h, words)).toHaveLength(1);
    expect(layoutSettles(s.h)).toHaveLength(1);
    expect(s.sounds).toHaveLength(1);
  });

  const STORY = SOURCE.replace(
    /scene start[^]*$/,
    `scene start
  [[open main]]
  BUNNY: First words from the dialogue.
  Then a line of action arrives.
end
`,
  );

  const running = async () => {
    const h = createHarness(STORY, 0, {
      reactive: true,
      autoOpenAll: false,
      holdPresence: true,
      beforeConnect: playing,
    });
    await h.ready;
    const drive = async (times = 10) => {
      for (let i = 0; i < times; i += 1) {
        await flushMicrotasks(10);
        (h.game as any)._coordinator?.onUpdate({ deltaMS: 100 });
        h.releaseLayout();
      }
      await flushMicrotasks(20);
    };
    const text = () => (h.game.story.currentText ?? "").trim();
    h.game.start();
    await drive();
    for (let i = 0; i < 12 && text() !== "First words from the dialogue."; i += 1) {
      h.releasePresence();
      h.game.clickedToContinue();
      await drive();
    }
    expect(text()).toBe("First words from the dialogue.");
    h.releasePresence();
    await drive();
    const save = h.game.saveHere();
    h.game.clickedToContinue();
    await drive();
    expect(text()).toBe("Then a line of action arrives.");
    expect(h.heldPresence()).not.toEqual([]);
    expect((h.game.module.ui as any)._line).toBeDefined();
    return { h, drive, text, save };
  };

  const settledAfter = async (r: Awaited<ReturnType<typeof running>>) => {
    expect((r.h.game.module.ui as any)._line).toBeUndefined();
    r.h.reset();
    r.h.releasePresence();
    await r.drive();
    expect(typedWrites(r.h, "Then a line of action arrives.")).toEqual([]);
    const initial = wire(r.h.messages).filter(
      (m: any) =>
        (m?.method === "ui/create" || m?.method === "ui/update") &&
        m.params?.attributes?.["data-presence"] === "initial",
    );
    expect(initial).toEqual([]);
  };

  test("a step back during a line's wait ends the wait and shows the earlier line settled", async () => {
    const r = await running();
    const back = await r.h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    expect(r.text()).toBe("First words from the dialogue.");
    await settledAfter(r);
  });

  test("a loaded save during a line's wait ends the wait and shows the saved line settled", async () => {
    const r = await running();
    expect(r.save).not.toBeNull();
    expect(r.h.game.loadToResume(r.save!.data)).toBe(true);
    r.h.game.start();
    await r.drive();
    expect(r.text()).toBe("First words from the dialogue.");
    await settledAfter(r);
  });
});

const MENU = `define ui as config with
  layouts_initial = { }
end

layout main {
  action #clear { text }
}

layout menu {
  panel { text "Menu" }
}

scene start
  [[open main]] [[open menu]] First.
  [[close menu with fadeout]] [[open menu with fadein]] Second.
  Third.
end
`;

describe("what round 5 found, exercised (#2739)", () => {
  test("a loaded save draws its line's with-clause layout animations settled", async () => {
    const h = createHarness(MENU, 0, {
      reactive: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    expect(h.errors).toEqual([]);
    const answered = new Set<string>();
    const drive = async () => {
      for (let i = 0; i < 20; i += 1) {
        await flushMicrotasks(10);
        (h.game as any)._coordinator?.onUpdate({ deltaMS: 100 });
        h.releasePresence();
        h.releaseLayout();
        for (const m of wire(h.messages)) {
          if (m?.method === "ui/animate" && !answered.has(m.id)) {
            answered.add(m.id);
            h.game.connection.receive({
              jsonrpc: "2.0",
              id: m.id,
              result: [0],
            } as any);
          }
        }
      }
      await flushMicrotasks(30);
    };
    const text = () => (h.game.story.currentText ?? "").trim();
    h.jumpToFlow("start");
    h.game.start();
    await drive();
    for (let i = 0; i < 10 && !text().endsWith("Second."); i += 1) {
      h.game.clickedToContinue();
      await drive();
    }
    expect(text()).toContain("Second.");
    const save = h.game.saveHere();
    expect(save).not.toBeNull();
    expect(wire(h.messages).some((m: any) => m.method === "ui/animate")).toBe(
      true,
    );
    h.reset();
    expect(h.game.loadToResume(save!.data)).toBe(true);
    h.game.start();
    await drive();
    expect(text()).toContain("Second.");
    expect(wire(h.messages).filter((m: any) => m.method === "ui/animate")).toEqual(
      [],
    );
  });

  test("a reset forgets an inline layout transition, so a later line with no motion asks for none", async () => {
    const h = createHarness(MENU, 0, {
      reactive: true,
      autoOpenAll: false,
      holdLayout: true,
      beforeConnect: playing,
    });
    await h.ready;
    const ui = h.game.module.ui;
    await ui.openLayout("main", undefined, true);
    await ui.style.update("action", {
      "transition-property": "layout",
      "transition-duration": "0.5s",
    });
    await ui.style.update("action", {
      "transition-property": null,
      "transition-duration": null,
    });
    h.game.reset();
    await ui.openLayout("main", undefined, true);
    h.reset();
    const c = new Coordinator(h.game, {
      end: 1,
      text: { action: typed("No motion.") },
    } as any);
    await tick(c);
    expect(h.heldLayout()).toEqual([]);
    expect(
      wire(h.messages).some(
        (m: any) =>
          m.method === "ui/write-text" && !m.params.held && !m.params.instant,
      ),
    ).toBe(true);
  });
});
