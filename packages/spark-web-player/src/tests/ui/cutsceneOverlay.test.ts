// A cutscene on the page (I-1383): `[[play NAME]]` mounts a full-screen
// `<div class="cutscene"><video class="object">` above every layout, plays
// it, and answers the game's `ui/play-cutscene` once the video has ended or
// the player has skipped it, after its exit transition, which removes it. The
// click or key that skips it goes no further, so the game advances once. A
// preview shows its first frame and answers at once. It pauses, resumes and
// skips with the game, plays its sound through the `movie` mixer and keeps
// its file resident.

import { Coordinator } from "@impower/spark-engine/src/game/core/classes/Coordinator";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { describe, expect, test, vi } from "vitest";
import AssetManager from "../../app/managers/AssetManager";
import AudioManager from "../../app/managers/AudioManager";
import { getEventData } from "../../app/utils/getEventData";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";
import { fakeAudioContext, stubMedia } from "./mediaStubs";

// A real game compiles and replays its route for each test here; on a busy
// machine that can outlast the default timeout.
vi.setConfig({ testTimeout: 60_000 });

const INTRO = "/file:/proj/intro.webm?v=1";

const SOURCE = `define intro as video with
  src = "${INTRO}"
end

define film as mixer with
  gain = 0.25
end

define movie as channel with
  mixer = "film"
end

-> start

scene start
  [[play intro]]
  After.
end

scene looped
  [[play intro loop]]
  After the loop.
end

scene faded
  [[play intro with fade]]
  After the fade.
end

scene spun
  [[play intro with spin]]
  After the spin.
end
`;

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));

/** The page's application: the stub the harness built. */
const appOf = (h: { ui: any }) => h.ui.app as any;

const cutsceneOf = (overlay: HTMLElement) =>
  overlay.querySelector(".cutscene") as HTMLElement | null;

const videoOf = (overlay: HTMLElement) =>
  overlay.querySelector(".cutscene video") as HTMLVideoElement | null;

/** The game's `ui/play-cutscene` requests as the page receives them, and the
 *  page's answers to them. */
function recordCutscenes(h: ReturnType<typeof createDOMHarness>) {
  const requests: any[] = [];
  const answers: any[] = [];
  const router: any = h.router;
  const receive = router.receive.bind(router);
  router.receive = (message: any) => {
    if (message?.method === "ui/play-cutscene" && "id" in message) {
      requests.push(message);
    }
    receive(message);
  };
  const connection: any = h.game.connection;
  const back = connection.receive.bind(connection);
  connection.receive = (message: any) => {
    if (
      message &&
      !("params" in message) &&
      requests.some((r) => r.id === message.id)
    ) {
      answers.push(message);
    }
    return back(message);
  };
  return { requests, answers };
}

/** A page whose game plays on, at `flow`, with the asset cache able to fetch
 *  a video into an object URL when `resident` holds. */
async function playing(flow: string, opts: { resident?: boolean } = {}) {
  const h = createDOMHarness(SOURCE, 0, { compose: true });
  const media = stubMedia(h.overlay);
  await h.ready;
  h.game.module.ui.sweepReconcile();
  await flushMicrotasks(10);
  h.game.context.system.previewing = undefined;
  if (opts.resident) {
    let n = 0;
    const cache = appOf(h).assetCache;
    cache._deps.fetchBytes = async () => ({
      bytes: new ArrayBuffer(100),
      type: "video/webm",
    });
    cache._deps.createObjectURL = () => `blob:page/${++n}`;
  }
  const recorded = recordCutscenes(h);
  // What the game does once the beat is over, counted rather than done.
  const advanced = {
    auto: vi.spyOn(h.game, "autoAdvancedToContinue").mockImplementation(() => {}),
    clicked: vi.spyOn(h.game, "clickedToContinue").mockImplementation(() => {}),
  };
  h.jumpTo(flow);
  return { h, media, advanced, ...recorded };
}

/** Run the next beat on a coordinator, as PLAY does, with the page's
 *  pointer and key events reaching it as `Application.bind` sends them. */
