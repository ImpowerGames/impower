import { BeatMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/BeatMessage";
import { WriteTextMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
import { afterEach, describe, expect, test } from "vitest";
import AnimationHold from "../../../../spark-dom/src/classes/AnimationHold";
import LayoutMotion, {
  getLayoutTiming,
  getMoveKeyframes,
  getSizeKeyframes,
  type LayoutBox,
} from "../../../../spark-dom/src/classes/LayoutMotion";
import { schema_style } from "../../../../spark-engine/src/game/modules/ui/constructors/schema_style";
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const geometry = new Map<Element, () => LayoutBox>();

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
    offsetLeft: own("offsetLeft"),
    offsetTop: own("offsetTop"),
    offsetParent: own("offsetParent"),
    getClientRects: (win.Element.prototype as any).getClientRects,
  };
  animations.length = 0;
  timeline.currentTime = 0;
  g.Animation = TimedAnimation;
  g.KeyframeEffect = TimedEffect;
  Object.defineProperty(win.document, "timeline", { configurable: true, value: timeline });
  const boxOf = (el: Element) => geometry.get(el)?.();
  Object.defineProperty(proto, "offsetLeft", { configurable: true, get() { return boxOf(this)?.x ?? 0; } });
  Object.defineProperty(proto, "offsetTop", { configurable: true, get() { return boxOf(this)?.y ?? 0; } });
  Object.defineProperty(proto, "offsetParent", { configurable: true, get() { return null; } });
  (win.Element.prototype as any).getClientRects = function (this: Element) {
    return boxOf(this) ? [{}] : [];
  };
  const computed = previous.getComputedStyle;
  win.getComputedStyle = ((el: Element) => {
    const style = computed.call(win, el);
    return new Proxy(style, {
      get(target, key) {
        const box = boxOf(el);
        if (box && (key === "width" || key === "height")) {
          return `${box[key]}px`;
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
    for (const name of ["offsetLeft", "offsetTop", "offsetParent"] as const) {
      const descriptor = previous[name];
      if (descriptor) {
        Object.defineProperty(proto, name, descriptor);
      } else {
        delete proto[name];
      }
    }
    (win.Element.prototype as any).getClientRects = previous.getClientRects;
    geometry.clear();
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
  await flushMicrotasks(10);
};

const motionsOf = (el: Element) =>
  animations.filter((a) => a.effect.target === el && (a.playState === "running" || a.playState === "paused"));

const keyframesOf = (animation: TimedAnimation) => animation.effect.getKeyframes();

const moveOf = (el: Element) =>
  motionsOf(el).find((a) => "translate" in (keyframesOf(a)[0] ?? {}));

const sizeOf = (el: Element) =>
  motionsOf(el).find((a) => !("translate" in (keyframesOf(a)[0] ?? {})));

const STYLE = `.box {
  transition-property: opacity, layout;
  transition-duration: 0.1s, 0.2s;
  transition-timing-function: ease, linear;
}`;

const column = () => {
  const root = document.createElement("div");
  root.innerHTML = `<style>${STYLE}</style><div class="column"><div class="box top"></div><div class="box under"></div><div class="plain"></div></div>`;
  document.body.append(root);
  const [top, under] = Array.from(root.querySelectorAll(".box")) as HTMLElement[];
  const plain = root.querySelector(".plain") as HTMLElement;
  return { root, top: top!, under: under!, plain };
};

const box = (x: number, y: number, width: number, height: number): LayoutBox => ({
  x,
  y,
  width,
  height,
});

const pinned = (axis: "width" | "height", size: number) => {
  const name = axis === "width" ? "Width" : "Height";
  return { [axis]: `${size}px`, [`min${name}`]: `${size}px`, [`max${name}`]: `${size}px` };
};

const heightNow = (el: Element, settled: number) => {
  const resizing = sizeOf(el);
  const progress = resizing?.effect.getComputedTiming().progress;
  if (!resizing || progress == null) {
    return settled;
  }
  const [from, to] = keyframesOf(resizing).map((frame) => Number.parseFloat(String((frame as any).height)));
  return from! + (to! - from!) * progress;
};

describe("layout in a transition list (I-2735)", () => {
  test("style lowering keeps layout in transition and transition-property, and leaves the other names in the list alone", () => {
    const theme = new Set<string>();
    expect(getCssEquivalent("transition", "layout 0.2s cubic-bezier(0.3, 1.6, 0.55, 1)", theme)).toEqual([
      ["transition", "layout 0.2s cubic-bezier(0.3, 1.6, 0.55, 1)"],
    ]);
    expect(getCssEquivalent("transition", "opacity 0.1s, layout 0.4s ease", theme)).toEqual([
      ["transition", "opacity 0.1s, layout 0.4s ease"],
    ]);
    expect(getCssEquivalent("transition_property", "opacity, layout", theme)).toEqual([
      ["transition-property", "opacity, layout"],
    ]);
    expect(getCssEquivalent("transition-duration", "0.4s", theme)).toEqual([
      ["transition-duration", "0.4s"],
    ]);
  });

  test("a compiled style carries layout to the page in both spellings", async () => {
    const h = createDOMHarness(`style frame {
  transition = layout 0.2s cubic-bezier(0.3, 1.6, 0.55, 1)
}

style line {
  transition-property = opacity, layout
  transition-duration = 0.4s
}

layout main {
  frame {
    line { text }
  }
}

scene start
  Hello.
end
`);
    await h.ready;
    const css = Array.from(h.overlay.querySelectorAll("style"))
      .map((s) => s.textContent ?? "")
      .join("\n");
    expect(css).toMatch(/\.frame[^{]*\{[^}]*transition: layout 0\.2s cubic-bezier\(0\.3, 1\.6, 0\.55, 1\);/);
    expect(css).toMatch(/\.line[^{]*\{[^}]*transition-property: opacity, layout;[^}]*transition-duration: 0\.4s;/);
  });

  test("the style schema offers layout among transition properties and nowhere else", () => {
    const schema = schema_style() as Record<string, unknown>;
    for (const property of ["transition_property", "transition-property"]) {
      expect(schema[property]).toEqual(expect.arrayContaining(["layout", "opacity", "translate"]));
    }
    for (const property of ["will_change", "will-change"]) {
      expect(schema[property]).toContain("opacity");
      expect(schema[property]).not.toContain("layout");
    }
  });

  test("the layout entry of a transition list gives its own duration, delay and easing", () => {
    expect(
      getLayoutTiming({
        transitionProperty: "opacity, layout",
        transitionDuration: "0.1s, 0.2s",
        transitionDelay: "0s",
        transitionTimingFunction: "ease, cubic-bezier(0.3, 1.6, 0.55, 1)",
      }),
    ).toEqual({ duration: 200, delay: 0, easing: "cubic-bezier(0.3, 1.6, 0.55, 1)" });
    expect(
      getLayoutTiming({
        transitionProperty: "layout, opacity, color",
        transitionDuration: "250ms",
        transitionDelay: "0s, 50ms",
        transitionTimingFunction: "linear",
      }),
    ).toEqual({ duration: 250, delay: 0, easing: "linear" });
    expect(
      getLayoutTiming({
        transitionProperty: "all",
        transitionDuration: "0.2s",
        transitionDelay: "0s",
        transitionTimingFunction: "ease",
      }),
    ).toBeUndefined();
    expect(
      getLayoutTiming({
        transitionProperty: "layout",
        transitionDuration: "0s",
        transitionDelay: "0s",
        transitionTimingFunction: "ease",
      }),
    ).toBeUndefined();
  });

  test("an old and a new rectangle give a real size change and a move drawn with translate", () => {
    expect(getSizeKeyframes(box(10, 100, 200, 40), box(10, 140, 200, 120))).toEqual([
      pinned("height", 40),
      pinned("height", 120),
    ]);
    expect(getSizeKeyframes(box(0, 0, 100, 20), box(0, 0, 300, 60))).toEqual([
      { ...pinned("width", 100), ...pinned("height", 20) },
      { ...pinned("width", 300), ...pinned("height", 60) },
    ]);
    expect(getSizeKeyframes(box(0, 0, 100, 20), box(0, 30, 100.4, 20))).toBeUndefined();
    expect(getMoveKeyframes({ x: 10, y: 100 }, { x: 10, y: 140 })).toEqual({
      shift: { x: 0, y: -40 },
      keyframes: [{ translate: "0px -40px" }, { translate: "0px 0px" }],
    });
    expect(getMoveKeyframes({ x: 0, y: 100 }, { x: 0, y: 160 }, { x: 0, y: -40 })).toEqual({
      shift: { x: 0, y: -20 },
      keyframes: [{ translate: "0px -20px" }, { translate: "0px 0px" }],
    });
    expect(getMoveKeyframes({ x: 0, y: 100 }, { x: 0.3, y: 100.2 })).toEqual({ shift: { x: 0, y: 0 } });
  });

  test("the pass animates each changed element from its old rectangle to its new one under the hold", async () => {
    installLayout(document.defaultView as Window & typeof globalThis);
    const { root, top, under, plain } = column();
    let grown = false;
    geometry.set(top, () => box(0, 0, 200, grown ? 120 : 40));
    geometry.set(under, () => box(0, grown ? 120 : 40, 200, 40));
    geometry.set(plain, () => box(0, grown ? 160 : 80, 200, 40));
    const hold = new AnimationHold();
    const motion = new LayoutMotion(hold);

    const boxes = motion.measure(root);
    expect([...boxes!.keys()]).toEqual([top, under]);
    grown = true;
    motion.play(boxes);

    expect(moveOf(top)).toBeUndefined();
    expect(keyframesOf(sizeOf(top)!)).toEqual([pinned("height", 40), pinned("height", 120)]);
    expect(sizeOf(top)!.effect.timing).toMatchObject({ duration: 200, easing: "linear", fill: "backwards" });
    expect(sizeOf(under)).toBeUndefined();
    expect(keyframesOf(moveOf(under)!)).toEqual([{ translate: "0px -80px" }, { translate: "0px 0px" }]);
    expect(moveOf(under)!.effect.timing).toMatchObject({ composite: "add", duration: 200 });
    expect(motionsOf(plain)).toEqual([]);

    await advance(100);
    expect(moveOf(under)!.effect.getComputedTiming().progress).toBe(0.5);
    hold.pause();
    await advance(500);
    expect(moveOf(under)!.playState).toBe("paused");
    expect(moveOf(under)!.effect.getComputedTiming().progress).toBe(0.5);
    hold.resume();
    await advance(100);
    expect(moveOf(under)).toBeUndefined();
    expect(sizeOf(top)).toBeUndefined();
    root.remove();
  });

  test("a change during a motion starts from where the element is, and an unchanged target keeps its motion", async () => {
    installLayout(document.defaultView as Window & typeof globalThis);
    const { root, under } = column();
    let y = 40;
    geometry.set(under, () => box(0, y, 200, 40));
    const motion = new LayoutMotion(new AnimationHold());

    let boxes = motion.measure(root);
    y = 120;
    motion.play(boxes);
    const first = moveOf(under)!;
    await advance(100);

    boxes = motion.measure(root);
    motion.play(boxes);
    expect(moveOf(under)).toBe(first);
    expect(first.currentTime).toBe(100);

    boxes = motion.measure(root);
    expect(boxes!.get(under)).toEqual(box(0, 80, 200, 40));
    y = 200;
    motion.play(boxes);
    expect(first.playState).toBe("idle");
    expect(keyframesOf(moveOf(under)!)).toEqual([{ translate: "0px -120px" }, { translate: "0px 0px" }]);
    root.remove();
  });

  test("a child of a moving element moves only by its own change", () => {
    installLayout(document.defaultView as Window & typeof globalThis);
    const root = document.createElement("div");
    root.innerHTML = `<style>${STYLE}</style><div class="box outer"><div class="box inner"></div></div>`;
    document.body.append(root);
    const outer = root.querySelector(".outer") as HTMLElement;
    const inner = root.querySelector(".inner") as HTMLElement;
    let moved = false;
    geometry.set(outer, () => box(0, moved ? 100 : 0, 200, 80));
    geometry.set(inner, () => box(0, moved ? 130 : 10, 200, 20));
    const motion = new LayoutMotion();
    const boxes = motion.measure(root);
    moved = true;
    motion.play(boxes);
    expect(keyframesOf(moveOf(outer)!)).toEqual([{ translate: "0px -100px" }, { translate: "0px 0px" }]);
    expect(keyframesOf(moveOf(inner)!)).toEqual([{ translate: "0px -20px" }, { translate: "0px 0px" }]);
    root.remove();
  });

  test("a box anchored at its bottom grows by its real size and is not moved again", () => {
    installLayout(document.defaultView as Window & typeof globalThis);
    const root = document.createElement("div");
    root.innerHTML = `<style>${STYLE}</style><div class="box anchored"></div>`;
    document.body.append(root);
    const anchored = root.querySelector(".anchored") as HTMLElement;
    let grown = false;
    geometry.set(anchored, () => {
      const height = heightNow(anchored, grown ? 120 : 40);
      return box(0, 200 - height, 300, height);
    });
    const motion = new LayoutMotion();
    const boxes = motion.measure(root);
    grown = true;
    motion.play(boxes);
    expect(keyframesOf(sizeOf(anchored)!)).toEqual([pinned("height", 40), pinned("height", 120)]);
    expect(moveOf(anchored)).toBeUndefined();
    root.remove();
  });

  test("a page with no layout transition measures nothing", () => {
    installLayout(document.defaultView as Window & typeof globalThis);
    const root = document.createElement("div");
    root.innerHTML = `<style>.box { transition: opacity 0.2s; }</style><div class="box"></div>`;
    document.body.append(root);
    geometry.set(root.querySelector(".box")!, () => box(0, 0, 10, 10));
    expect(new LayoutMotion().measure(root)).toBeUndefined();
    root.remove();
  });
});

const SOURCE = `scene start
  HERO: Hi.
end
`;

const LINE = SOURCE.split("\n").findIndex((l) => l.includes("HERO: Hi."));

const write = (text: string, time?: number) => [
  WriteTextMessage.type.request({ target: "dialogue", instructions: [], instant: true }),
  WriteTextMessage.type.request({
    target: "dialogue",
    instructions: [{ text }] as any,
    instant: time == null,
    ...(time != null ? { time } : {}),
  }),
];

const beat = (text: string, time?: number) =>
  BeatMessage.type.notification({
    messages: write(text, time),
    ...(time != null ? { time } : {}),
  } as any);

async function showing() {
  const h = createDOMHarness(SOURCE, LINE, { compose: true });
  await h.ready;
  await h.rerender(SOURCE, LINE);
  await flushMicrotasks(10);
  const win = h.overlay.ownerDocument.defaultView as Window & typeof globalThis;
  installLayout(win);
  const dialogue = h.overlay.querySelector(".dialogue") as HTMLElement;
  dialogue.style.transitionProperty = "layout";
  dialogue.style.transitionDuration = "0.3s";
  const shown = () => dialogue.querySelector(".text")?.textContent ?? "";
  geometry.set(dialogue, () => box(0, 0, 300, 20 * Math.max(1, Math.ceil(shown().length / 10))));
  return { h, dialogue, shown };
}

describe("a box whose text grows (I-2735)", () => {
  test("a played beat animates the box to its new height", async () => {
    const { h, dialogue, shown } = await showing();
    timeline.currentTime = 1_000;
    h.ui.onReceiveNotification(beat("A line long enough for three.", 1_000));
    await flushMicrotasks(10);
    expect(shown()).toBe("A line long enough for three.");
    expect(keyframesOf(sizeOf(dialogue)!)).toEqual([pinned("height", 20), pinned("height", 60)]);
    expect(sizeOf(dialogue)!.effect.timing).toMatchObject({ duration: 300 });
  });

  test("a beat displayed instantly applies the new size at once and ends a motion in flight", async () => {
    const { h, dialogue, shown } = await showing();
    timeline.currentTime = 1_000;
    h.ui.onReceiveNotification(beat("A line long enough for three.", 1_000));
    await flushMicrotasks(10);
    const running = sizeOf(dialogue)!;
    await advance(100);
    expect(running.playState).toBe("running");

    h.ui.onReceiveNotification(beat("Short."));
    await flushMicrotasks(10);
    expect(shown()).toBe("Short.");
    expect(running.playState).toBe("idle");
    expect(motionsOf(dialogue)).toEqual([]);

    h.ui.onReceiveNotification(beat("A line long enough for three."));
    await flushMicrotasks(10);
    expect(motionsOf(dialogue)).toEqual([]);
  });

  test("the reader's reduced-motion setting applies the new size at once", async () => {
    const { h, dialogue, shown } = await showing();
    const win = h.overlay.ownerDocument.defaultView as any;
    win.matchMedia = (query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" });
    try {
      timeline.currentTime = 1_000;
      h.ui.onReceiveNotification(beat("A line long enough for three.", 1_000));
      await flushMicrotasks(10);
      expect(shown()).toBe("A line long enough for three.");
      expect(motionsOf(dialogue)).toEqual([]);
    } finally {
      delete win.matchMedia;
    }
  });
});
