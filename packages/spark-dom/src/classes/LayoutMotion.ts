import type AnimationHold from "./AnimationHold";

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutBox extends LayoutPoint {
  width: number;
  height: number;
}

export interface LayoutTiming {
  duration: number;
  delay: number;
  easing: string;
}

interface Motion {
  from: LayoutPoint;
  to: LayoutBox;
  depth: number;
  clock: Animation;
  resize?: Animation;
  shift: LayoutPoint;
}

type TransitionStyle = Pick<
  CSSStyleDeclaration,
  | "transitionProperty"
  | "transitionDuration"
  | "transitionDelay"
  | "transitionTimingFunction"
>;

const LAYOUT_TRANSITION = /transition(?:[-_]property)?"?\s*:\s*"?[^;{}"]*\blayout\b/;

const SETTLED_PX = 0.5;

const ROUNDED_PLACE_PX = 1.5;

const NO_SHIFT: LayoutPoint = { x: 0, y: 0 };

export const namesLayoutTransition = (text: string): boolean =>
  LAYOUT_TRANSITION.test(text);

export const splitCssList = (value: string | undefined): string[] => {
  const items: string[] = [];
  let depth = 0;
  let item = "";
  for (const ch of value ?? "") {
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      items.push(item.trim());
      item = "";
      continue;
    }
    item += ch;
  }
  if (item.trim()) {
    items.push(item.trim());
  }
  return items;
};

const toMilliseconds = (time: string): number => {
  const value = Number.parseFloat(time);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return time.trim().endsWith("ms") ? value : value * 1000;
};

export const getLayoutTiming = (
  style: TransitionStyle,
): LayoutTiming | undefined => {
  const index = splitCssList(style.transitionProperty).lastIndexOf("layout");
  if (index < 0) {
    return undefined;
  }
  const at = (list: string, fallback: string) => {
    const items = splitCssList(list);
    return items.length > 0 ? items[index % items.length]! : fallback;
  };
  const duration = toMilliseconds(at(style.transitionDuration, "0s"));
  if (!(duration > 0)) {
    return undefined;
  }
  return {
    duration,
    delay: toMilliseconds(at(style.transitionDelay, "0s")),
    easing: at(style.transitionTimingFunction, "ease"),
  };
};

const differs = (a: number, b: number) => Math.abs(a - b) > SETTLED_PX;

const sameBox = (a: LayoutBox, b: LayoutBox) =>
  !differs(a.x, b.x) &&
  !differs(a.y, b.y) &&
  !differs(a.width, b.width) &&
  !differs(a.height, b.height);

export const getSizeKeyframes = (
  from: LayoutBox,
  to: LayoutBox,
): Keyframe[] | undefined => {
  const start: Keyframe = {};
  const end: Keyframe = {};
  const pin = (frame: Keyframe, axis: "width" | "height", size: number) => {
    const name = axis === "width" ? "Width" : "Height";
    frame[axis] = `${size}px`;
    frame[`min${name}`] = `${size}px`;
    frame[`max${name}`] = `${size}px`;
  };
  if (differs(from.width, to.width)) {
    pin(start, "width", from.width);
    pin(end, "width", to.width);
  }
  if (differs(from.height, to.height)) {
    pin(start, "height", from.height);
    pin(end, "height", to.height);
  }
  return Object.keys(start).length > 0 ? [start, end] : undefined;
};

export const getLayoutShift = (
  from: LayoutPoint,
  to: LayoutPoint,
  place: LayoutPoint,
  progress: number,
  carried: LayoutPoint = NO_SHIFT,
): LayoutPoint => ({
  x: from.x + (to.x - from.x) * progress - place.x - carried.x,
  y: from.y + (to.y - from.y) * progress - place.y - carried.y,
});

const settledShift = (shift: LayoutPoint): LayoutPoint =>
  Math.abs(shift.x) > ROUNDED_PLACE_PX || Math.abs(shift.y) > ROUNDED_PLACE_PX
    ? shift
    : NO_SHIFT;

const translateFrames = (shift: LayoutPoint): Keyframe[] => {
  if (shift === NO_SHIFT) {
    return [];
  }
  const translate = `${shift.x}px ${shift.y}px`;
  return [{ translate }, { translate }];
};