async function runBeat(h: ReturnType<typeof createDOMHarness>) {
  const next = h.nextBeat();
  expect(next?.cutscene).toBeTruthy();
  const coordinator = new Coordinator(h.game, next!);
  const send = (e: Event) =>
    coordinator.onMessage(EventMessage.type.notification(getEventData(e)));
  const gameEvents: string[] = [];
  const onOverlay = (e: Event) => {
    gameEvents.push(e.type);
    send(e);
  };
  h.overlay.addEventListener("pointerdown", onOverlay);
  const win = h.overlay.ownerDocument.defaultView!;
  win.addEventListener("keydown", onOverlay);
  const tick = async (rounds = 10) => {
    for (let i = 0; i < rounds; i += 1) {
      await flushMicrotasks();
      coordinator.onUpdate({ deltaMS: 100 } as any);
    }
    await flushMicrotasks(10);
  };
  await tick();
  return { coordinator, tick, gameEvents };
}

const pointerDown = (target: Element) => {
  const win = target.ownerDocument.defaultView as any;
  const e = new win.MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  target.dispatchEvent(e);
  return e as Event;
};

const keyDown = (target: Element, key: string, init: object = {}) => {
  const win = target.ownerDocument.defaultView as any;
  const e = new win.KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ...init,
  });
  target.dispatchEvent(e);
  return e as Event;
};

/** Web animations that run until they are finished or cancelled, as a
 *  browser's do: the harness's own finish at once. Each records whether its
 *  styles were kept. */
function holdAnimations() {
  const animations: {
    keyframes: unknown;
    cancelled: boolean;
    committed: boolean;
    finish: () => void;
  }[] = [];
  const g = globalThis as any;
  const previous = g.Animation;
  g.Animation = class {
    startTime: number | null = null;
    finished: Promise<unknown>;
    record: (typeof animations)[number];
    constructor(public effect?: any) {
      let resolve!: (v: unknown) => void;
      let reject!: (e: unknown) => void;
      this.finished = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      this.record = {
        keyframes: effect?.keyframes,
        cancelled: false,
        committed: false,
        finish: () => resolve(this),
      };
      // A cancelled animation's `finished` rejects.
      (this as any).abort = () => reject(new Error("AbortError"));
      animations.push(this.record);
    }
    play() {}
    finish() {
      this.record.finish();
    }
    cancel() {
      this.record.cancelled = true;
      (this as any).abort();
    }
    commitStyles() {
      this.record.committed = true;
    }
  };
  return { animations, restore: () => (g.Animation = previous) };
}

const fire = (el: Element, type: string) => {
  const win = el.ownerDocument.defaultView as any;
  el.dispatchEvent(new win.Event(type));
};

