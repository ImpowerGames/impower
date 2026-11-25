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

const carry = (
  animation: Animation,
  time: CSSNumberish | null,
): Animation[] => {
  const effect = animation.effect as KeyframeEffect | null;
  const target = effect?.target;
  if (!effect || !target || typeof target.animate !== "function") {
    return [];
  }
  const keyframes = effect
    .getKeyframes()
    .map(({ computedOffset: _, ...keyframe }) => keyframe);
  const carried = target.animate(keyframes as Keyframe[], {
    ...effect.getTiming(),
    ...(effect.pseudoElement ? { pseudoElement: effect.pseudoElement } : {}),
  } as KeyframeAnimationOptions);
  carried.currentTime = time ?? 0;
  return [carried];
};

export default class PresencePlayer {
  protected _motions = new Map<Element, Motion>();

  protected _before = new WeakMap<Element, Set<Animation>>();

  protected _carried = new Map<Element, Animation[]>();

  protected _plays = new WeakMap<Element, object>();

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
    const turn = {};
    this._plays.set(element, turn);
    if (
      presence === "show" &&
      element.getAttribute(PRESENCE_ATTRIBUTE) !== "initial"
    ) {
      return;
    }
    void element.ownerDocument.defaultView?.getComputedStyle(element).opacity;
    const current = this.animations(element);
    const before =
      (presence === "show" ? this._before.get(element) : undefined) ??
      new Set(current);
    this._before.delete(element);
    const initial = new Map(
      current
        .filter((animation) => !before.has(animation) && "animationName" in animation)
        .map((animation) => [animation, animation.currentTime] as const),
    );
    element.setAttribute(PRESENCE_ATTRIBUTE, presence);
    const after = this.animations(element);
    const carried = [...initial]
      .filter(([animation]) => !after.includes(animation))
      .flatMap(([animation, time]) => carry(animation, time));
    if (carried.length > 0) {
      this._carried.set(element, carried);
    }
    const started = [
      ...after.filter((animation) => !before.has(animation)),
      ...carried,
    ];
    if (this.reducedMotion()) {
      for (const animation of started) {
        if (moves(animation)) {
          if (finite(animation)) {
            animation.finish();
          } else {
            animation.cancel();
          }
        }
      }
    }
    const timed = started.filter(finite);
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
    if (this._plays.get(element) === turn) {
      this._plays.delete(element);
      if (
        presence === "show" &&
        element.getAttribute(PRESENCE_ATTRIBUTE) === "show"
      ) {
        element.removeAttribute(PRESENCE_ATTRIBUTE);
      }
    }
    this.release(element, carried);
  }

  protected release(
    element: Element,
    carried = this._carried.get(element),
  ): void {
    if (this._carried.get(element) === carried) {
      this._carried.delete(element);
    }
    for (const animation of carried ?? []) {
      animation.cancel();
    }
  }

  end(element: Element): void {
    const motion = this._motions.get(element);
    if (motion) {
      this._motions.delete(element);
      motion.end();
    }
    this.release(element);
  }

  endWithin(root: Element): void {
    for (const element of [...this._motions.keys(), ...this._carried.keys()]) {
      if (root === element || root.contains(element)) {
        this.end(element);
      }
    }
  }

  endAll(): void {
    for (const element of [...this._motions.keys(), ...this._carried.keys()]) {
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