const depthOf = (el: Element) => {
  let depth = 0;
  for (let node = el.parentElement; node; node = node.parentElement) {
    depth += 1;
  }
  return depth;
};

export default class LayoutMotion {
  protected _hold?: AnimationHold;

  protected _motions = new Map<HTMLElement, Motion>();

  protected _frame?: () => void;

  constructor(hold?: AnimationHold) {
    this._hold = hold;
  }

  measure(
    root: HTMLElement,
    incoming?: () => boolean,
  ): Map<HTMLElement, LayoutBox> | undefined {
    const view = root.ownerDocument.defaultView;
    if (!view || (!this.styled(root) && !incoming?.())) {
      this.settle();
      return undefined;
    }
    const boxes = new Map<HTMLElement, LayoutBox>();
    const places = new Map<HTMLElement, LayoutPoint>();
    for (const node of Array.from(root.querySelectorAll("*"))) {
      if (node instanceof view.HTMLElement) {
        const box = this.boxOf(node, places, root);
        if (box) {
          boxes.set(node, box);
        }
      }
    }
    return boxes;
  }

  play(boxes: Map<HTMLElement, LayoutBox> | undefined): void {
    if (!boxes) {
      return;
    }
    const targets = this.targetsOf(boxes);
    for (const el of Array.from(this._motions.keys())) {
      if (!targets.has(el)) {
        this.stop(el);
      }
    }
    const started: [HTMLElement, Motion][] = [];
    const begin = (el: HTMLElement, to: LayoutBox, timing: LayoutTiming) => {
      const from = boxes.get(el)!;
      const motion: Motion = {
        from,
        to,
        depth: depthOf(el),
        clock: this.animation(el, [], timing, "both", "add"),
        shift: NO_SHIFT,
      };
      const size = getSizeKeyframes(from, to);
      if (size) {
        motion.resize = this.animation(el, size, timing, "backwards");
      }
      for (const animation of this.animationsOf(motion)) {
        animation.currentTime = 0;
      }
      this._motions.set(el, motion);
      started.push([el, motion]);
    };
    for (const [el, { to, timing }] of targets) {
      const running = this._motions.get(el);
      if (running ? sameBox(running.to, to) : sameBox(boxes.get(el)!, to)) {
        continue;
      }
      this.stop(el);
      begin(el, to, timing);
    }
    if (started.length === 0) {
      return;
    }
    for (const [el, { to, timing }] of targets) {
      if (!this._motions.has(el)) {
        begin(el, to, timing);
      }
    }
    this.update();
    for (const [, motion] of started) {
      for (const animation of this.animationsOf(motion)) {
        animation.play();
        void this._hold?.add(animation).catch(() => undefined);
      }
    }
    this.schedule(started[0]![0].ownerDocument.defaultView);
  }

  settle(): void {
    this._frame?.();
    this._frame = undefined;
    for (const el of Array.from(this._motions.keys())) {
      this.stop(el);
    }
  }

  protected styled(root: HTMLElement): boolean {
    for (const sheet of Array.from(root.querySelectorAll("style"))) {
      if (namesLayoutTransition(sheet.textContent ?? "")) {
        return true;
      }
    }
    return root.querySelector('[style*="layout"]') != null;
  }

  protected targetsOf(
    boxes: Map<HTMLElement, LayoutBox>,
  ): Map<HTMLElement, { to: LayoutBox; timing: LayoutTiming }> {
    const targets = new Map<HTMLElement, { to: LayoutBox; timing: LayoutTiming }>();
    const places = new Map<HTMLElement, LayoutPoint>();
    const resume = this.suspend();
    try {
      for (const el of boxes.keys()) {
        const view = el.ownerDocument.defaultView;
        const timing =
          view && el.isConnected
            ? getLayoutTiming(view.getComputedStyle(el))
            : undefined;
        const to = timing ? this.boxOf(el, places) : undefined;
        if (timing && to) {
          targets.set(el, { to, timing });
        }
      }
    } finally {
      resume();
    }
    return targets;
  }