describe("a cutscene on the page, in play", () => {
  test("covers every layout with the object URL of a resident file, and plays it", async () => {
    const { h, media, requests, answers } = await playing("start", {
      resident: true,
    });
    await runBeat(h);
    expect(requests).toHaveLength(1);
    const cutscene = cutsceneOf(h.overlay);
    expect(cutscene).not.toBeNull();
    // Above every layout: the last thing in the overlay, where the builtin
    // `cutscene` style stands it over them.
    expect(h.overlay.lastElementChild).toBe(cutscene);
    const video = videoOf(h.overlay)!;
    expect(video.classList.contains("object")).toBe(true);
    expect(video.classList.contains("cutscene_video")).toBe(true);
    expect(video.getAttribute("src")).toMatch(/^blob:page\//);
    expect(video.getAttribute("data-src")).toBe(INTRO);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.loop).toBe(false);
    expect(video.muted).toBe(false);
    expect(video.style.visibility).toBe("visible");
    expect(media.of(video, "play")).toBe(1);
    expect(answers).toHaveLength(0);
  });

  test("plays the file itself when it is not resident", async () => {
    const { h, media } = await playing("start");
    await runBeat(h);
    const video = videoOf(h.overlay)!;
    expect(video.getAttribute("src")).toBe(INTRO);
    expect(media.of(video, "play")).toBe(1);
  });

  test("answers once the video ends, then goes, and the story goes on by itself", async () => {
    const { h, answers, advanced } = await playing("start");
    const { tick } = await runBeat(h);
    const video = videoOf(h.overlay)!;
    expect(advanced.auto).not.toHaveBeenCalled();
    (video as any).__ended = true;
    fire(video, "ended");
    await tick();
    expect(answers).toHaveLength(1);
    expect(answers[0].error).toBeUndefined();
    expect(cutsceneOf(h.overlay)).toBeNull();
    expect(advanced.auto).toHaveBeenCalled();
    expect(advanced.clicked).not.toHaveBeenCalled();
  });

  test("a `loop` cutscene does not answer when the video ends, and a click ends it", async () => {
    const { h, answers, advanced } = await playing("looped");
    const { tick } = await runBeat(h);
    const video = videoOf(h.overlay)!;
    expect(video.loop).toBe(true);
    fire(video, "ended");
    await tick();
    expect(answers).toHaveLength(0);
    expect(cutsceneOf(h.overlay)).not.toBeNull();
    expect(advanced.auto).not.toHaveBeenCalled();
    pointerDown(video);
    await tick();
    expect(answers).toHaveLength(1);
    expect(cutsceneOf(h.overlay)).toBeNull();
    expect(advanced.auto).toHaveBeenCalled();
  });

  test("a click answers it exactly once, and the game never sees the click", async () => {
    const { h, answers, advanced } = await playing("start");
    const { tick, gameEvents } = await runBeat(h);
    const video = videoOf(h.overlay)!;
    expect(pointerDown(video).defaultPrevented).toBe(true);
    // A second click lands during the exit, and a third once it has gone.
    pointerDown(video);
    await tick();
    pointerDown(h.overlay);
    await tick();
    expect(answers).toHaveLength(1);
    // The game saw only the click after the cutscene had gone.
    expect(gameEvents).toEqual(["pointerdown"]);
    expect(advanced.auto).toHaveBeenCalled();
    expect(advanced.clicked).not.toHaveBeenCalled();
  });

  test("an advance key ends it, and the game never sees the key", async () => {
    const { h, answers, advanced } = await playing("start");
    const { tick, gameEvents } = await runBeat(h);
    const body = h.overlay.ownerDocument.body;
    // Another key, a held key and a shortcut are left for the game.
    const left = [
      keyDown(body, "a"),
      keyDown(body, "Enter", { repeat: true }),
      keyDown(body, "Enter", { ctrlKey: true }),
    ];
    await tick();
    expect(answers).toHaveLength(0);
    expect(gameEvents).toEqual(["keydown", "keydown", "keydown"]);
    expect(left.map((e) => e.defaultPrevented)).toEqual([false, false, false]);
    // The key that skips it does nothing else: a focused control is not
    // pressed by it, nor the page scrolled.
    const skip = keyDown(body, "Enter");
    expect(skip.defaultPrevented).toBe(true);
    await tick();
    expect(answers).toHaveLength(1);
    expect(gameEvents).toHaveLength(3);
    expect(cutsceneOf(h.overlay)).toBeNull();
    expect(advanced.auto).toHaveBeenCalled();
    expect(advanced.clicked).not.toHaveBeenCalled();
  });

  test("`ui/skip-cutscene` ends it as a click does", async () => {
    const { h, answers } = await playing("looped");
    const { tick } = await runBeat(h);
    expect(answers).toHaveLength(0);
    expect(cutsceneOf(h.overlay)).not.toBeNull();
    h.game.module.ui.skipCutscene();
    await tick();
    expect(answers).toHaveLength(1);
    expect(answers[0].error).toBeUndefined();
    expect(cutsceneOf(h.overlay)).toBeNull();
  });

  test("pauses with the game, resumes with it, and skips with its clock", async () => {
    const { h, media } = await playing("start");
    await runBeat(h);
    const video = videoOf(h.overlay)!;
    (video as any).__duration = 10;
    video.currentTime = 1;
    h.ui.onPause();
    expect(media.of(video, "pause")).toBe(1);
    expect(video.paused).toBe(true);
    h.ui.onUnpause();
    expect(media.of(video, "play")).toBe(2);
    h.ui.onSkip(0.5);
    expect(video.currentTime).toBe(1.5);
  });

  test("keeps its file resident while it is on the page", async () => {
    const { h } = await playing("start");
    const { tick } = await runBeat(h);
    const assets = new AssetManager(appOf(h));
    const pins = () => assets.derivedPins();
    expect(pins()).toContain(INTRO);
    const video = videoOf(h.overlay)!;
    (video as any).__ended = true;
    fire(video, "ended");
    await tick();
    expect(pins()).not.toContain(INTRO);
  });

  test("plays its sound through the mixer the `movie` channel names", async () => {
    const { h } = await playing("start");
    const { context, sources } = fakeAudioContext();
    const app = appOf(h);
    app.audioContext = context;
    const audio = new AudioManager(app);
    app.audio = audio;
    await runBeat(h);
    const video = videoOf(h.overlay)!;
    const mixerNode = (audio as any)._audioMixers.get("film")?.volumeNode;
    expect(mixerNode?.gain.value).toBe(0.25);
    const routed = sources.filter((s) => s.mediaElement === video);
    expect(routed).toHaveLength(1);
    expect(routed[0].outputs).toEqual([mixerNode]);
  });

  test("`with fade` fades it in before it plays, and out before it goes", async () => {
    const { h, media, answers } = await playing("faded");
    const win = h.overlay.ownerDocument.defaultView as any;
    const effects: { target: HTMLElement; keyframes: any; opacity: string }[] = [];
    const KeyframeEffect = win.KeyframeEffect;
    const restore = (globalThis as any).KeyframeEffect;
    (globalThis as any).KeyframeEffect = class extends KeyframeEffect {
      constructor(target: HTMLElement, keyframes: any, options: any) {
        super(target, keyframes, options);
        effects.push({ target, keyframes, opacity: target.style.opacity });
      }
    };
    try {
      const { tick } = await runBeat(h);
      const cutscene = cutsceneOf(h.overlay)!;
      const video = videoOf(h.overlay)!;
      // In from hidden, and then it plays.
      expect(effects).toEqual([
        {
          target: cutscene,
          keyframes: [{ opacity: "0" }, { opacity: "1" }],
          opacity: "0",
        },
      ]);
      expect(cutscene.style.opacity).toBe("");
      expect(media.of(video, "play")).toBe(1);
      pointerDown(video);
      await tick();
      // Out on the frame it stopped on, and then it goes.
      expect(effects[1]).toMatchObject({
        target: cutscene,
        keyframes: [{ opacity: "0" }],
      });
      expect(media.of(video, "pause")).toBeGreaterThan(0);
      expect(answers).toHaveLength(1);
      expect(cutsceneOf(h.overlay)).toBeNull();
    } finally {
      (globalThis as any).KeyframeEffect = restore;
    }
  });

  test("a skip during its enter transition stops it where it reached and plays the exit", async () => {
    const { h, media, answers } = await playing("faded");
    const held = holdAnimations();
    try {
      const { tick } = await runBeat(h);
      const [enter] = held.animations;
      expect(enter?.keyframes).toEqual([{ opacity: "0" }, { opacity: "1" }]);
      const video = videoOf(h.overlay)!;
      expect(media.of(video, "play")).toBe(0);
      pointerDown(video);
      await tick();
      // The enter stops on the frame it reached, the movie never starts,
      // and the exit plays from there.
      expect(enter).toMatchObject({ cancelled: true, committed: true });
      expect(media.of(video, "play")).toBe(0);
      const exit = held.animations[1];
      expect(exit?.keyframes).toEqual([{ opacity: "0" }]);
      expect(answers).toHaveLength(0);
      exit!.finish();
      await tick();
      expect(answers).toHaveLength(1);
      expect(cutsceneOf(h.overlay)).toBeNull();
    } finally {
      held.restore();
    }
  });

  test("a transition that does not fade plays on it as it stands, and one that never ends is cut short by a click", async () => {
    const { h, answers } = await playing("spun");
    const held = holdAnimations();
    try {
      const { tick } = await runBeat(h);
      const cutscene = cutsceneOf(h.overlay)!;
      const [enter] = held.animations;
      expect(enter?.keyframes).toEqual([{ transform: "rotate(360deg)" }]);
      // `spin` turns it and never ends: it is not hidden while it turns.
      expect(cutscene.style.opacity).toBe("");
      const video = videoOf(h.overlay)!;
      pointerDown(video);
      await tick();
      const exit = held.animations[1];
      expect(exit?.keyframes).toEqual([{ transform: "rotate(360deg)" }]);
      expect(answers).toHaveLength(0);
      // A click during the exit takes it down.
      expect(pointerDown(video).defaultPrevented).toBe(true);
      await tick();
      expect(exit?.cancelled).toBe(true);
      expect(answers).toHaveLength(1);
      expect(cutsceneOf(h.overlay)).toBeNull();
    } finally {
      held.restore();
    }
  });

  test.each([
    ["its enter transition", false],
    ["its exit transition", true],
  ])(
    "a run that ends during %s takes it down and answers at once",
    async (_, exiting) => {
      const { h, answers } = await playing("faded");
      const held = holdAnimations();
      try {
        const { tick } = await runBeat(h);
        if (exiting) {
          pointerDown(videoOf(h.overlay)!);
          await tick();
        }
        const transition = held.animations[held.animations.length - 1]!;
        expect(transition.keyframes).toEqual([
          { opacity: exiting ? "0" : "1" },
        ]);
        h.ui.onDispose();
        expect(cutsceneOf(h.overlay)).toBeNull();
        await flushMicrotasks(50);
        expect(transition.cancelled).toBe(true);
        expect(answers).toHaveLength(1);
      } finally {
        held.restore();
      }
    },
  );

  test("a page built for the next run, or a second cutscene, takes one still entering down and answers it at once", async () => {
    const { h, answers } = await playing("faded");
    const held = holdAnimations();
    try {
      await runBeat(h);
      const first = cutsceneOf(h.overlay);
      // A second cutscene replaces it.
      const secondDone = (h.ui as any).playCutscene({
        src: INTRO,
        loop: true,
        muted: true,
        mixer: "movie",
        mixerGain: 1,
      });
      expect(first?.isConnected).toBe(false);
      await flushMicrotasks(50);
      expect(answers).toHaveLength(1);
      // A new page over the same overlay takes the second down.
      const second = cutsceneOf(h.overlay);
      expect(second).not.toBeNull();
      const next = new (h.ui.constructor as any)(appOf(h));
      await next.onInit();
      expect(second?.isConnected).toBe(false);
      const settled = await Promise.race([
        secondDone.then(() => "settled"),
        flushMicrotasks(10).then(() => "pending"),
      ]);
      expect(settled).toBe("settled");
    } finally {
      held.restore();
    }
  });

  test("a run that ends while it plays takes it down and answers", async () => {
    const { h, answers } = await playing("looped");
    await runBeat(h);
    const video = videoOf(h.overlay)!;
    h.ui.onDispose();
    expect(cutsceneOf(h.overlay)).toBeNull();
    expect(video.hasAttribute("src")).toBe(false);
    await flushMicrotasks(10);
    expect(answers).toHaveLength(1);
  });
});

