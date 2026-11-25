import { Coordinator } from "@impower/spark-engine/src/game/core/classes/Coordinator";
import { afterEach, describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks, untilShown } from "./domTestHarness";

const PRESENCE = "data-presence";

class FakeTransition {
  transitionProperty: string;
  playState: AnimationPlayState = "running";
  replaceState: AnimationReplaceState = "active";
  playbackRate = 1;
  startTime: number | null = 0;
  currentTime: number | null = 0;
  timeline = { currentTime: 0 };
  finished: Promise<FakeTransition>;
  effect: { target: Element; getComputedTiming: () => { endTime: number } };
  protected done!: () => void;
  constructor(target: Element, property: string, duration: number) {
    this.transitionProperty = property;
    this.effect = { target, getComputedTiming: () => ({ endTime: duration }) };
    this.finished = new Promise((resolve) => {
      this.done = () => {
        this.playState = "finished";
        resolve(this);
      };
    });
  }
  finish() {
    this.done();
  }
  pause() {
    this.playState = "paused";
  }
}

const started = new Map<string, FakeTransition>();

const motionOf = (element: Element, presence: string) =>
  started.get(`${element.id}:${presence}`);

const installTransitions = (win: any) => {
  win.Element.prototype.getAnimations = function (this: Element) {
    const presence = this.getAttribute(PRESENCE);
    if (presence !== "show" && presence !== "hide") {
      return [];
    }
    const key = `${this.id}:${presence}`;
    if (!started.has(key)) {
      started.set(key, new FakeTransition(this, "opacity", presence === "show" ? 280 : 120));
    }
    const motion = started.get(key)!;
    return motion.playState === "finished" ? [] : [motion];
  };
};

const FADING_BOX = `define ui as config with
  layouts_initial = { }
end

style dialogue {
  opacity = 1
  transition-duration = 80ms
  @initial { opacity = 0 }
  @show { transition-duration = 280ms }
  @hide { opacity = 0; transition-duration = 120ms }
}

layout main {
  dialogue {
    text
  }
  action {
    text
  }
}
`;

async function playing(src: string) {
  const h = createDOMHarness(src, 0, { compose: true, autoOpenAll: false });
  await h.ready;
  installTransitions(h.overlay.ownerDocument.defaultView);
  h.game.module.ui.sweepReconcile();
  await flushMicrotasks(10);
  h.game.context.system.previewing = undefined;
  return h;
}

async function play(h: Awaited<ReturnType<typeof playing>>, beat: Record<string, unknown>) {
  const coordinator = new Coordinator(h.game, { end: 0, ...beat } as any);
  for (let i = 0; i < 10; i += 1) {
    await flushMicrotasks();
    coordinator.onUpdate({ deltaMS: 0 } as any);
  }
  await flushMicrotasks(10);
  await untilShown(h.overlay);
  await flushMicrotasks(20);
}

const marks = (element: Element) => {
  const records: MutationRecord[] = [];
  const observer = new (element.ownerDocument.defaultView as any).MutationObserver(
    (delivered: MutationRecord[]) => {
      records.push(...delivered);
    },
  );
  observer.observe(element, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [PRESENCE],
  });
  return async () => {
    await flushMicrotasks(5);
    records.push(...observer.takeRecords());
    observer.disconnect();
    return records.map((_, i) =>
      i + 1 < records.length ? records[i + 1]!.oldValue : element.getAttribute(PRESENCE),
    );
  };
};

afterEach(() => {
  started.clear();
});

