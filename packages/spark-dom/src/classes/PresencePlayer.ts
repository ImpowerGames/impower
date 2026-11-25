import {
  PRESENCE_ATTRIBUTE,
  type Presence,
} from "../../../sparkle-style-transformer/src/utils/sparkleSelector";
import type AnimationHold from "./AnimationHold";

const MOVES =
  /^(?:translate|transform|scale|rotate|left|right|top|bottom|inset|width|height|min-width|max-width|min-height|max-height|margin|padding|flex|gap|grid|aspect-ratio)/;

type Animated = Element & {
  getAnimations?: (options?: { subtree?: boolean }) => Animation[];
};

interface Motion {
  animations: Animation[];
  end: () => void;
}

const styleDriven = (animation: Animation) =>
  "transitionProperty" in animation || "animationName" in animation;

const finite = (animation: Animation) =>
  Number.isFinite(Number(animation.effect?.getComputedTiming().endTime));

const cssName = (key: string) =>
  key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const moves = (animation: Animation): boolean => {
  if ("transitionProperty" in animation) {
    return MOVES.test(String((animation as CSSTransition).transitionProperty));
  }
  const keyframes =
    (animation.effect as KeyframeEffect | null)?.getKeyframes?.() ?? [];
  return keyframes.some((keyframe) =>
    Object.keys(keyframe).some((key) => MOVES.test(cssName(key))),
  );
};

export default class PresencePlayer {
  protected _motions = new Map<Element, Motion>();

  protected _before = new WeakMap<Element, Set<Animation>>();

  constructor(
    protected hold: AnimationHold,
    protected reducedMotion: () => boolean,
  ) {}

  protected animations(element: Element): Animation[] {
    const animated = element as Animated;
    return typeof animated.getAnimations === "function"
      ? animated.getAnimations({ subtree: true }).filter(styleDriven)
      : [];
  }

  async play(element: HTMLElement, presence: Exclude<Presence, "initial">) {
    this.end(element);
    if (
      presence === "show" &&
      element.getAttribute(PRESENCE_ATTRIBUTE) !== "initial"
    ) {
      return;
    }
    void element.ownerDocument.defaultView?.getComputedStyle(element).opacity;
    const before =
      (presence === "show" ? this._before.get(element) : undefined) ??
      new Set(this.animations(element));
    this._before.delete(element);
    element.setAttribute(PRESENCE_ATTRIBUTE, presence);
    const started = this.animations(element).filter(
      (animation) => !before.has(animation),
    );
    const timed = started.filter(finite);
    if (this.reducedMotion()) {
      for (const animation of timed) {
        if (moves(animation)) {
          animation.finish();
        }
      }
    }
    const held = started.map((animation) =>
      this.hold.add(animation).catch(() => undefined),
    );
    if (timed.length > 0) {
      let motion!: Motion;
      await new Promise<void>((resolve) => {
        motion = { animations: timed, end: resolve };
        this._motions.set(element, motion);
        void Promise.all(
          held.filter((_, i) => timed.includes(started[i]!)),
        ).then(() => resolve());
      });
      if (this._motions.get(element) === motion) {
        this._motions.delete(element);
      }
    }
    if (
      presence === "show" &&
      element.getAttribute(PRESENCE_ATTRIBUTE) === "show"
    ) {
      element.removeAttribute(PRESENCE_ATTRIBUTE);
    }
  }

  end(element: Element): void {
    const motion = this._motions.get(element);
    if (motion) {
      this._motions.delete(element);
      motion.end();
    }
  }

  endWithin(root: Element): void {
    for (const element of [...this._motions.keys()]) {
      if (root === element || root.contains(element)) {
        this.end(element);
      }
    }
  }

  endAll(): void {
    for (const element of [...this._motions.keys()]) {
      this.end(element);
    }
  }

  settle(element: Element): void {
    for (const animation of this._motions.get(element)?.animations ?? []) {
      animation.finish();
    }
    this.end(element);
  }

  change(element: Element, presence: string | null): () => void {
    this._before.delete(element);
    if (presence === "initial") {
      this._before.set(element, new Set(this.animations(element)));
    }
    if (presence != null) {
      this.end(element);
      return () => {};
    }
    this.settle(element);
    const before = new Set(this.animations(element));
    return () => {
      for (const animation of this.animations(element)) {
        if (!before.has(animation) && finite(animation)) {
          animation.finish();
        }
      }
    };
  }
}
