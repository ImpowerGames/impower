import { BeatMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/BeatMessage";
import { CreateElementMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/CreateElementMessage";
import { WriteImageMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import breakpoints from "@impower/spark-engine/src/game/modules/ui/builtinBreakpoints.json";
import { afterEach, describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SOURCE = `

scene start
  HERO: Do you understand?
end
`;

const LINE = SOURCE.split("\n").findIndex((l) => l.includes("Do you understand?"));

const fadeout = (duration: string, keyframes: Record<string, string>[] = [{ opacity: "0" }]) => ({
  $type: "animation",
  $name: "fadeout",
  keyframes,
  timing: { duration, delay: "0s", easing: "linear", fill: "both" },
});

const saved = {
  Animation: (globalThis as any).Animation,
  KeyframeEffect: (globalThis as any).KeyframeEffect,
  getAnimations: (Element.prototype as any).getAnimations,
};

interface HeldAnimation {
  effect: { target: HTMLElement; timing: { duration?: number } };
  end(): void;
}

function holdAnimations() {
  const g = globalThis as any;
  const all: HeldAnimation[] = [];
  g.KeyframeEffect = class {
    composite = "replace";
    iterationComposite = "replace";
    progress: number | null = 0.5;
    constructor(
      public target: HTMLElement,
      public keyframes: Keyframe[],
      public timing: { delay?: number; duration?: number; fill?: string } = {},
    ) {}
    getKeyframes() {
      const last = Math.max(1, this.keyframes.length - 1);
      return this.keyframes.map((frame, index) => ({
        ...frame,
        composite: "auto",
        computedOffset: frame.offset ?? (this.keyframes.length === 1 ? 1 : index / last),
      }));
    }
    getComputedTiming() {
      const endTime = (this.timing.delay ?? 0) + (this.timing.duration ?? 0);
      return { endTime, progress: this.progress, localTime: endTime * (this.progress ?? 0) };
    }
    getTiming() {
      return this.timing;
    }
  };
  g.Animation = class {
    startTime: number | null = null;
    playState = "running";
    playbackRate = 1;
    finished: Promise<void>;
    protected resolve!: () => void;
    constructor(public effect: any) {
      this.finished = new Promise<void>((resolve) => {
        this.resolve = resolve;
      });
      all.push(this as unknown as HeldAnimation);
    }
    end() {
      const final = this.effect.keyframes.filter((frame: Keyframe) => frame["opacity"] != null).at(-1);
      if (final) {
        this.effect.target.style.opacity = String(final["opacity"]);
      }
      this.effect.progress = 1;
      this.playState = "finished";
      this.resolve();
    }
    play() {}
    cancel() {}
    finish() {}
    pause() {}
    addEventListener() {}
    removeEventListener() {}
  };
  (Element.prototype as any).getAnimations = function (this: Element) {
    return all.filter((animation) => animation.effect.target === this);
  };
  held = {
    lasting(duration: number) {
      return all.filter((animation) => animation.effect.timing.duration === duration);
    },
    endAll() {
      for (const animation of all) {
        animation.end();
      }
    },
  };
  return held;
}

let held: { lasting(duration: number): HeldAnimation[]; endAll(): void } | undefined;

afterEach(async () => {
  held?.endAll();
  held = undefined;
  await flushMicrotasks(20);
  const g = globalThis as any;
  g.Animation = saved.Animation;
  g.KeyframeEffect = saved.KeyframeEffect;
  (Element.prototype as any).getAnimations = saved.getAnimations;
});

const outcome = (answered: Promise<unknown>) =>
  Promise.race([
    answered.then(
      (result) => ({ result }),
      (error) => ({ error }),
    ),
    flushMicrotasks(20)
      .then(() => new Promise((resolve) => setTimeout(resolve, 100)))
      .then(() => "pending" as const),
  ]);

const hideTwice = async (second: ReturnType<typeof fadeout>) => {
  const h = createDOMHarness(SOURCE, LINE, { compose: true });
  await h.ready;
  await h.rerender(SOURCE, LINE);
  await flushMicrotasks(10);
  for (const op of [
    CreateElementMessage.type.request({ parent: null, element: "probe-portrait", type: "div", name: "probe_portrait", breakpoints }),
    CreateElementMessage.type.request({ parent: "probe-portrait", element: "probe-portrait-image", type: "span", name: "image", breakpoints }),
    WriteImageMessage.type.request({
      target: "probe_portrait",
      instructions: [
        {
          control: "show",
          content: { background: 'url("a.png")', imageNames: "a", src: "a.png", srcs: ["a.png"] },
        },
      ],
      instant: true,
    }),
  ]) {
    void h.ui.onReceiveRequest(op);
  }
  await flushMicrotasks(10);
  expect(h.overlay.querySelector(".probe_portrait > .image")?.children.length).toBe(1);

  const animations = holdAnimations();
  const hide = (animation: ReturnType<typeof fadeout>) => {
    const request = WriteImageMessage.type.request({
      target: "probe_portrait",
      instructions: [{ control: "hide", targetAnimations: [animation as any] }],
      instant: false,
      reportsExit: true,
    });
    const answered = h.game.connection.expect(request);
    h.ui.onReceiveNotification(BeatMessage.type.notification({ messages: [request] } as any));
    return answered;
  };
  const going = hide(fadeout("4s"));
  await flushMicrotasks(10);
  const gone = hide(second);
  await flushMicrotasks(10);
  expect(animations.lasting(4000)).toHaveLength(1);
  expect(animations.lasting(6000)).toHaveLength(1);
  expect(await outcome(going)).toBe("pending");
  expect(await outcome(gone)).toBe("pending");
  animations.lasting(4000)[0]!.end();
  return { going, gone, animations };
};

describe("a hidden picture's exit report once nothing it plays can show it (#2845)", () => {
  test("a picture hidden again with a longer fade while its first fade plays is reported when the first fade leaves it transparent", async () => {
    const { going, gone } = await hideTwice(fadeout("6s"));
    expect(await outcome(going)).toEqual({ result: "probe_portrait" });
    expect(await outcome(gone)).toEqual({ result: "probe_portrait" });
  });

  test("a later fade that starts from full opacity keeps the report until that fade ends", async () => {
    const { going, gone, animations } = await hideTwice(fadeout("6s", [{ opacity: "1" }, { opacity: "0" }]));
    expect(await outcome(going)).toEqual({ result: "probe_portrait" });
    expect(await outcome(gone)).toBe("pending");
    animations.endAll();
    expect(await outcome(gone)).toEqual({ result: "probe_portrait" });
  });
});
