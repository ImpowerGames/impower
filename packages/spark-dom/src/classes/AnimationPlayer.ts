import type { Animation as AnimationDefinition } from "../../../spark-engine/src/game/modules/ui/types/Animation";
import type { AnimationTiming } from "../../../spark-engine/src/game/modules/ui/types/AnimationTiming";
import { getCssEquivalent } from "../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import type { ThemeVariables } from "../../../sparkle-style-transformer/src/types/themeVariables";
import { getCssTokenValue } from "../utils/getCssTokenValue";
import type AnimationHold from "./AnimationHold";
import { getMilliseconds } from "../utils/getMilliseconds";

export interface AnimationInstance {
  element: Element;
  animation: Animation;
}

export interface AnimationEffect {
  element: HTMLElement;
  animations: AnimationDefinition[];
}

const toMilliseconds = (value: number | string | undefined): number | undefined => {
  if (typeof value === "number") {
    return value * 1000;
  }
  if (typeof value === "string") {
    return getMilliseconds(value) ?? undefined;
  }
  return value;
};

export const getEffectTiming = (timing: AnimationTiming): EffectTiming => {
  const convertedTiming: EffectTiming = {};
  const delay = toMilliseconds(timing.delay);
  if (delay != null) {
    convertedTiming.delay = delay;
  }
  const duration = toMilliseconds(timing.duration);
  if (duration != null) {
    convertedTiming.duration = duration;
  }
  if (timing.iterations != null) {
    if (timing.iterations === "infinite") {
      convertedTiming.iterations = Infinity;
    } else {
      convertedTiming.iterations = timing.iterations;
    }
  }
  if (timing.direction != null) {
    convertedTiming.direction = timing.direction;
  }
  if (timing.easing != null) {
    convertedTiming.easing = timing.easing;
  }
  if (timing.fill != null) {
    convertedTiming.fill = timing.fill;
  }
  const endDelay = toMilliseconds(timing.end_delay);
  if (endDelay != null) {
    convertedTiming.endDelay = endDelay;
  }
  if (timing.iteration_start != null) {
    convertedTiming.iterationStart = timing.iteration_start;
  }
  if (timing.playback_rate != null) {
    convertedTiming.playbackRate = timing.playback_rate;
  }
  return convertedTiming;
};

const MOVEMENT = new Set(["transform", "translate", "rotate", "scale"]);

const KEYFRAME_TIMING = new Set(["offset", "easing", "composite"]);

const keyframesWith = (
  keyframes: Keyframe[],
  keep: (prop: string) => boolean,
): Keyframe[] =>
  keyframes.map((keyframe) =>
    Object.fromEntries(
      Object.entries(keyframe).filter(
        ([prop]) => KEYFRAME_TIMING.has(prop) || keep(prop),
      ),
    ),
  );

const movement = (keyframes: Keyframe[]): Set<string> =>
  new Set(
    keyframes.flatMap((keyframe) =>
      Object.keys(keyframe).filter((prop) => MOVEMENT.has(prop)),
    ),
  );

const persisted = new WeakMap<Element, Map<Animation, Set<string>>>();

const moverProps = new WeakMap<Animation, Set<string>>();

const setsProperties = (keyframes: Keyframe[]): boolean =>
  keyframes.some((keyframe) =>
    Object.keys(keyframe).some((prop) => !KEYFRAME_TIMING.has(prop)),
  );

export default class AnimationPlayer {
  protected _instances: AnimationInstance[] = [];

  protected _moved: Map<Element, Set<string>>;

  protected _movers: Map<Element, Animation[]>;

  protected _supersedes = new Map<Animation, Animation[]>();

  protected _theme: ThemeVariables;

  protected _hold?: AnimationHold;

  constructor(theme: ThemeVariables, hold?: AnimationHold, together?: AnimationPlayer) {
    this._theme = theme;
    this._hold = hold;
    this._moved = together?._moved ?? new Map();
    this._movers = together?._movers ?? new Map();
  }

