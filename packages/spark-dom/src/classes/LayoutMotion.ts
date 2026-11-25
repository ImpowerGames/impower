import type AnimationHold from "./AnimationHold";

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutBox extends LayoutPoint {
  width: number;
  height: number;
  insets?: Partial<Record<LayoutInset, number>>;
  sizing?: string;
  undrawn?: LayoutInset[];
}

export type LayoutInset = (typeof INSETS)[number];

interface PlacePass {
  places: Map<HTMLElement, LayoutPoint>;
  aligned: Map<Element, boolean>;
  scales: Map<Element, LayoutPoint>;
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

const UNSCALED = 0.002;

const PIXELS = /^-?\d*\.?\d+(?:e-?\d+)?px$/;

const ANGLE_ZERO = /^-?0*\.?0*(?:deg|rad|grad|turn)?$/;

const INSETS = [
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
] as const;

const NO_SHIFT: LayoutPoint = { x: 0, y: 0 };

const UNIT: LayoutPoint = { x: 1, y: 1 };

const BORDERS = [
  ["borderTopWidth", "borderTopStyle"],
  ["borderRightWidth", "borderRightStyle"],
  ["borderBottomWidth", "borderBottomStyle"],
  ["borderLeftWidth", "borderLeftStyle"],
] as const;

const UNDRAWN = /^(?:none|hidden)$/;

const SIDES = {
  width: ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"],
  height: ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"],
} as const;

const newPass = (): PlacePass => ({
  places: new Map(),
  aligned: new Map(),
  scales: new Map(),
});

const diagonalOf = (style: CSSStyleDeclaration): LayoutPoint | undefined => {
  if (style.rotate && style.rotate !== "none" && !ANGLE_ZERO.test(style.rotate)) {
    return undefined;
  }
  const scale =
    style.scale && style.scale !== "none"
      ? style.scale.trim().split(/\s+/).map(Number)
      : [1];
  if (scale.length > 2 && scale[2] !== 1) {
    return undefined;
  }
  const depth = style.translate?.trim().split(/\s+/)[2];
  if (depth && Number.parseFloat(depth) !== 0) {
    return undefined;
  }
  let x = scale[0]!;
  let y = scale[1] ?? x;
  const transform = style.transform;
  if (transform && transform !== "none") {
    const values = /^matrix\(([^)]*)\)$/.exec(transform)?.[1]?.split(",").map(Number);
    if (values?.length !== 6 || values[1] !== 0 || values[2] !== 0) {
      return undefined;
    }
    x *= values[0]!;
    y *= values[3]!;
  }
  return x > 0 && y > 0 ? { x, y } : undefined;
};

const borderBoxed = (box: LayoutBox) => box.sizing === "border-box";

const insetsAcross = (
  box: LayoutBox,
  axis: "width" | "height",
  drawn: (side: LayoutInset) => boolean = () => true,
) =>
  SIDES[axis].reduce((sum, side) => {
    const inset = box.insets?.[side] ?? 0;
    return sum + (drawn(side) && Number.isFinite(inset) ? inset : 0);
  }, 0);

const outerSize = (box: LayoutBox, axis: "width" | "height") =>
  box[axis] + (borderBoxed(box) ? 0 : insetsAcross(box, axis));

const startSize = (from: LayoutBox, to: LayoutBox, axis: "width" | "height") =>
  outerSize(from, axis) -
  (borderBoxed(to)
    ? 0
    : insetsAcross(from, axis, (side) => !to.undrawn?.includes(side)));

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

const changedInsets = (a: LayoutBox, b: LayoutBox): LayoutInset[] =>
  INSETS.filter((inset) =>
    differs(a.insets?.[inset] ?? NaN, b.insets?.[inset] ?? NaN),
  );

