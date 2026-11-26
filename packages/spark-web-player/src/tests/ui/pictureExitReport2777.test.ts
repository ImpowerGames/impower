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

const fadeout = {
  $type: "animation",
  $name: "fadeout",
  keyframes: [{ opacity: 1 }, { opacity: 0 }],
  timing: { duration: "0.5s", delay: "0s", easing: "linear", fill: "forwards" },
};

const saved = { Animation: (globalThis as any).Animation, KeyframeEffect: (globalThis as any).KeyframeEffect };

function holdAnimations() {
  const g = globalThis as any;
  const finishes: (() => void)[] = [];
  g.KeyframeEffect = class {
    constructor(
      public target: HTMLElement,
      public keyframes: unknown,
      public timing: { delay?: number; duration?: number } = {},
    ) {}
    getComputedTiming() {
      return { endTime: (this.timing.delay ?? 0) + (this.timing.duration ?? 0) };
    }
    getTiming() {
      return this.timing;
    }
  };
  g.Animation = class {
    startTime: number | null = null;
    finished: Promise<void>;
    constructor(public effect: any) {
      this.finished = new Promise<void>((resolve) => finishes.push(resolve));
    }
    play() {}
    cancel() {}
    finish() {}
    pause() {}
    addEventListener() {}
    removeEventListener() {}
  };
  return {
    finishAll() {
      for (const finish of finishes.splice(0)) {
        finish();
      }
    },
  };
}

afterEach(() => {
  const g = globalThis as any;
  g.Animation = saved.Animation;
  g.KeyframeEffect = saved.KeyframeEffect;
});

const outcome = (answered: Promise<unknown>) =>
  Promise.race([
    answered.then(
      (result) => ({ result }),
      (error) => ({ error }),
    ),
    flushMicrotasks(20).then(() => "pending" as const),
  ]);

describe("a picture's exit report on the page (#2777)", () => {
  test("a picture write a beat carries that asks for its exit report is answered once its exit has played", async () => {
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
    const hide = WriteImageMessage.type.request({
      target: "probe_portrait",
      instructions: [{ control: "hide", targetAnimations: [fadeout as any] }],
      instant: false,
      reportsExit: true,
    });
    const answered = h.game.connection.expect(hide);
    h.ui.onReceiveNotification(BeatMessage.type.notification({ messages: [hide] } as any));

    expect(await outcome(answered)).toBe("pending");
    animations.finishAll();
    expect(await outcome(answered)).toEqual({ result: "probe_portrait" });
  });
});