  add(effect: AnimationEffect): Animation[] {
    const { element, animations } = effect;
    const created: Animation[] = [];
    if (element) {
      animations.forEach((animation) => {
        const convertedKeyframes: Keyframe[] = [];
        animation.keyframes.forEach((keyframe) => {
          if (keyframe) {
            const convertedKeyframe: Keyframe = {};
            for (const [k, v] of Object.entries(keyframe)) {
              for (const [prop, value] of getCssEquivalent(
                k,
                getCssTokenValue(v),
                this._theme,
              )) {
                const keyframeProp = prop.startsWith("--")
                  ? prop
                  : prop
                      .toLowerCase()
                      .replace(/([-_][\p{Ll}])/gu, (group) =>
                        group.toUpperCase().replace("-", "").replace("_", ""),
                      );
                convertedKeyframe[keyframeProp] = value;
              }
            }
            convertedKeyframes.push(convertedKeyframe);
          }
        });
        created.push(
          ...this.addCombined(element, convertedKeyframes, animation.timing),
        );
      });
    }
    return created;
  }

  protected addCombined(
    element: Element,
    keyframes: Keyframe[],
    timing: AnimationTiming,
  ): Animation[] {
    const moved = this._moved.get(element) ?? new Set<string>();
    this._moved.set(element, moved);
    const adding = new Set(
      keyframes.flatMap((keyframe) =>
        Object.keys(keyframe).filter((prop) => moved.has(prop)),
      ),
    );
    for (const keyframe of keyframes) {
      for (const prop of Object.keys(keyframe)) {
        if (MOVEMENT.has(prop)) {
          moved.add(prop);
        }
      }
    }
    const movers = this._movers.get(element) ?? [];
    this._movers.set(element, movers);
    if (adding.size === 0) {
      return [this.addMover(movers, element, keyframes, timing)];
    }
    const replaced = keyframesWith(keyframes, (prop) => !adding.has(prop));
    const combined = [
      ...(setsProperties(replaced)
        ? [this.addMover(movers, element, replaced, timing)]
        : []),
      this.addMover(
        movers,
        element,
        keyframesWith(keyframes, (prop) => adding.has(prop)),
        timing,
        "add",
      ),
    ];
    const kept = persisted.get(element) ?? new Map<Animation, Set<string>>();
    persisted.set(element, kept);
    for (const mover of movers) {
      mover.persist();
      kept.set(mover, moverProps.get(mover)!);
    }
    return combined;
  }

  protected addMover(
    movers: Animation[],
    element: Element,
    keyframes: Keyframe[],
    timing: AnimationTiming,
    composite?: CompositeOperation,
  ): Animation {
    const instance = this.addKeyframes(element, keyframes, timing, composite);
    const props = movement(keyframes);
    if (props.size > 0) {
      movers.push(instance);
      moverProps.set(instance, props);
      if (!composite) {
        this._supersedes.set(
          instance,
          [...(persisted.get(element) ?? [])]
            .filter(([, earlier]) => [...earlier].every((prop) => props.has(prop)))
            .map(([animation]) => animation),
        );
      }
    }
    return instance;
  }

  protected release(animation: Animation, element: Element): void {
    const kept = persisted.get(element);
    for (const earlier of this._supersedes.get(animation) ?? []) {
      if (kept?.delete(earlier)) {
        earlier.cancel();
      }
    }
  }

  addKeyframes(
    element: Element,
    keyframes: Keyframe[],
    timing: AnimationTiming,
    composite?: CompositeOperation,
  ): Animation {
    const instance = new Animation(
      new KeyframeEffect(element, keyframes, {
        ...getEffectTiming(timing),
        ...(composite ? { composite } : {}),
      }),
    );
    this._instances.push({ element, animation: instance });
    return instance;
  }

  remove(animation: Animation): void {
    this._instances = this._instances.filter(
      (instance) => instance.animation !== animation,
    );
  }

  get endTimeUndelayed(): number {
    let end = 0;
    for (const instance of this._instances) {
      const effect = instance.animation.effect;
      const computed = Number(effect?.getComputedTiming?.().endTime ?? 0);
      const delay = Number(effect?.getTiming?.().delay ?? 0);
      end = Math.max(end, computed - delay);
    }
    return end;
  }

  async play(
    startTime?: number,
    onEnd?: (animation: Animation) => void,
  ): Promise<void> {
    await Promise.allSettled(
      this._instances.map(async (instance) => {
        if (startTime != null) {
          instance.animation.startTime = startTime;
        } else {
          instance.animation.startTime = document.timeline.currentTime;
          instance.animation.play();
        }
        await (this._hold
          ? this._hold.add(instance.animation)
          : instance.animation.finished);
        this.release(instance.animation, instance.element);
        onEnd?.(instance.animation);
      }),
    );
  }

  retime(startTime: number): void {
    for (const instance of this._instances) {
      instance.animation.startTime = startTime;
    }
  }
}