const sameBox = (a: LayoutBox, b: LayoutBox) =>
  !differs(a.x, b.x) &&
  !differs(a.y, b.y) &&
  !differs(startSize(a, b, "width"), b.width) &&
  !differs(startSize(a, b, "height"), b.height) &&
  changedInsets(a, b).length === 0;

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
  for (const inset of changedInsets(from, to)) {
    if (to.undrawn?.includes(inset)) {
      continue;
    }
    start[inset] = `${from.insets![inset]}px`;
    end[inset] = `${to.insets![inset]}px`;
  }
  const axes = (["width", "height"] as const).map(
    (axis) => [axis, startSize(from, to, axis), to[axis]] as const,
  );
  if (
    Object.keys(start).length === 0 &&
    !axes.some(([, size, final]) => differs(size, final))
  ) {
    return undefined;
  }
  for (const [axis, size, final] of axes) {
    if (Number.isFinite(size) && Number.isFinite(final)) {
      pin(start, axis, size);
      pin(end, axis, final);
    }
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
  differs(shift.x, 0) || differs(shift.y, 0) ? shift : NO_SHIFT;

const pixels = (value: string): number[] | undefined => {
  if (value === "none") {
    return [0, 0];
  }
  const parts = value.trim().split(/\s+/);
  if (parts.some((part) => !PIXELS.test(part))) {
    return undefined;
  }
  return [Number.parseFloat(parts[0]!), Number.parseFloat(parts[1] ?? "0")];
};

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

  protected _waiters = new Map<HTMLElement, (() => void)[]>();

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
    const pass = newPass();
    for (const node of Array.from(root.querySelectorAll("*"))) {
      if (node instanceof view.HTMLElement) {
        const box = this.boxOf(node, pass, root);
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
      this.stop(el, false);
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

  async finished(root: Element): Promise<void> {
    const moving = Array.from(this._motions.keys()).filter(
      (el) => el === root || root.contains(el),
    );
    await Promise.all(
      moving.map(
        (el) =>
          new Promise<void>((resolve) => {
            this._waiters.set(el, [...(this._waiters.get(el) ?? []), resolve]);
          }),
      ),
    );
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
    const pass = newPass();
    const resume = this.suspend();
    try {
      for (const el of boxes.keys()) {
        const view = el.ownerDocument.defaultView;
        const timing =
          view && el.isConnected
            ? getLayoutTiming(view.getComputedStyle(el))
            : undefined;
        const to = timing ? this.boxOf(el, pass) : undefined;
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
    const pass = newPass();
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
      const view = el.ownerDocument.defaultView;
      if (!el.isConnected || !view || !this.alignedWithin(el.parentElement, pass, view)) {
        this.stop(el);
        continue;
      }
      const progress = motion.clock.effect?.getComputedTiming().progress ?? 1;
      const shift = settledShift(this.shiftOf(el, motion, progress, pass));
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

  protected shiftOf(
    el: HTMLElement,
    motion: Motion,
    progress: number,
    pass: PlacePass,
  ): LayoutPoint {
    const view = el.ownerDocument.defaultView;
    const scale = view ? this.scaleOf(el.parentElement, pass, view) : UNIT;
    const shift = getLayoutShift(
      motion.from,
      motion.to,
      this.placeOf(el, pass),
      progress,
      this.carried(el, pass),
    );
    return { x: shift.x / scale.x, y: shift.y / scale.y };
  }

  protected placeOf(el: HTMLElement, pass: PlacePass): LayoutPoint {
    const known = pass.places.get(el);
    if (known) {
      return known;
    }
    const view = el.ownerDocument.defaultView;
    const parent = el.offsetParent as HTMLElement | null;
    const base = parent ? this.placeOf(parent, pass) : NO_SHIFT;
    const scale = parent && view ? this.scaleOf(parent, pass, view) : UNIT;
    const offset = (parent && view && this.offsetWithin(el, parent, pass, view)) ?? {
      x: ((parent?.clientLeft ?? 0) + el.offsetLeft) * scale.x,
      y: ((parent?.clientTop ?? 0) + el.offsetTop) * scale.y,
    };
    const place = { x: base.x + offset.x, y: base.y + offset.y };
    pass.places.set(el, place);
    return place;
  }

  protected offsetWithin(
    el: HTMLElement,
    parent: HTMLElement,
    pass: PlacePass,
    view: Window & typeof globalThis,
  ): LayoutPoint | undefined {
    const style = view.getComputedStyle(el);
    const translate = pixels(style.translate ?? "");
    if (
      !translate ||
      style.transform !== "none" ||
      style.rotate !== "none" ||
      style.scale !== "none"
    ) {
      return undefined;
    }
    const rect = el.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const scale = this.scaleOf(el.parentElement, pass, view);
    return {
      x: rect.left - parentRect.left - translate[0]! * scale.x,
      y: rect.top - parentRect.top - translate[1]! * scale.y,
    };
  }

  protected alignedWithin(
    el: Element | null,
    pass: PlacePass,
    view: Window & typeof globalThis,
  ): boolean {
    if (!el) {
      return true;
    }
    const known = pass.aligned.get(el);
    if (known != null) {
      return known;
    }
    const aligned =
      diagonalOf(view.getComputedStyle(el)) !== undefined &&
      this.alignedWithin(el.parentElement, pass, view);
    pass.aligned.set(el, aligned);
    return aligned;
  }

  protected scaleOf(
    el: Element | null,
    pass: PlacePass,
    view: Window & typeof globalThis,
  ): LayoutPoint {
    if (!el) {
      return UNIT;
    }
    const known = pass.scales.get(el);
    if (known) {
      return known;
    }
    const scale = this.measuredScaleOf(el, view) ?? this.composedScaleOf(el, pass, view);
    pass.scales.set(el, scale);
    return scale;
  }

  protected measuredScaleOf(
    el: Element,
    view: Window & typeof globalThis,
  ): LayoutPoint | undefined {
    if (!(el instanceof view.HTMLElement)) {
      return undefined;
    }
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const rect = el.getBoundingClientRect();
    if (!(width > 0) || !(height > 0) || !(rect.width > 0) || !(rect.height > 0)) {
      return undefined;
    }
    const near = (a: number, b: number) => Math.abs(a / b - 1) <= UNSCALED;
    if (near(rect.width, width) && near(rect.height, height)) {
      return UNIT;
    }
    const style = view.getComputedStyle(el);
    const box = (axis: "width" | "height") =>
      Number.parseFloat(style[axis]) +
      (style.boxSizing === "border-box"
        ? 0
        : SIDES[axis].reduce((sum, side) => sum + (Number.parseFloat(style[side]) || 0), 0));
    const boxWidth = box("width");
    const boxHeight = box("height");
    return boxWidth > 0 && boxHeight > 0
      ? { x: rect.width / boxWidth, y: rect.height / boxHeight }
      : undefined;
  }

  protected composedScaleOf(
    el: Element,
    pass: PlacePass,
    view: Window & typeof globalThis,
  ): LayoutPoint {
    const above = this.scaleOf(el.parentElement, pass, view);
    const own = diagonalOf(view.getComputedStyle(el)) ?? UNIT;
    return { x: above.x * own.x, y: above.y * own.y };
  }

  protected boxOf(
    el: HTMLElement,
    pass: PlacePass,
    inFlightWithin?: HTMLElement,
  ): LayoutBox | undefined {
    const view = el.ownerDocument.defaultView;
    if (
      !view ||
      el.getClientRects().length === 0 ||
      !this.alignedWithin(el.parentElement, pass, view)
    ) {
      return undefined;
    }
    let { x, y } = this.placeOf(el, pass);
    if (inFlightWithin) {
      for (
        let node: HTMLElement | null = el;
        node && node !== inFlightWithin;
        node = node.parentElement
      ) {
        const shift = this._motions.get(node)?.shift;
        if (shift) {
          const scale = this.scaleOf(node.parentElement, pass, view);
          x += shift.x * scale.x;
          y += shift.y * scale.y;
        }
      }
    }
    const style = view.getComputedStyle(el);
    const insets: Partial<Record<LayoutInset, number>> = {};
    for (const inset of INSETS) {
      insets[inset] = Number.parseFloat(style[inset]);
    }
    const undrawn = BORDERS.filter(([, line]) => UNDRAWN.test(style[line])).map(
      ([inset]) => inset,
    );
    return {
      x,
      y,
      width: Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
      insets,
      sizing: style.boxSizing,
      ...(undrawn.length > 0 ? { undrawn } : {}),
    };
  }

  protected carried(el: HTMLElement, pass: PlacePass): LayoutPoint {
    const view = el.ownerDocument.defaultView;
    const carried = { x: 0, y: 0 };
    for (let node = el.parentElement; node && view; node = node.parentElement) {
      const shift = this._motions.get(node)?.shift;
      if (shift) {
        const scale = this.scaleOf(node.parentElement, pass, view);
        carried.x += shift.x * scale.x;
        carried.y += shift.y * scale.y;
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

  protected stop(el: HTMLElement, release = true): void {
    const motion = this._motions.get(el);
    if (motion) {
      this._motions.delete(el);
      for (const animation of this.animationsOf(motion)) {
        animation.cancel();
      }
    }
    if (!release) {
      return;
    }
    const waiters = this._waiters.get(el);
    this._waiters.delete(el);
    for (const resolve of waiters ?? []) {
      resolve();
    }
  }
}
