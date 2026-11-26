import { BeatMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/BeatMessage";
import { PresenceElementsMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/PresenceElementsMessage";
import { UpdateElementMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/UpdateElementMessage";
import { WriteTextMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
import { afterEach, describe, expect, test } from "vitest";
import AnimationHold from "../../../../spark-dom/src/classes/AnimationHold";
import LayoutMotion, {
  getLayoutShift,
  getLayoutTiming,
  getSizeKeyframes,
  namesLayoutTransition,
  type LayoutBox,
  type LayoutPoint,
} from "../../../../spark-dom/src/classes/LayoutMotion";
import { schema_style } from "../../../../spark-engine/src/game/modules/ui/constructors/schema_style";
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";
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

const motionsOf = (el: Element) => live(el).filter((a) => isClock(a) || isResize(a));

const translated = (el: Element) => live(el).some((a) => "translate" in (keyframesOf(a)[0] ?? {}));

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

const visualOf = (el: Element): LayoutPoint => {
  let { x, y } = geometry.get(el)!();
  for (let node: Element | null = el; node; node = node.parentElement) {
    const shift = shiftOf(node);
    x += shift.x;
    y += shift.y;
  }
  return { x, y };
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

const pinned = (axis: "width" | "height", size: number) => {
  const name = axis === "width" ? "Width" : "Height";
  return { [axis]: `${size}px`, [`min${name}`]: `${size}px`, [`max${name}`]: `${size}px` };
};

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
    line #clear { text }
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
    for (const property of ["transition", "transition_property", "transition-property"]) {
      expect(schema[property]).toEqual(expect.arrayContaining(["layout", "opacity", "translate"]));
    }
    for (const property of ["will_change", "will-change"]) {
      expect(schema[property]).toContain("opacity");
      expect(schema[property]).not.toContain("layout");
    }
  });

  test("a layout transition is recognized in page CSS and in a beat's style data", () => {
    expect(namesLayoutTransition(".a { transition: layout 0.2s ease; }")).toBe(true);
    expect(namesLayoutTransition(".a { transition-property: opacity, layout; }")).toBe(true);
    expect(namesLayoutTransition('{"style":{"transition_property":"opacity, layout"}}')).toBe(true);
    expect(namesLayoutTransition('{"style":{"transition":"layout 1s linear"}}')).toBe(true);
    expect(namesLayoutTransition(".a { transition: opacity 0.2s; } .b { display: layout; }")).toBe(false);
    expect(namesLayoutTransition('{"style":{"transition":"opacity 1s"},"text":"layout"}')).toBe(false);
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
        transitionProperty: "layout, opacity, layout",
        transitionDuration: "0.1s, 0.2s, 0.8s",
        transitionDelay: "0s, 0s, 0.3s",
        transitionTimingFunction: "linear, ease, ease-in",
      }),
    ).toEqual({ duration: 800, delay: 300, easing: "ease-in" });
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

  test("an old and a new rectangle give a real size change and a translate from the old place to the new", () => {
    expect(getSizeKeyframes(box(10, 100, 200, 40), box(10, 140, 200, 120))).toEqual([
      { ...pinned("width", 200), ...pinned("height", 40) },
      { ...pinned("width", 200), ...pinned("height", 120) },
    ]);
    expect(getSizeKeyframes(box(0, 0, 100, 20), box(0, 0, 300, 60))).toEqual([
      { ...pinned("width", 100), ...pinned("height", 20) },
      { ...pinned("width", 300), ...pinned("height", 60) },
    ]);
    expect(getSizeKeyframes(box(0, 0, 100, 20), box(0, 30, 100.4, 20))).toBeUndefined();
    expect(
      getSizeKeyframes(
        { ...box(0, 0, 100, 20), insets: { paddingTop: 0, paddingBottom: 0, paddingLeft: 4 } },
        { ...box(0, 0, 100, 100), insets: { paddingTop: 40, paddingBottom: 40, paddingLeft: 4 } },
      ),
    ).toEqual([
      { ...pinned("width", 100), ...pinned("height", 20), paddingTop: "0px", paddingBottom: "0px" },
      { ...pinned("width", 100), ...pinned("height", 100), paddingTop: "40px", paddingBottom: "40px" },
    ]);
    const framed = { paddingTop: 20, paddingRight: 20, paddingBottom: 20, paddingLeft: 20, borderTopWidth: 10, borderRightWidth: 10, borderBottomWidth: 10, borderLeftWidth: 10 };
    const contentBox = { ...box(0, 0, 200, 80), insets: framed, sizing: "content-box" };
    const borderBox = { ...box(0, 0, 200, 80), insets: framed, sizing: "border-box" };
    expect(getSizeKeyframes(contentBox, borderBox)).toEqual([
      { ...pinned("width", 260), ...pinned("height", 140) },
      { ...pinned("width", 200), ...pinned("height", 80) },
    ]);
    expect(getSizeKeyframes(borderBox, contentBox)).toEqual([
      { ...pinned("width", 140), ...pinned("height", 20) },
      { ...pinned("width", 200), ...pinned("height", 80) },
    ]);
    const unbordered = { ...framed, borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0 };
    expect(
      getSizeKeyframes(contentBox, {
        ...contentBox,
        insets: unbordered,
        undrawn: ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"],
      }),
    ).toEqual([
      { ...pinned("width", 220), ...pinned("height", 100) },
      { ...pinned("width", 200), ...pinned("height", 80) },
    ]);
    const from = { x: 10, y: 100 };
    const to = { x: 10, y: 140 };
    expect(getLayoutShift(from, to, to, 0)).toEqual({ x: 0, y: -40 });
    expect(getLayoutShift(from, to, to, 0.5)).toEqual({ x: 0, y: -20 });
    expect(getLayoutShift(from, to, to, 1)).toEqual({ x: 0, y: 0 });
    expect(getLayoutShift(from, to, { x: 10, y: 120 }, 1)).toEqual({ x: 0, y: 20 });
    expect(getLayoutShift({ x: 0, y: 100 }, { x: 0, y: 160 }, { x: 0, y: 160 }, 0, { x: 0, y: -40 })).toEqual({ x: 0, y: -20 });
  });

  test("the pass resizes a grown element and moves a sibling it pushes, under the hold", async () => {
    useLayout();
    const { root, at } = mount(`<div class="box top"></div><div class="box under"></div><div class="plain"></div>`);
    const [top, under, plain] = [at(".top"), at(".under"), at(".plain")];
    let grown = false;
    const height = () => sizeNow(top, "height", grown ? 120 : 40);
    geometry.set(top, () => box(0, 0, 200, height()));
    geometry.set(under, () => box(0, height(), 200, 40));
    geometry.set(plain, () => box(0, height() + 40, 200, 40));
    const hold = new AnimationHold();
    const motion = new LayoutMotion(hold);

    const boxes = motion.measure(root);
    expect([...boxes!.keys()]).toEqual([top, under, plain]);
    grown = true;
    motion.play(boxes);

    expect(keyframesOf(sizeOf(top)!)).toEqual([{ ...pinned("width", 200), ...pinned("height", 40) }, { ...pinned("width", 200), ...pinned("height", 120) }]);
    expect(sizeOf(top)!.effect.timing).toMatchObject({ duration: 200, easing: "linear", fill: "backwards" });
    expect(clockOf(under)!.effect.timing).toMatchObject({ composite: "add", duration: 200, fill: "both" });
    expect(visualOf(under)).toEqual({ x: 0, y: 40 });
    expect(motionsOf(plain)).toEqual([]);

    await advance(100);
    expect(height()).toBe(80);
    expect(visualOf(under)).toEqual({ x: 0, y: 80 });
    hold.pause();
    await advance(500);
    expect(sizeOf(top)!.playState).toBe("paused");
    expect(height()).toBe(80);
    expect(visualOf(under)).toEqual({ x: 0, y: 80 });
    hold.resume();
    await advance(100);
    await advance(16);
    expect(height()).toBe(120);
    expect(visualOf(under)).toEqual({ x: 0, y: 120 });
    expect(motionsOf(top)).toEqual([]);
    expect(motionsOf(under)).toEqual([]);
    root.remove();
  });

  test("an element pushed by a slower resize still moves on its own timing", async () => {
    useLayout();
    const { root, at } = mount(`<div class="slow top"></div><div class="box under"></div>`);
    const [top, under] = [at(".top"), at(".under")];
    let grown = false;
    const height = () => sizeNow(top, "height", grown ? 120 : 40);
    geometry.set(top, () => box(0, 0, 200, height()));
    geometry.set(under, () => box(0, height(), 200, 40));
    const motion = new LayoutMotion(new AnimationHold());
    const boxes = motion.measure(root);
    grown = true;
    motion.play(boxes);

    expect(visualOf(under)).toEqual({ x: 0, y: 40 });
    await advance(100);
    expect(height()).toBe(48);
    expect(visualOf(under)).toEqual({ x: 0, y: 80 });
    await advance(100);
    expect(visualOf(under)).toEqual({ x: 0, y: 120 });
    await advance(300);
    expect(height()).toBe(80);
    expect(visualOf(under)).toEqual({ x: 0, y: 120 });
    await advance(500);
    await advance(16);
    expect(visualOf(under)).toEqual({ x: 0, y: 120 });
    expect(motionsOf(under)).toEqual([]);
    root.remove();
  });

  test("an element that wraps while its parent resizes moves smoothly instead of jumping", async () => {
    useLayout();
    const { root, at } = mount(`<div class="slow row"><div class="slow third"></div></div>`);
    const [row, third] = [at(".row"), at(".third")];
    let wide = false;
    const width = () => sizeNow(row, "width", wide ? 400 : 200);
    geometry.set(row, () => box(0, 0, width(), wide ? 40 : 80));
    geometry.set(third, () => (width() >= 300 ? box(200, 0, 100, 40) : box(0, 40, 100, 40)));
    offsetParents.set(third, row);
    const motion = new LayoutMotion(new AnimationHold());
    const boxes = motion.measure(root);
    wide = true;
    motion.play(boxes);

    const rounded = ({ x, y }: LayoutPoint) => ({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
    const seen: LayoutPoint[] = [];
    for (let step = 0; step < 10; step += 1) {
      seen.push(rounded(visualOf(third)));
      await advance(100);
    }
    expect(seen).toEqual(
      Array.from({ length: 10 }, (_, step) => rounded({ x: 20 * step, y: 40 - 4 * step })),
    );
    root.remove();
  });

  test("a box anchored at its bottom with fractional sizes takes no translate from rounded places", async () => {
    useLayout();
    const { root, at } = mount(`<div class="frame"><div class="slow anchored"></div></div>`);
    const [frame, anchored] = [at(".frame"), at(".anchored")];
    let grown = false;
    const height = () => sizeNow(anchored, "height", grown ? 128.78 : 85.59);
    geometry.set(frame, () => box(0, 0, 619, 794));
    rects.set(frame, () => ({ left: 0, top: 0, width: 619, height: 794 }));
    geometry.set(anchored, () => box(0, Math.round(794 - height()), 619, height()));
    rects.set(anchored, () => ({ left: shiftOf(anchored).x, top: 794 - height() + shiftOf(anchored).y, width: 619, height: height() }));
    offsetParents.set(anchored, frame);
    const motion = new LayoutMotion(new AnimationHold());
    const boxes = motion.measure(root);
    grown = true;
    motion.play(boxes);
    expect(sizeOf(anchored)).toBeDefined();
    for (let step = 0; step < 20; step += 1) {
      expect(translated(anchored)).toBe(false);
      await advance(50);
    }
    root.remove();
  });

  test("a deeply nested element measured below a pixel takes no translate from rounded offsets", async () => {
    useLayout();
    const depth = 8;
    const { root, at } = mount(
      `<div class="slow outer">${"<div class='wrap'>".repeat(depth)}<div class="slow leaf"></div>${"</div>".repeat(depth)}</div>`,
    );
    const outer = at(".outer");
    const leaf = at(".leaf");
    const wraps = Array.from(root.querySelectorAll(".wrap"));
    let wide = false;
    const width = () => sizeNow(outer, "width", wide ? 305 : 205);
    geometry.set(outer, () => box(0, 0, width(), 40));
    rects.set(outer, () => ({ left: 0, top: 0, width: width(), height: 40 }));
    let parent: Element = outer;
    wraps.forEach((wrap, index) => {
      geometry.set(wrap, () => box(Math.round(0.1 * width()), 0, width(), 40));
      rects.set(wrap, () => ({ left: (index + 1) * 0.1 * width(), top: 0, width: width(), height: 40 }));
      offsetParents.set(wrap, parent);
      parent = wrap;
    });
    geometry.set(leaf, () => box(0, 0, 100, 20));
    rects.set(leaf, () => ({ left: depth * 0.1 * width() + shiftOf(leaf).x, top: shiftOf(leaf).y, width: 100, height: 20 }));
    offsetParents.set(leaf, parent);
    const motion = new LayoutMotion(new AnimationHold());
    const boxes = motion.measure(root);
    wide = true;
    motion.play(boxes);
    expect(sizeOf(outer)).toBeDefined();
    for (let step = 0; step < 20; step += 1) {
      expect(translated(leaf)).toBe(false);
      await advance(50);
    }
    root.remove();
  });

  test("a change of padding grows the box through its padding as well as its size", () => {
    useLayout();
    const { root, at } = mount(`<div class="slow padded"></div>`);
    const padded = at(".padded");
    let grown = false;
    geometry.set(padded, () => box(0, 0, 200, grown ? 100 : 20));
    styles.set(padded, () => ({ paddingTop: grown ? "40px" : "0px", paddingBottom: grown ? "40px" : "0px" }));
    const motion = new LayoutMotion(new AnimationHold());
    const boxes = motion.measure(root);
    grown = true;
    motion.play(boxes);
    expect(keyframesOf(sizeOf(padded)!)).toEqual([
      { ...pinned("width", 200), ...pinned("height", 20), paddingTop: "0px", paddingBottom: "0px" },
      { ...pinned("width", 200), ...pinned("height", 100), paddingTop: "40px", paddingBottom: "40px" },
    ]);
    root.remove();
  });

  test("an element inside a parent scaled unequally moves in the parent's own units", () => {
    useLayout();
    const { root, at } = mount(`<div class="stretched"><div class="slow child"></div></div>`);
    const [stretched, child] = [at(".stretched"), at(".child")];
    let moved = false;
    geometry.set(stretched, () => box(0, 0, 100, 200));
    rects.set(stretched, () => ({ left: 0, top: 0, width: 200, height: 200 }));
    styles.set(stretched, () => ({ boxSizing: "border-box", width: "100px", height: "200px" }));
    geometry.set(child, () => box(0, moved ? 100 : 0, 50, 20));
    rects.set(child, () => ({ left: 2 * shiftOf(child).x, top: (moved ? 100 : 0) + shiftOf(child).y, width: 100, height: 20 }));
    offsetParents.set(child, stretched);
    const motion = new LayoutMotion(new AnimationHold());
    const boxes = motion.measure(root);
    moved = true;
    motion.play(boxes);
    expect(shiftOf(child)).toEqual({ x: 0, y: -100 });
    root.remove();
  });

  test("an element inside a rotated parent takes its new place at once", () => {
    useLayout();
    const { root, at } = mount(`<div class="turned"><div class="slow child"></div></div>`);
    const [turned, child] = [at(".turned"), at(".child")];
    let moved = false;
    geometry.set(turned, () => box(0, 0, 200, 200));
    rects.set(turned, () => ({ left: -41.4, top: -41.4, width: 282.8, height: 282.8 }));
    styles.set(turned, () => ({ transform: "matrix(0.707107, 0.707107, -0.707107, 0.707107, 0, 0)" }));
    geometry.set(child, () => box(0, moved ? 100 : 0, 50, 20));
    rects.set(child, () => ({ left: moved ? -70.7 : 0, top: moved ? 70.7 : 0, width: 50, height: 50 }));
    offsetParents.set(child, turned);
    const motion = new LayoutMotion(new AnimationHold());
    const boxes = motion.measure(root);
    moved = true;
    motion.play(boxes);
    expect(motionsOf(child)).toEqual([]);
    expect(shiftOf(child)).toEqual({ x: 0, y: 0 });
    root.remove();
  });

  test("a pure resize never translates the element, so its stacking is unchanged", async () => {
    useLayout();
    const { root, at } = mount(`<div class="slow card"></div>`);
    const card = at(".card");
    let grown = false;
    geometry.set(card, () => box(0, 0, 200, sizeNow(card, "height", grown ? 120 : 40)));
    const motion = new LayoutMotion(new AnimationHold());
    const boxes = motion.measure(root);
    grown = true;
    motion.play(boxes);
    expect(sizeOf(card)).toBeDefined();
    expect(clockOf(card)).toBeDefined();
    for (let step = 0; step < 10; step += 1) {
      expect(translated(card)).toBe(false);
      await advance(100);
    }
    root.remove();
  });

  test.each(["slow", "box"])("an element whose old and new places match is held while a resize around it would move it (%s timing)", async (timing) => {
    useLayout();
    const { root, at } = mount(`<div class="slow row"><div class="${timing} second"></div></div>`);
    const [row, second] = [at(".row"), at(".second")];
    let wider = false;
    const progress = () => sizeOf(row)?.effect.getComputedTiming().progress ?? null;
    geometry.set(row, () => box(0, 0, sizeNow(row, "width", wider ? 199 : 180), 40));
    geometry.set(second, () => {
      const p = progress();
      return p != null && p > 0.3 && p < 0.7 ? box(100, 0, 100, 20) : box(0, 20, 100, 20);
    });
    offsetParents.set(second, row);
    const motion = new LayoutMotion(new AnimationHold());
    const boxes = motion.measure(root);
    wider = true;
    motion.play(boxes);
    const seen: LayoutPoint[] = [];
    for (let step = 0; step < 10; step += 1) {
      seen.push(visualOf(second));
      await advance(100);
    }
    expect(seen).toEqual(Array.from({ length: 10 }, () => ({ x: 0, y: 20 })));
    expect(geometry.get(second)!()).toEqual(box(0, 20, 100, 20));
    root.remove();
  });

  test("a change during a motion starts from where the element is, and an unchanged target keeps its motion", async () => {
    useLayout();
    const { root, at } = mount(`<div class="box under"></div>`);
    const under = at(".under");
    let y = 40;
    geometry.set(under, () => box(0, y, 200, 40));
    const motion = new LayoutMotion(new AnimationHold());

    let boxes = motion.measure(root);
    y = 120;
    motion.play(boxes);
    const first = clockOf(under)!;
    await advance(100);
    expect(visualOf(under)).toEqual({ x: 0, y: 80 });

    boxes = motion.measure(root);
    motion.play(boxes);
    expect(clockOf(under)).toBe(first);
    expect(first.currentTime).toBe(100);

    boxes = motion.measure(root);
    expect(boxes!.get(under)).toMatchObject(box(0, 80, 200, 40));
    y = 200;
    motion.play(boxes);
    expect(first.playState).toBe("idle");
    expect(visualOf(under)).toEqual({ x: 0, y: 80 });
    await advance(100);
    expect(visualOf(under)).toEqual({ x: 0, y: 140 });
    root.remove();
  });

  test("a child of a moving element moves only by its own change", () => {
    useLayout();
    const { root, at } = mount(`<div class="box outer"><div class="box inner"></div></div>`);
    const [outer, inner] = [at(".outer"), at(".inner")];
    let moved = false;
    geometry.set(outer, () => box(0, moved ? 100 : 0, 200, 80));
    geometry.set(inner, () => box(0, moved ? 130 : 10, 200, 20));
    const motion = new LayoutMotion();
    const boxes = motion.measure(root);
    moved = true;
    motion.play(boxes);
    expect(shiftOf(outer)).toEqual({ x: 0, y: -100 });
    expect(shiftOf(inner)).toEqual({ x: 0, y: -20 });
    expect(visualOf(inner)).toEqual({ x: 0, y: 10 });
    root.remove();
  });

  test("a box anchored at its bottom grows by its real size and is not moved again", async () => {
    useLayout();
    const { root, at } = mount(`<div class="box anchored"></div>`);
    const anchored = at(".anchored");
    let grown = false;
    geometry.set(anchored, () => {
      const height = sizeNow(anchored, "height", grown ? 120 : 40);
      return box(0, 200 - height, 300, height);
    });
    const motion = new LayoutMotion(new AnimationHold());
    const boxes = motion.measure(root);
    grown = true;
    motion.play(boxes);
    expect(keyframesOf(sizeOf(anchored)!)).toEqual([{ ...pinned("width", 300), ...pinned("height", 40) }, { ...pinned("width", 300), ...pinned("height", 120) }]);
    expect(shiftOf(anchored)).toEqual({ x: 0, y: 0 });
    await advance(100);
    expect(shiftOf(anchored)).toEqual({ x: 0, y: 0 });
    expect(visualOf(anchored)).toEqual({ x: 0, y: 120 });
    root.remove();
  });

  test("a change in an ancestor's border moves the element", () => {
    useLayout();
    const { root, at } = mount(`<div class="frame"><div class="box inner"></div></div>`);
    const [frame, inner] = [at(".frame"), at(".inner")];
    let border = 0;
    geometry.set(frame, () => box(0, 0, 200, 80 + 2 * border));
    geometry.set(inner, () => box(0, 0, 200, 20));
    offsetParents.set(inner, frame);
    borders.set(frame, () => border);
    const motion = new LayoutMotion();
    const boxes = motion.measure(root);
    border = 80;
    motion.play(boxes);
    expect(shiftOf(inner)).toEqual({ x: -80, y: -80 });
    root.remove();
  });

  test("a style that names layout in the same beat that resizes the element animates it", () => {
    useLayout();
    const { root, at } = mount(`<div class="late"></div>`);
    const late = at(".late");
    let grown = false;
    geometry.set(late, () => box(0, 0, 200, grown ? 120 : 40));
    const motion = new LayoutMotion();
    const boxes = motion.measure(root);
    grown = true;
    late.classList.add("box");
    motion.play(boxes);
    expect(keyframesOf(sizeOf(late)!)).toEqual([{ ...pinned("width", 200), ...pinned("height", 40) }, { ...pinned("width", 200), ...pinned("height", 120) }]);
    root.remove();
  });

  test("a page with no layout transition measures nothing unless the incoming beat names one", () => {
    useLayout();
    const root = document.createElement("div");
    root.innerHTML = `<style>.box { transition: opacity 0.2s; }</style><div class="box"></div>`;
    document.body.append(root);
    const el = root.querySelector(".box")!;
    geometry.set(el, () => box(0, 0, 10, 10));
    expect(new LayoutMotion().measure(root)).toBeUndefined();
    expect(new LayoutMotion().measure(root, () => false)).toBeUndefined();
    expect([...new LayoutMotion().measure(root, () => true)!.keys()]).toEqual([el]);
    root.remove();
  });
});

const SOURCE = `scene start
  HERO: Hi.
end
`;

const LINE = SOURCE.split("\n").findIndex((l) => l.includes("HERO: Hi."));

describe("waiting for an element's layout motion (I-2735)", () => {
  const watch = (promise: Promise<void>) => {
    const state = { done: false };
    void promise.then(() => {
      state.done = true;
    });
    return state;
  };

  const pushed = (inner = "box") => {
    useLayout();
    const { root, at } = mount(`<div class="slow top"></div><div class="box under"><div class="${inner} inner"></div></div><div class="plain"></div><div class="slow still"></div>`);
    const [top, under, child, plain, still] = [at(".top"), at(".under"), at(".inner"), at(".plain"), at(".still")];
    let target = 40;
    const height = () => sizeNow(top, "height", target);
    geometry.set(top, () => box(0, 0, 200, height()));
    geometry.set(under, () => box(0, height(), 200, 40));
    geometry.set(child, () => box(0, height(), 200, 20));
    geometry.set(still, () => box(400, 0, 100, 30));
    const motion = new LayoutMotion(new AnimationHold());
    const grow = (to: number) => {
      const boxes = motion.measure(root);
      target = to;
      motion.play(boxes);
    };
    return { root, top, under, inner: child, plain, still, motion, start: () => grow(120), grow };
  };

  test("an element with no layout motion is finished at once", async () => {
    const { root, plain, motion, start } = pushed();
    start();
    const waiting = watch(motion.finished(plain));
    await flushMicrotasks(2);
    expect(waiting.done).toBe(true);
    root.remove();
  });

  test("an element held in place only because another element moves is finished at once", async () => {
    const { root, still, motion, start } = pushed();
    start();
    expect(motionsOf(still).length).toBeGreaterThan(0);
    expect(translated(still)).toBe(false);
    const waiting = watch(motion.finished(still));
    await flushMicrotasks(2);
    expect(waiting.done).toBe(true);
    root.remove();
  });

  test("an element is finished when its own motion ends, while a slower one goes on", async () => {
    const { root, top, under, motion, start } = pushed();
    start();
    expect(motionsOf(under).length).toBeGreaterThan(0);
    const waiting = watch(motion.finished(under));
    await advance(100);
    expect(waiting.done).toBe(false);
    await advance(150);
    expect(waiting.done).toBe(true);
    expect(sizeOf(top)?.playState).toBe("running");
    root.remove();
  });

  test("an element waits for a slower descendant only while the descendant is inside it", async () => {
    const { root, under, inner, motion, start } = pushed("slow");
    start();
    const waiting = watch(motion.finished(under));
    await advance(300);
    expect(waiting.done).toBe(false);
    root.append(inner);
    await advance(16);
    expect(waiting.done).toBe(true);
    root.remove();
  });

  test("an element whose motion a later beat restarts is finished at the restart", async () => {
    const { root, top, motion, start, grow } = pushed();
    start();
    const waiting = watch(motion.finished(top));
    await advance(100);
    expect(waiting.done).toBe(false);
    grow(200);
    await flushMicrotasks(2);
    expect(waiting.done).toBe(true);
    expect(sizeOf(top)?.playState).toBe("running");
    root.remove();
  });

  test("an element removed from the page while waited on is finished on the next frame", async () => {
    const { root, top, motion, start } = pushed();
    start();
    const waiting = watch(motion.finished(top));
    await advance(100);
    top.remove();
    await advance(16);
    expect(waiting.done).toBe(true);
    root.remove();
  });

  test("settling every motion finishes every waiter at once", async () => {
    const { root, top, under, motion, start } = pushed();
    start();
    const waits = [watch(motion.finished(top)), watch(motion.finished(under)), watch(motion.finished(root))];
    motion.settle();
    await flushMicrotasks(2);
    expect(waits.map((w) => w.done)).toEqual([true, true, true]);
    root.remove();
  });
});

const write = (text: string, time?: number) => [
  WriteTextMessage.type.request({ target: "dialogue", instructions: [], instant: true }),
  WriteTextMessage.type.request({
    target: "dialogue",
    instructions: [{ text }] as any,
    instant: time == null,
    ...(time != null ? { time } : {}),
  }),
];

const beat = (text: string, time?: number, before: unknown[] = []) =>
  BeatMessage.type.notification({
    messages: [...before, ...write(text, time)],
    ...(time != null ? { time } : {}),
  } as any);

async function showing(styled = true) {
  const h = createDOMHarness(SOURCE, LINE, { compose: true });
  await h.ready;
  await h.rerender(SOURCE, LINE);
  await flushMicrotasks(10);
  const win = h.overlay.ownerDocument.defaultView as Window & typeof globalThis;
  installLayout(win);
  const dialogue = h.overlay.querySelector(".dialogue") as HTMLElement;
  if (styled) {
    dialogue.style.transitionProperty = "layout";
    dialogue.style.transitionDuration = "0.3s";
  }
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
    expect(sizeOf(dialogue), "the box's size motion").toBeDefined();
    expect(keyframesOf(sizeOf(dialogue)!)).toEqual([{ ...pinned("width", 300), ...pinned("height", 20) }, { ...pinned("width", 300), ...pinned("height", 60) }]);
    expect(sizeOf(dialogue)!.effect.timing).toMatchObject({ duration: 300 });
  });

  test("a beat that first names layout in its own style update animates the box", async () => {
    const { h, dialogue, shown } = await showing(false);
    expect(Array.from(h.overlay.querySelectorAll("style")).some((s) => namesLayoutTransition(s.textContent ?? ""))).toBe(false);
    timeline.currentTime = 1_000;
    const styling = UpdateElementMessage.type.request({
      element: (dialogue as any).__sdId,
      style: { transition_property: "layout", transition_duration: "0.3s" },
    } as any);
    h.ui.onReceiveNotification(beat("A line long enough for three.", 1_000, [styling]));
    await flushMicrotasks(10);
    expect(shown()).toBe("A line long enough for three.");
    expect(dialogue.style.transitionProperty).toBe("layout");
    expect(sizeOf(dialogue), "the box's size motion").toBeDefined();
    expect(keyframesOf(sizeOf(dialogue)!)).toEqual([{ ...pinned("width", 300), ...pinned("height", 20) }, { ...pinned("width", 300), ...pinned("height", 60) }]);
  });

  test("a beat displayed instantly applies the new size at once and ends a motion in flight", async () => {
    const { h, dialogue, shown } = await showing();
    timeline.currentTime = 1_000;
    h.ui.onReceiveNotification(beat("A line long enough for three.", 1_000));
    await flushMicrotasks(10);
    expect(sizeOf(dialogue), "the box's size motion").toBeDefined();
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

  test("a hide that resizes the box answers only after its size motion ends", async () => {
    const { h, dialogue } = await showing();
    geometry.set(dialogue, () =>
      box(0, 0, 300, sizeNow(dialogue, "height", dialogue.getAttribute("data-presence") === "hide" ? 20 : 60)),
    );
    const app = (h.ui as any).app;
    const answer = app.answer.bind(app);
    let answered = false;
    app.answer = (message: unknown, work: Promise<unknown>) => {
      void work.then(() => {
        answered = true;
      });
      return answer(message, work);
    };
    timeline.currentTime = 1_000;
    const hiding = PresenceElementsMessage.type.request({
      effects: [{ element: (dialogue as any).__sdId, presence: "hide" }],
    } as any);
    h.ui.onReceiveNotification(BeatMessage.type.notification({ messages: [hiding], time: 1_000 } as any));
    await flushMicrotasks(10);
    expect(dialogue.getAttribute("data-presence")).toBe("hide");
    expect(sizeOf(dialogue), "the box's size motion").toBeDefined();
    expect(answered).toBe(false);
    await advance(150);
    expect(answered).toBe(false);
    await advance(200);
    await flushMicrotasks(10);
    expect(motionsOf(dialogue)).toEqual([]);
    expect(answered).toBe(true);
  });
});

describe("a hide's answer (I-2735)", () => {
  const hiding = async (styled: boolean) => {
    const { h, dialogue } = await showing(styled);
    geometry.set(dialogue, () =>
      box(0, 0, 300, sizeNow(dialogue, "height", dialogue.getAttribute("data-presence") === "hide" ? 20 : 60)),
    );
    const app = (h.ui as any).app;
    const answer = app.answer.bind(app);
    const state = { answered: false };
    app.answer = (message: unknown, work: Promise<unknown>) => {
      void work.then(() => {
        state.answered = true;
      });
      return answer(message, work);
    };
    const request = () =>
      PresenceElementsMessage.type.request({
        effects: [{ element: (dialogue as any).__sdId, presence: "hide" }],
      } as any);
    return { h, dialogue, state, request };
  };

  test("a hide on an element with no layout transition answers without waiting for any time", async () => {
    const { h, dialogue, state, request } = await hiding(false);
    timeline.currentTime = 1_000;
    h.ui.onReceiveNotification(BeatMessage.type.notification({ messages: [request()], time: 1_000 } as any));
    await flushMicrotasks(10);
    expect(motionsOf(dialogue)).toEqual([]);
    expect(state.answered).toBe(true);
  });

  test("a hide in a beat shown at once answers without waiting for any time", async () => {
    const { h, dialogue, state, request } = await hiding(true);
    h.ui.onReceiveNotification(BeatMessage.type.notification({ messages: [request()] } as any));
    await flushMicrotasks(10);
    expect(motionsOf(dialogue)).toEqual([]);
    expect(state.answered).toBe(true);
  });

  test("a hide under the reader's reduced-motion setting answers without waiting for any time", async () => {
    const { h, dialogue, state, request } = await hiding(true);
    const win = h.overlay.ownerDocument.defaultView as any;
    win.matchMedia = (query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" });
    try {
      timeline.currentTime = 1_000;
      h.ui.onReceiveNotification(BeatMessage.type.notification({ messages: [request()], time: 1_000 } as any));
      await flushMicrotasks(10);
      expect(motionsOf(dialogue)).toEqual([]);
      expect(state.answered).toBe(true);
    } finally {
      delete win.matchMedia;
    }
  });

  test("a hide outside any beat answers at once, or when a motion already on the element ends", async () => {
    const { h, dialogue, request } = await hiding(true);
    let answered = false;
    void h.ui.onReceiveRequest(request() as any).then(() => {
      answered = true;
    });
    await flushMicrotasks(10);
    expect(answered).toBe(true);

    dialogue.removeAttribute("data-presence");
    const shown = () => dialogue.querySelector(".text")?.textContent ?? "";
    geometry.set(dialogue, () => box(0, 0, 300, sizeNow(dialogue, "height", 20 * Math.max(1, Math.ceil(shown().length / 10)))));
    timeline.currentTime = 1_000;
    h.ui.onReceiveNotification(beat("A line long enough for three.", 1_000));
    await flushMicrotasks(10);
    expect(sizeOf(dialogue), "the box's size motion").toBeDefined();
    answered = false;
    void h.ui.onReceiveRequest(request() as any).then(() => {
      answered = true;
    });
    await flushMicrotasks(10);
    expect(answered).toBe(false);
    await advance(350);
    await flushMicrotasks(10);
    expect(answered).toBe(true);
  });
});