describe("the player plays an element's @initial, @show and @hide (#2733)", () => {
  test("an appearing element takes its @initial look, then its @show properties until its arrival ends", async () => {
    const h = await playing(FADING_BOX);
    const box = h.overlay.querySelector(".dialogue") as HTMLElement;
    expect(box.style.display).toBe("none");
    const recorded = marks(box);
    await play(h, { text: { dialogue: [{ text: "Hi." }] } });
    expect(box.style.display).toBe("");
    expect(box.getAttribute(PRESENCE)).toBe("show");
    expect(box.matches(':is([data-presence="show"],[data-presence="show"] *)')).toBe(true);
    const arrival = motionOf(box, "show");
    expect(arrival?.transitionProperty).toBe("opacity");
    arrival!.finish();
    await flushMicrotasks(20);
    expect(box.hasAttribute(PRESENCE)).toBe(false);
    expect(await recorded()).toEqual(["initial", "show", null]);
  });

  test("a leaving element stays mounted with its text until its transition ends", async () => {
    const h = await playing(FADING_BOX);
    const box = h.overlay.querySelector(".dialogue") as HTMLElement;
    await play(h, { text: { dialogue: [{ text: "Hi." }] } });
    motionOf(box, "show")!.finish();
    await flushMicrotasks(20);
    await play(h, { text: { action: [{ text: "Then." }] } });
    expect(box.getAttribute(PRESENCE)).toBe("hide");
    expect(box.style.display).toBe("");
    expect(box.textContent).toContain("Hi.");
    motionOf(box, "hide")!.finish();
    for (let i = 0; i < 10; i += 1) {
      await flushMicrotasks(10);
    }
    await untilShown(h.overlay);
    expect(box.style.display).toBe("none");
    expect(box.hasAttribute(PRESENCE)).toBe(false);
    expect(box.textContent).not.toContain("Hi.");
  });

  test("the game's pause holds a running arrival", async () => {
    const h = await playing(FADING_BOX);
    const box = h.overlay.querySelector(".dialogue") as HTMLElement;
    await play(h, { text: { dialogue: [{ text: "Hi." }] } });
    const arrival = motionOf(box, "show")!;
    expect(arrival.playState).toBe("running");
    (h.ui as any).onPause();
    expect(arrival.playState).toBe("paused");
    await flushMicrotasks(20);
    expect(box.getAttribute(PRESENCE)).toBe("show");
    (h.ui as any).onUnpause();
    arrival.finish();
    await flushMicrotasks(20);
    expect(box.hasAttribute(PRESENCE)).toBe(false);
  });

  test("pausing also holds an endless animation started with the arrival, which does not set its length", async () => {
    const h = await playing(FADING_BOX);
    const fade = new FakeTransition(h.overlay, "opacity", 200);
    const spin = new FakeTransition(h.overlay, "rotate", Infinity);
    const box = h.overlay.querySelector(".dialogue") as HTMLElement;
    box.setAttribute(PRESENCE, "initial");
    box.getAnimations = (() =>
      box.getAttribute(PRESENCE) === "show" ? [fade, spin] : []) as any;
    const arrived = (h.ui as any)._presence.play(box, "show");
    await flushMicrotasks(5);
    (h.ui as any).onPause();
    expect(fade.playState).toBe("paused");
    expect(spin.playState).toBe("paused");
    (h.ui as any).onUnpause();
    fade.finish();
    await arrived;
    expect(box.hasAttribute(PRESENCE)).toBe(false);
  });

  test("an animation started by @initial and kept by @show is part of the arrival", async () => {
    const h = await playing(FADING_BOX);
    const pop = new FakeTransition(h.overlay, "opacity", 600);
    const box = h.overlay.querySelector(".dialogue") as HTMLElement;
    box.getAnimations = (() =>
      box.getAttribute(PRESENCE) === "initial" || box.getAttribute(PRESENCE) === "show"
        ? [pop]
        : []) as any;
    const presence = (h.ui as any)._presence;
    presence.change(box, "initial");
    box.setAttribute(PRESENCE, "initial");
    let arrived = false;
    const arrival = presence.play(box, "show").then(() => {
      arrived = true;
    });
    await flushMicrotasks(10);
    expect(arrived).toBe(false);
    expect(box.getAttribute(PRESENCE)).toBe("show");
    pop.finish();
    await arrival;
    expect(box.hasAttribute(PRESENCE)).toBe(false);
  });

  test("an animation set only in @initial plays out as part of the arrival", async () => {
    const h = await playing(FADING_BOX);
    const box = h.overlay.querySelector(".dialogue") as HTMLElement;
    const pop = Object.assign(new FakeTransition(box, "opacity", 2000), {
      animationName: "pop",
      currentTime: 120,
    });
    (pop.effect as any).getKeyframes = () => [
      { offset: 0, computedOffset: 0, opacity: "0" },
      { offset: 1, computedOffset: 1, opacity: "1" },
    ];
    (pop.effect as any).getTiming = () => ({ duration: 2000, fill: "none" });
    const carried: FakeTransition[] = [];
    const cancelled = new Set<FakeTransition>();
    (box as any).animate = (keyframes: Keyframe[], timing: EffectTiming) => {
      expect(keyframes).toEqual([
        { offset: 0, opacity: "0" },
        { offset: 1, opacity: "1" },
      ]);
      expect(timing.duration).toBe(2000);
      const replay = new FakeTransition(box, "opacity", 2000);
      (replay as any).cancel = () => cancelled.add(replay);
      carried.push(replay);
      return replay;
    };
    box.getAnimations = (() =>
      box.getAttribute(PRESENCE) === "initial" ? [pop] : []) as any;
    const presence = (h.ui as any)._presence;
    presence.change(box, "initial");
    box.setAttribute(PRESENCE, "initial");
    let arrived = false;
    const arrival = presence.play(box, "show").then(() => {
      arrived = true;
    });
    await flushMicrotasks(10);
    expect(carried).toHaveLength(1);
    expect(carried[0]!.currentTime).toBe(120);
    expect(arrived).toBe(false);
    expect(cancelled.has(carried[0]!)).toBe(false);
    carried[0]!.finish();
    await arrival;
    expect(box.hasAttribute(PRESENCE)).toBe(false);
    expect(cancelled.has(carried[0]!)).toBe(true);

    presence.change(box, "initial");
    box.setAttribute(PRESENCE, "initial");
    void presence.play(box, "show");
    await flushMicrotasks(10);
    expect(carried).toHaveLength(2);
    void presence.play(box, "hide");
    await flushMicrotasks(10);
    expect(cancelled.has(carried[1]!)).toBe(true);

    presence.change(box, "initial");
    box.setAttribute(PRESENCE, "initial");
    void presence.play(box, "show");
    await flushMicrotasks(10);
    expect(carried).toHaveLength(3);
    presence.change(box, null);
    expect(cancelled.has(carried[2]!)).toBe(true);
  });

  test("an @initial animation on a pseudo-element is handed over on that pseudo-element", async () => {
    const h = await playing(FADING_BOX);
    const box = h.overlay.querySelector(".dialogue") as HTMLElement;
    const pop = Object.assign(new FakeTransition(box, "opacity", 2000), {
      animationName: "pop",
    });
    Object.assign(pop.effect as any, {
      pseudoElement: "::before",
      getKeyframes: () => [{ offset: 1, computedOffset: 1, opacity: "1" }],
      getTiming: () => ({ duration: 2000 }),
    });
    const options: KeyframeAnimationOptions[] = [];
    (box as any).animate = (_: Keyframe[], timing: KeyframeAnimationOptions) => {
      options.push(timing);
      const replay = new FakeTransition(box, "opacity", 2000);
      (replay as any).cancel = () => {};
      return replay;
    };
    box.getAnimations = (() =>
      box.getAttribute(PRESENCE) === "initial" ? [pop] : []) as any;
    const presence = (h.ui as any)._presence;
    presence.change(box, "initial");
    box.setAttribute(PRESENCE, "initial");
    void presence.play(box, "show");
    await flushMicrotasks(10);
    expect(options).toEqual([{ duration: 2000, pseudoElement: "::before" }]);
  });

  test("an arrival that ends after a newer one has started leaves the newer one's mark alone", async () => {
    const h = await playing(FADING_BOX);
    const box = h.overlay.querySelector(".dialogue") as HTMLElement;
    const first = new FakeTransition(box, "opacity", 200);
    const second = new FakeTransition(box, "opacity", 200);
    let current = first;
    box.getAnimations = (() =>
      box.getAttribute(PRESENCE) === "show" ? [current] : []) as any;
    const presence = (h.ui as any)._presence;
    presence.change(box, "initial");
    box.setAttribute(PRESENCE, "initial");
    const older = presence.play(box, "show");
    await flushMicrotasks(5);
    presence.change(box, "initial");
    box.setAttribute(PRESENCE, "initial");
    current = second;
    void presence.play(box, "show");
    await older;
    await flushMicrotasks(10);
    expect(box.getAttribute(PRESENCE)).toBe("show");
    second.finish();
    await flushMicrotasks(10);
    expect(box.hasAttribute(PRESENCE)).toBe(false);
  });

  test("under reduced motion an endless move started with the arrival is stopped", async () => {
    const h = await playing(FADING_BOX);
    const win = h.overlay.ownerDocument.defaultView as any;
    win.matchMedia = (query: string) => ({ matches: query.includes("prefers-reduced-motion") });
    const fade = new FakeTransition(h.overlay, "opacity", 200);
    const spin = new FakeTransition(h.overlay, "rotate", Infinity);
    const stopped = { cancelled: false };
    (spin as any).cancel = () => {
      stopped.cancelled = true;
      spin.playState = "idle";
    };
    const box = h.overlay.querySelector(".dialogue") as HTMLElement;
    box.setAttribute(PRESENCE, "initial");
    box.getAnimations = (() =>
      box.getAttribute(PRESENCE) === "show" ? [fade, spin] : []) as any;
    void (h.ui as any)._presence.play(box, "show");
    await flushMicrotasks(5);
    expect(stopped.cancelled).toBe(true);
    expect(fade.playState).toBe("running");
  });

  test("a click that shows the whole line removes a branch still leaving", async () => {
    const h = await playing(`define ui as config with
  layouts_initial = { }
end

store shown = true

style badge {
  @hide { opacity = 0 }
}

layout main {
  if shown then
    badge {
      text "Badge"
    }
  end
  dialogue {
    text
  }
}
`);
    const badge = h.overlay.querySelector(".badge") as HTMLElement;
    (h.game.story as any).variablesState.$("shown", false);
    const coordinator = new Coordinator(h.game, { end: 0, text: { dialogue: [{ text: "Hello." }] } } as any);
    for (let i = 0; i < 10; i += 1) {
      await flushMicrotasks(10);
      (coordinator as any)._onTick?.(100);
    }
    await untilShown(h.overlay);
    await flushMicrotasks(20);
    expect(badge.getAttribute(PRESENCE)).toBe("hide");
    expect(badge.isConnected).toBe(true);
    (coordinator as any)._finishedExecution = false;
    (coordinator as any)._startedExecution = true;
    (coordinator as any)._interacted = true;
    coordinator.onUpdate({ deltaMS: 0 } as any);
    await untilShown(h.overlay);
    await flushMicrotasks(30);
    expect(badge.isConnected).toBe(false);
  });

  test("a redisplay during an arrival shows the settled look", async () => {
    const h = await playing(FADING_BOX);
    const box = h.overlay.querySelector(".dialogue") as HTMLElement;
    const line = { end: 0, text: { dialogue: [{ text: "Hi." }] } };
    await play(h, line);
    expect(box.getAttribute(PRESENCE)).toBe("show");
    await h.game.redisplay((message: any) => h.router.receive(message));
    new Coordinator(h.game, line as any, { settled: "restored" });
    await untilShown(h.overlay);
    await flushMicrotasks(30);
    expect(box.hasAttribute(PRESENCE)).toBe(false);
    expect(motionOf(box, "show")?.playState).toBe("finished");
  });

  test("a picture replacing a leaving line clears the line and keeps the target", async () => {
    const h = await playing(`define ui as config with
  layouts_initial = { }
end

define SPRITE as image with
  src = "https://example.com/hero.png"
end

style dialogue {
  @hide { opacity = 0 }
}

layout main {
  dialogue {
    text
    image
  }
}

scene picture
  [[show dialogue SPRITE]]
end
`);
    await play(h, { text: { dialogue: [{ text: "Old caption." }] } });
    const box = h.overlay.querySelector(".dialogue") as HTMLElement;
    expect(box.textContent).toContain("Old caption.");
    h.jumpTo("picture");
    await play(h, h.nextBeat() as any);
    expect(box.querySelector("img")).not.toBeNull();
    expect(box.textContent).not.toContain("Old caption.");
    expect(box.style.display).not.toBe("none");
  });

  test("under reduced motion a move ends at once and a fade still plays", async () => {
    const h = await playing(FADING_BOX);
    const win = h.overlay.ownerDocument.defaultView as any;
    win.matchMedia = (query: string) => ({ matches: query.includes("prefers-reduced-motion") });
    const fade = new FakeTransition(h.overlay, "opacity", 200);
    const move = new FakeTransition(h.overlay, "translate", 200);
    const box = h.overlay.querySelector(".dialogue") as HTMLElement;
    box.setAttribute(PRESENCE, "initial");
    box.getAnimations = (() =>
      box.getAttribute(PRESENCE) === "show" ? [fade, move] : []) as any;
    void (h.ui as any)._presence.play(box, "show");
    await flushMicrotasks(5);
    expect(move.playState).toBe("finished");
    expect(fade.playState).toBe("running");
  });
});
