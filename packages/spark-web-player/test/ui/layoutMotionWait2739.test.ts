import { afterEach, describe, expect, test } from "vitest";
import AnimationHold from "../../../spark-dom/src/classes/AnimationHold";
import LayoutMotion, {
  type LayoutBox,
  type LayoutPoint,
} from "../../../spark-dom/src/classes/LayoutMotion";
import { flushMicrotasks } from "./domTestHarness";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const geometry = new Map<Element, () => LayoutBox>();

const offsetParents = new Map<Element, Element>();

const borders = new Map<Element, () => number>();

const rects = new Map<Element, () => { left: number; top: number; width: number; height: number }>();

const styles = new Map<Element, () => Record<string, string>>();

const frames: FrameRequestCallback[] = [];

let restore: (() => void) | undefined;

const installLayout = (win: Window & typeof globalThis) => {
  const g = globalThis as any;
  const proto = win.HTMLElement.prototype as any;
  const own = (name: string) => Object.getOwnPropertyDescriptor(proto, name);
  const previous = {
    Animation: g.Animation,
    KeyframeEffect: g.KeyframeEffect,
    timeline: Object.getOwnPropertyDescriptor(win.document, "timeline"),
    getComputedStyle: win.getComputedStyle,
    requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: win.cancelAnimationFrame,
    offsetLeft: own("offsetLeft"),
    offsetTop: own("offsetTop"),
    offsetParent: own("offsetParent"),
    clientLeft: own("clientLeft"),
    clientTop: own("clientTop"),
    offsetWidth: own("offsetWidth"),
    offsetHeight: own("offsetHeight"),
    getClientRects: (win.Element.prototype as any).getClientRects,
    getBoundingClientRect: (win.Element.prototype as any).getBoundingClientRect,
  };
  animations.length = 0;
  frames.length = 0;
  timeline.currentTime = 0;
  g.Animation = TimedAnimation;
  g.KeyframeEffect = TimedEffect;
  win.requestAnimationFrame = (callback: FrameRequestCallback) => frames.push(callback);
  win.cancelAnimationFrame = () => undefined;
  Object.defineProperty(win.document, "timeline", { configurable: true, value: timeline });
  const boxOf = (el: Element) => geometry.get(el)?.();
  Object.defineProperty(proto, "offsetLeft", { configurable: true, get() { return boxOf(this)?.x ?? 0; } });
  Object.defineProperty(proto, "offsetTop", { configurable: true, get() { return boxOf(this)?.y ?? 0; } });
  Object.defineProperty(proto, "offsetParent", { configurable: true, get() { return offsetParents.get(this) ?? null; } });
  Object.defineProperty(proto, "clientLeft", { configurable: true, get() { return borders.get(this)?.() ?? 0; } });
  Object.defineProperty(proto, "clientTop", { configurable: true, get() { return borders.get(this)?.() ?? 0; } });
  Object.defineProperty(proto, "offsetWidth", { configurable: true, get() { return Math.round(boxOf(this)?.width ?? 0); } });
  Object.defineProperty(proto, "offsetHeight", { configurable: true, get() { return Math.round(boxOf(this)?.height ?? 0); } });
  (win.Element.prototype as any).getBoundingClientRect = function (this: Element) {
    const rect = rects.get(this)?.() ?? { left: 0, top: 0, width: 0, height: 0 };
    return { ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height };
  };
  (win.Element.prototype as any).getClientRects = function (this: Element) {
    return boxOf(this) ? [{}] : [];
  };
  const computed = previous.getComputedStyle;
  win.getComputedStyle = ((el: Element) => {
    const style = computed.call(win, el);
    return new Proxy(style, {
      get(target, key) {
        const own = styles.get(el)?.();
        if (own && typeof key === "string" && key in own) {
          return own[key];
        }
        const box = boxOf(el);
        if (box && (key === "width" || key === "height")) {
          return `${box[key]}px`;
        }
        if (rects.has(el) && (key === "transform" || key === "rotate" || key === "scale")) {
          return "none";
        }
        if (rects.has(el) && key === "translate") {
          const shift = shiftOf(el);
          return shift.x === 0 && shift.y === 0 ? "none" : `${shift.x}px ${shift.y}px`;
        }
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }) as typeof win.getComputedStyle;
  restore = () => {
    g.Animation = previous.Animation;
    g.KeyframeEffect = previous.KeyframeEffect;
    if (previous.timeline) {
      Object.defineProperty(win.document, "timeline", previous.timeline);
    } else {
      delete (win.document as any).timeline;
    }
    win.getComputedStyle = previous.getComputedStyle;
    win.requestAnimationFrame = previous.requestAnimationFrame;
    win.cancelAnimationFrame = previous.cancelAnimationFrame;
    for (const name of ["offsetLeft", "offsetTop", "offsetParent", "clientLeft", "clientTop", "offsetWidth", "offsetHeight"] as const) {
      const descriptor = previous[name];
      if (descriptor) {
        Object.defineProperty(proto, name, descriptor);
      } else {
        delete proto[name];
      }
    }
    (win.Element.prototype as any).getClientRects = previous.getClientRects;
    (win.Element.prototype as any).getBoundingClientRect = previous.getBoundingClientRect;
    geometry.clear();
    rects.clear();
    styles.clear();
    offsetParents.clear();
    borders.clear();
  };
};

afterEach(() => {
  restore?.();
  restore = undefined;
});

const advance = async (ms: number) => {
  timeline.currentTime += ms;
  for (const animation of animations) {
    animation.update();
  }
  for (const frame of frames.splice(0)) {
    frame(timeline.currentTime);
  }
  await flushMicrotasks(10);
};

const live = (el: Element) => animations.filter((a) => a.effect.target === el && a.playState !== "idle");

const keyframesOf = (animation: TimedAnimation) => animation.effect.getKeyframes();

const isClock = (a: TimedAnimation) => (a.effect.timing as { composite?: string }).composite === "add";

const isResize = (a: TimedAnimation) => ["width", "height"].some((key) => key in (keyframesOf(a)[0] ?? {}));

const clockOf = (el: Element) => live(el).find(isClock);

const sizeOf = (el: Element) => live(el).find((a) => a.playState !== "finished" && isResize(a));

const shiftOf = (el: Element): LayoutPoint => {
  const clock = clockOf(el);
  if (!clock || !("translate" in (keyframesOf(clock)[0] ?? {}))) {
    return { x: 0, y: 0 };
  }
  const [x, y] = String((keyframesOf(clock)[0] as any).translate)
    .split(" ")
    .map((part) => Number.parseFloat(part));
  return { x: x!, y: y! };
};

const STYLE = `.box {
  transition-property: opacity, layout;
  transition-duration: 0.1s, 0.2s;
  transition-timing-function: ease, linear;
}
.slow {
  transition-property: layout;
  transition-duration: 1s;
  transition-timing-function: linear;
}`;

const mount = (html: string) => {
  const root = document.createElement("div");
  root.innerHTML = `<style>${STYLE}</style>${html}`;
  document.body.append(root);
  const at = (selector: string) => root.querySelector(selector) as HTMLElement;
  return { root, at };
};

const box = (x: number, y: number, width: number, height: number): LayoutBox => ({
  x,
  y,
  width,
  height,
});

const sizeNow = (el: Element, axis: "width" | "height", settled: number) => {
  const resizing = sizeOf(el);
  const progress = resizing?.effect.getComputedTiming().progress;
  const frames = resizing ? keyframesOf(resizing) : [];
  if (!resizing || progress == null || !(axis in (frames[0] ?? {}))) {
    return settled;
  }
  const [from, to] = frames.map((frame) => Number.parseFloat(String((frame as any)[axis])));
  return from! + (to! - from!) * progress;
};

const useLayout = () => installLayout(document.defaultView as Window & typeof globalThis);

const settledFlag = (promise: Promise<unknown>) => {
  const state = { done: false };
  void promise.then(() => {
    state.done = true;
  });
  return state;
};

describe("the layout-motion answer a line waits for (#2739)", () => {
  test("waits while the game is paused and answers once the held moves end", async () => {
    useLayout();
    const { root, at } = mount(`<div class="slow top"></div><div class="box under"></div>`);
    const [top, under] = [at(".top"), at(".under")];
    let grown = false;
    const height = () => sizeNow(top, "height", grown ? 120 : 40);
    geometry.set(top, () => box(0, 0, 200, height()));
    geometry.set(under, () => box(0, height(), 200, 40));
    const hold = new AnimationHold();
    const motion = new LayoutMotion(hold);

    const boxes = motion.measure(root);
    grown = true;
    motion.play(boxes);
    expect(motion.moving(root)).toContain(top);
    const answer = settledFlag(motion.finished(root));

    await advance(300);
    hold.pause();
    await advance(5_000);
    expect(answer.done).toBe(false);
    expect(motion.moving(root)).toContain(top);

    hold.resume();
    await advance(800);
    await advance(16);
    expect(answer.done).toBe(true);
    expect(motion.moving(root)).toEqual([]);
    root.remove();
  });

  test("a second beat's moves arriving before the first's end leave the second answer waiting for its own moves", async () => {
    useLayout();
    const { root, at } = mount(`<div class="slow top"></div><div class="box under"></div>`);
    const [top, under] = [at(".top"), at(".under")];
    let target = 40;
    const height = () => sizeNow(top, "height", target);
    geometry.set(top, () => box(0, 0, 200, height()));
    geometry.set(under, () => box(0, height(), 200, 40));
    const motion = new LayoutMotion(new AnimationHold());

    const first = motion.measure(root);
    target = 120;
    motion.play(first);
    const firstAnswer = settledFlag(motion.finished(root));

    await advance(300);
    const second = motion.measure(root);
    target = 200;
    motion.play(second);
    const secondAnswer = settledFlag(motion.finished(root));
    await flushMicrotasks(10);
    expect(motion.moving(root)).toContain(top);
    expect(secondAnswer.done).toBe(false);

    await advance(500);
    expect(secondAnswer.done).toBe(false);
    await advance(700);
    await advance(16);
    expect(firstAnswer.done).toBe(true);
    expect(secondAnswer.done).toBe(true);
    expect(motion.moving(root)).toEqual([]);
    root.remove();
  });

  test("answers at once when settled, whatever is still moving", async () => {
    useLayout();
    const { root, at } = mount(`<div class="slow top"></div>`);
    const top = at(".top");
    let grown = false;
    geometry.set(top, () => box(0, 0, 200, sizeNow(top, "height", grown ? 120 : 40)));
    const motion = new LayoutMotion(new AnimationHold());
    const boxes = motion.measure(root);
    grown = true;
    motion.play(boxes);
    const answer = settledFlag(motion.finished(root));
    await advance(100);
    expect(answer.done).toBe(false);
    motion.settle();
    await flushMicrotasks(10);
    expect(answer.done).toBe(true);
    expect(motion.moving(root)).toEqual([]);
    root.remove();
  });
});
