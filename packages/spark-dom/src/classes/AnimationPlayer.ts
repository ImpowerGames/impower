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

export default class AnimationPlayer {
  protected _instances: AnimationInstance[] = [];

  protected _theme: ThemeVariables;

  protected _hold?: AnimationHold;

  constructor(theme: ThemeVariables, hold?: AnimationHold) {
    this._theme = theme;
    this._hold = hold;
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
          this.addKeyframes(element, convertedKeyframes, animation.timing),
        );
      });
    }
    return created;
  }

  addKeyframes(
    element: Element,
    keyframes: Keyframe[],
    timing: AnimationTiming,
  ): Animation {
    const instance = new Animation(
      new KeyframeEffect(element, keyframes, getEffectTiming(timing)),
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
        onEnd?.(instance.animation);
      }),
    );
  }
}
