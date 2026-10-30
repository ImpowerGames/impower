import type { Animation as AnimationDefinition } from "../../../spark-engine/src/game/modules/ui/types/Animation";
import { getCSSPropertyKeyValue } from "../utils/getCSSPropertyKeyValue";
import { getMilliseconds } from "../utils/getMilliseconds";

export interface AnimationInstance {
  element: Element;
  animation: Animation;
}

export interface AnimationEffect {
  element: HTMLElement;
  animations: AnimationDefinition[];
}

export default class AnimationPlayer {
  protected _instances: AnimationInstance[] = [];

  constructor(effects: AnimationEffect[] = []) {
    for (const t of effects) {
      this.add(t);
    }
  }

  add(effect: AnimationEffect): Animation[] {
    const { element, animations } = effect;
    const created: Animation[] = [];
    if (element) {
      animations.forEach((animation) => {
        const convertedKeyframes: Keyframe[] = [];
        const rawKeyframes: unknown = (animation as { keyframes?: unknown })
          .keyframes;
        const keyframeList: any[] = Array.isArray(rawKeyframes)
          ? rawKeyframes
          : rawKeyframes != null
            ? [rawKeyframes]
            : [];
        keyframeList.forEach((keyframe) => {
          if (keyframe) {
            const convertedKeyframe: Keyframe = {};
            for (const [k, v] of Object.entries(keyframe)) {
              const [prop, value] = getCSSPropertyKeyValue(k, v);
              if (prop === "iterations" && value === "infinite") {
                convertedKeyframe["iterations"] = Infinity;
              } else if (prop === "delay") {
                if (typeof value === "number") {
                  convertedKeyframe["delay"] = value * 1000;
                } else if (typeof value === "string") {
                  const ms = getMilliseconds(value);
                  if (ms != null) {
                    convertedKeyframe["delay"] = ms;
                  }
                }
              } else if (prop === "duration") {
                if (typeof value === "number") {
                  convertedKeyframe["duration"] = value * 1000;
                } else if (typeof value === "string") {
                  const ms = getMilliseconds(value);
                  if (ms != null) {
                    convertedKeyframe["duration"] = ms;
                  }
                }
              } else {
                const camelCasedPropName = prop
                  .toLowerCase()
                  .replace(/([-_][\p{Ll}])/gu, (group) =>
                    group.toUpperCase().replace("-", "").replace("_", ""),
                  );
                convertedKeyframe[camelCasedPropName] = value;
              }
            }
            convertedKeyframes.push(convertedKeyframe);
          }
        });
        const convertedTiming: EffectTiming = {};
        if (animation.timing.delay != null) {
          if (typeof animation.timing.delay === "number") {
            convertedTiming.delay = animation.timing.delay * 1000;
          } else if (typeof animation.timing.delay === "string") {
            const ms = getMilliseconds(animation.timing.delay);
            if (ms != null) {
              convertedTiming.delay = ms;
            }
          } else {
            convertedTiming.delay = animation.timing.delay;
          }
        }
        if (animation.timing.duration != null) {
          if (typeof animation.timing.duration === "number") {
            convertedTiming.duration = animation.timing.duration * 1000;
          } else if (typeof animation.timing.duration === "string") {
            const ms = getMilliseconds(animation.timing.duration);
            if (ms != null) {
              convertedTiming.duration = ms;
            }
          } else {
            convertedTiming.duration = animation.timing.duration;
          }
        }
        if (animation.timing.iterations != null) {
          if (animation.timing.iterations === "infinite") {
            convertedTiming.iterations = Infinity;
          } else {
            convertedTiming.iterations = animation.timing.iterations;
          }
        }
        if (animation.timing.direction != null) {
          convertedTiming.direction = animation.timing.direction;
        }
        if (animation.timing.easing != null) {
          convertedTiming.easing = animation.timing.easing;
        }
        if (animation.timing.fill != null) {
          convertedTiming.fill = animation.timing.fill;
        }
        if (animation.timing.end_delay != null) {
          if (typeof animation.timing.end_delay === "number") {
            convertedTiming.endDelay = animation.timing.end_delay * 1000;
          } else if (typeof animation.timing.end_delay === "string") {
            const ms = getMilliseconds(animation.timing.end_delay);
            if (ms != null) {
              convertedTiming.endDelay = ms;
            }
          } else {
            convertedTiming.endDelay = animation.timing.end_delay;
          }
        }
        if (animation.timing.iteration_start != null) {
          convertedTiming.iterationStart = animation.timing.iteration_start;
        }
        if (animation.timing.playback_rate != null) {
          convertedTiming.playbackRate = animation.timing.playback_rate;
        }
        const instance = new Animation(
          new KeyframeEffect(element, convertedKeyframes, convertedTiming),
        );
        this._instances.push({ element, animation: instance });
        created.push(instance);
      });
    }
    return created;
  }

  get endTime(): number {
    let end = 0;
    for (const instance of this._instances) {
      const effect = instance.animation.effect;
      end = Math.max(end, Number(effect?.getComputedTiming?.().endTime ?? 0));
    }
    return end;
  }

  async play(startTime?: number): Promise<void> {
    await Promise.allSettled(
      this._instances.map(async (instance) => {
        if (startTime != null) {
          instance.animation.startTime = startTime;
        } else {
          instance.animation.startTime = document.timeline.currentTime;
          instance.animation.play();
        }
        await instance.animation.finished;
      }),
    );
  }
}