describe("a cutscene on the page, in a preview", () => {
  test("shows the first frame, never plays it, and answers at once; the next display takes it down", async () => {
    const line = lineOf("[[play intro]]");
    const h = createDOMHarness(SOURCE, line, { compose: true });
    const media = stubMedia(h.overlay);
    await h.ready;
    const { requests, answers } = recordCutscenes(h);
    await h.preview(line);
    await flushMicrotasks(10);
    h.game.module.ui.sweepReconcile();
    await flushMicrotasks(10);
    expect(requests).toHaveLength(1);
    expect(requests[0].params.preview).toBe(true);
    expect(answers).toHaveLength(1);
    const video = videoOf(h.overlay)!;
    expect(video).not.toBeNull();
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(media.of(video, "play")).toBe(0);
    // The game's clock does not reach it.
    h.ui.onUnpause();
    expect(media.of(video, "play")).toBe(0);
    // Its own display's beat, sent after the request in the same stream,
    // leaves it up; the next display, in a newer stream, takes it down.
    const epoch = requests[0].epoch;
    expect(typeof epoch).toBe("number");
    const message = (epoch: number) =>
      ({ jsonrpc: "2.0", method: "game/executed", params: {}, epoch }) as any;
    h.ui.onReceiveNotification(message(epoch));
    expect(cutsceneOf(h.overlay)).not.toBeNull();
    h.ui.onReceiveNotification(message(epoch + 1));
    expect(cutsceneOf(h.overlay)).toBeNull();
  });

  test("a page built for the next display takes it down", async () => {
    const line = lineOf("[[play intro]]");
    const h = createDOMHarness(SOURCE, line, { compose: true });
    stubMedia(h.overlay);
    await h.ready;
    await h.preview(line);
    await flushMicrotasks(10);
    expect(cutsceneOf(h.overlay)).not.toBeNull();
    await h.rerender(SOURCE, lineOf("After."));
    expect(cutsceneOf(h.overlay)).toBeNull();
  });
});