  protected update(): boolean {
    const places = new Map<HTMLElement, LayoutPoint>();
    const ordered = Array.from(this._motions).sort(
      ([, a], [, b]) => a.depth - b.depth,
    );
    const moving = ordered.some(([, motion]) =>
      this.animationsOf(motion).some((a) => a.playState !== "finished"),
    );
    if (!moving) {
      this.settle();
      return false;
    }
    for (const [el, motion] of ordered) {
      if (!el.isConnected) {
        this.stop(el);
        continue;
      }
      const progress = motion.clock.effect?.getComputedTiming().progress ?? 1;
      const shift = settledShift(
        getLayoutShift(
          motion.from,
          motion.to,
          this.placeOf(el, places),
          progress,
          this.carried(el),
        ),
      );
      if (shift.x !== motion.shift.x || shift.y !== motion.shift.y) {
        motion.shift = shift;
        (motion.clock.effect as KeyframeEffect | null)?.setKeyframes(
          translateFrames(shift),
        );
      }
    }
    return this._motions.size > 0;
  }

  protected schedule(view: (Window & typeof globalThis) | null): void {
    if (!view || this._frame) {
      return;
    }
    const tick = () => {
      this._frame = undefined;
      if (this.update()) {
        this.schedule(view);
      }
    };
    if (view.requestAnimationFrame) {
      const id = view.requestAnimationFrame(tick);
      this._frame = () => view.cancelAnimationFrame?.(id);
    } else {
      const id = view.setTimeout(tick, 16);
      this._frame = () => view.clearTimeout(id);
    }
  }

  protected placeOf(
    el: HTMLElement,
    places: Map<HTMLElement, LayoutPoint>,
  ): LayoutPoint {
    const known = places.get(el);
    if (known) {
      return known;
    }
    const parent = el.offsetParent as HTMLElement | null;
    const base = parent ? this.placeOf(parent, places) : NO_SHIFT;
    const place = {
      x: base.x + (parent?.clientLeft ?? 0) + el.offsetLeft,
      y: base.y + (parent?.clientTop ?? 0) + el.offsetTop,
    };
    places.set(el, place);
    return place;
  }

  protected boxOf(
    el: HTMLElement,
    places: Map<HTMLElement, LayoutPoint>,
    inFlightWithin?: HTMLElement,
  ): LayoutBox | undefined {
    const view = el.ownerDocument.defaultView;
    if (!view || el.getClientRects().length === 0) {
      return undefined;
    }
    let { x, y } = this.placeOf(el, places);
    if (inFlightWithin) {
      for (
        let node: HTMLElement | null = el;
        node && node !== inFlightWithin;
        node = node.parentElement
      ) {
        const shift = this._motions.get(node)?.shift;
        if (shift) {
          x += shift.x;
          y += shift.y;
        }
      }
    }
    const style = view.getComputedStyle(el);
    return {
      x,
      y,
      width: Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
    };
  }

  protected carried(el: HTMLElement): LayoutPoint {
    const carried = { x: 0, y: 0 };
    for (let node = el.parentElement; node; node = node.parentElement) {
      const shift = this._motions.get(node)?.shift;
      if (shift) {
        carried.x += shift.x;
        carried.y += shift.y;
      }
    }
    return carried;
  }

  protected animationsOf(motion: Motion): Animation[] {
    return motion.resize ? [motion.clock, motion.resize] : [motion.clock];
  }

  protected suspend(): () => void {
    const held: [Animation, CSSNumberish | null][] = [];
    for (const motion of this._motions.values()) {
      for (const animation of this.animationsOf(motion)) {
        held.push([animation, animation.currentTime]);
        const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
        animation.currentTime = end;
      }
    }
    return () => {
      for (const [animation, time] of held) {
        animation.currentTime = time;
      }
    };
  }

  protected animation(
    el: HTMLElement,
    keyframes: Keyframe[],
    timing: LayoutTiming,
    fill: FillMode,
    composite?: CompositeOperation,
  ): Animation {
    return new Animation(
      new KeyframeEffect(el, keyframes, {
        duration: timing.duration,
        delay: timing.delay,
        easing: timing.easing,
        fill,
        ...(composite ? { composite } : {}),
      }),
    );
  }

  protected stop(el: HTMLElement): void {
    const motion = this._motions.get(el);
    if (motion) {
      this._motions.delete(el);
      for (const animation of this.animationsOf(motion)) {
        animation.cancel();
      }
    }
  }
}
