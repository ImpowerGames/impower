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

export interface LayoutMove {
  shift: LayoutPoint;
  keyframes?: Keyframe[];
}

interface Motion {
  to: LayoutBox;
  shift: LayoutPoint;
  animations: Animation[];
  move?: Animation;
}

type TransitionStyle = Pick<
  CSSStyleDeclaration,
  | "transitionProperty"
  | "transitionDuration"
  | "transitionDelay"
  | "transitionTimingFunction"
>;

const LAYOUT_STYLE = /transition(?:-property)?\s*:[^;{}]*\blayout\b/;

const SETTLED_PX = 0.5;

const NO_SHIFT: LayoutPoint = { x: 0, y: 0 };

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

export const getMoveKeyframes = (
  from: LayoutPoint,
  startsAt: LayoutPoint,
  carried: LayoutPoint = NO_SHIFT,
): LayoutMove => {
  const shift = {
    x: from.x - startsAt.x - carried.x,
    y: from.y - startsAt.y - carried.y,
  };
  if (!differs(shift.x, 0) && !differs(shift.y, 0)) {
    return { shift: NO_SHIFT };
  }
  return {
    shift,
    keyframes: [
      { translate: `${shift.x}px ${shift.y}px` },
      { translate: "0px 0px" },
    ],
  };
};

export default class LayoutMotion {
  protected _hold?: AnimationHold;

  protected _motions = new Map<HTMLElement, Motion>();

  constructor(hold?: AnimationHold) {
    this._hold = hold;
  }

  measure(root: HTMLElement): Map<HTMLElement, LayoutBox> | undefined {
    const view = root.ownerDocument.defaultView;
    if (!view || !this.styled(root)) {
      this.settle();
      return undefined;
    }
    const boxes = new Map<HTMLElement, LayoutBox>();
    for (const node of Array.from(root.querySelectorAll("*"))) {
      if (node instanceof view.HTMLElement) {
        const box = this.boxOf(node, root);
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
    const starting = new Map<HTMLElement, Motion>();
    for (const [el, { to, timing }] of targets) {
      const running = this._motions.get(el);
      if (running && sameBox(running.to, to)) {
        continue;
      }
      this.stop(el);
      const motion: Motion = { to, shift: NO_SHIFT, animations: [] };
      const size = getSizeKeyframes(boxes.get(el)!, to);
      if (size) {
        const resizing = this.animation(el, size, timing);
        resizing.currentTime = 0;
        motion.animations.push(resizing);
      }
      starting.set(el, motion);
    }
    const starts = new Map<HTMLElement, LayoutPoint>();
    for (const [el, { timing }] of targets) {
      const motion = starting.get(el);
      if (!motion) {
        starts.set(el, this.shiftOf(this._motions.get(el)!));
        continue;
      }
      const move = getMoveKeyframes(
        boxes.get(el)!,
        this.placeOf(el),
        this.carried(el, starts),
      );
      starts.set(el, move.shift);
      if (move.keyframes) {
        motion.shift = move.shift;
        motion.move = this.animation(el, move.keyframes, timing, "add");
        motion.animations.push(motion.move);
      }
      if (motion.animations.length > 0) {
        this._motions.set(el, motion);
        this.run(el, motion);
      }
    }
  }

  settle(): void {
    for (const el of Array.from(this._motions.keys())) {
      this.stop(el);
    }
  }

  protected styled(root: HTMLElement): boolean {
    for (const sheet of Array.from(root.querySelectorAll("style"))) {
      if (LAYOUT_STYLE.test(sheet.textContent ?? "")) {
        return true;
      }
    }
    return root.querySelector('[style*="layout"]') != null;
  }

  protected targetsOf(
    boxes: Map<HTMLElement, LayoutBox>,
  ): Map<HTMLElement, { to: LayoutBox; timing: LayoutTiming }> {
    const targets = new Map<HTMLElement, { to: LayoutBox; timing: LayoutTiming }>();
    const resume = this.suspend();
    try {
      for (const el of boxes.keys()) {
        const view = el.ownerDocument.defaultView;
        const timing =
          view && el.isConnected
            ? getLayoutTiming(view.getComputedStyle(el))
            : undefined;
        const to = timing ? this.boxOf(el) : undefined;
        if (timing && to) {
          targets.set(el, { to, timing });
        }
      }
    } finally {
      resume();
    }
    return targets;
  }

  protected placeOf(el: HTMLElement): LayoutPoint {
    let x = 0;
    let y = 0;
    for (
      let node: HTMLElement | null = el;
      node;
      node = node.offsetParent as HTMLElement | null
    ) {
      x += node.offsetLeft;
      y += node.offsetTop;
      const parent = node.offsetParent as HTMLElement | null;
      if (parent) {
        x += parent.clientLeft;
        y += parent.clientTop;
      }
    }
    return { x, y };
  }

  protected boxOf(
    el: HTMLElement,
    inFlightWithin?: HTMLElement,
  ): LayoutBox | undefined {
    const view = el.ownerDocument.defaultView;
    if (!view || el.getClientRects().length === 0) {
      return undefined;
    }
    let { x, y } = this.placeOf(el);
    if (inFlightWithin) {
      for (
        let node: HTMLElement | null = el;
        node && node !== inFlightWithin;
        node = node.parentElement
      ) {
        const motion = this._motions.get(node);
        if (motion) {
          const shift = this.shiftOf(motion);
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

  protected carried(
    el: HTMLElement,
    starts: Map<HTMLElement, LayoutPoint>,
  ): LayoutPoint {
    const carried = { x: 0, y: 0 };
    for (let node = el.parentElement; node; node = node.parentElement) {
      const shift = starts.get(node);
      if (shift) {
        carried.x += shift.x;
        carried.y += shift.y;
      }
    }
    return carried;
  }

  protected shiftOf(motion: Motion): LayoutPoint {
    const progress = motion.move?.effect?.getComputedTiming().progress;
    if (progress == null) {
      return NO_SHIFT;
    }
    return {
      x: motion.shift.x * (1 - progress),
      y: motion.shift.y * (1 - progress),
    };
  }

  protected suspend(): () => void {
    const held: [Animation, CSSNumberish | null][] = [];
    for (const motion of this._motions.values()) {
      for (const animation of motion.animations) {
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
    composite?: CompositeOperation,
  ): Animation {
    return new Animation(
      new KeyframeEffect(el, keyframes, {
        duration: timing.duration,
        delay: timing.delay,
        easing: timing.easing,
        fill: "backwards",
        ...(composite ? { composite } : {}),
      }),
    );
  }

  protected run(el: HTMLElement, motion: Motion): void {
    for (const animation of motion.animations) {
      animation.play();
      void (this._hold ? this._hold.add(animation) : animation.finished).then(
        () => this.finished(el, motion),
        () => undefined,
      );
    }
  }

  protected finished(el: HTMLElement, motion: Motion): void {
    if (
      this._motions.get(el) === motion &&
      motion.animations.every((a) => a.playState === "finished")
    ) {
      this._motions.delete(el);
    }
  }

  protected stop(el: HTMLElement): void {
    const motion = this._motions.get(el);
    if (motion) {
      this._motions.delete(el);
      for (const animation of motion.animations) {
        animation.cancel();
      }
    }
  }
}
