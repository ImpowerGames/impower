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

  add(effect: AnimationEffect) {
    const { element, animations } = effect;
    if (element) {
      // Convert engine animations to dom animations
      animations.forEach((animation) => {
        const convertedKeyframes: Keyframe[] = [];
        // Defensive: an authored `define X as animation with keyframes = {...}`
        // can resolve to a non-array `keyframes` (object/undefined). A lone
        // keyframe object is one keyframe, not an array. The engine
        // (getAnimationDefinition) already normalizes this; here we just avoid
        // crashing if a non-array slips through and blacks out the whole preview.
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
                  // convert seconds to milliseconds
                  convertedKeyframe["delay"] = value * 1000;
                } else if (typeof value === "string") {
                  // convert string time value to milliseconds
                  const ms = getMilliseconds(value);
                  if (ms != null) {
                    convertedKeyframe["delay"] = ms;
                  }
                }
              } else if (prop === "duration") {
                if (typeof value === "number") {
                  // convert seconds to milliseconds
                  convertedKeyframe["duration"] = value * 1000;
                } else if (typeof value === "string") {
                  // convert string time value to milliseconds
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
            // convert seconds to milliseconds
            convertedTiming.delay = animation.timing.delay * 1000;
          } else if (typeof animation.timing.delay === "string") {
            // convert string time value to milliseconds
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
            // convert seconds to milliseconds
            convertedTiming.duration = animation.timing.duration * 1000;
          } else if (typeof animation.timing.duration === "string") {
            // convert string time value to milliseconds
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
            // convert seconds to milliseconds
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
            // convert seconds to milliseconds
            convertedTiming.endDelay = animation.timing.end_delay * 1000;
          } else if (typeof animation.timing.end_delay === "string") {
            // convert string time value to milliseconds
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
        this._instances.push({
          element,
          animation: new Animation(
            new KeyframeEffect(element, convertedKeyframes, convertedTiming),
          ),
        });
      });
    }
  }

  /**
   * Plays every animation from `startTime` on the document timeline, or from
   * now without one. A start time already past plays them with that much
   * already elapsed.
   *
   * Setting a start time is what starts an animation at it. `play()` would
   * rewind one whose start time is still ahead (a negative current time) or
   * whose start is so far past that it has finished, and start it from the
   * beginning when the page is next ready instead.
   */
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
