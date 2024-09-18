import { Animation as AnimationDefinition } from "../../../spark-engine/src/game/modules/ui/types/Animation";
import { getCSSPropertyKeyValue } from "../utils/getCSSPropertyKeyValue";
import { getMilliseconds } from "../utils/getMilliseconds";

export interface AnimationInstance {
  element: Element;
  animation: Animation;
  persist: boolean;
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
        animation.keyframes.forEach((keyframe) => {
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
                    group.toUpperCase().replace("-", "").replace("_", "")
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
        if (animation.timing.direction) {
          convertedTiming.direction = animation.timing.direction;
        }
        if (animation.timing.easing) {
          convertedTiming.easing = animation.timing.easing;
        }
        if (animation.timing.fill) {
          convertedTiming.fill = animation.timing.fill;
        }
        const persist =
          convertedTiming.fill === "forwards" ||
          convertedTiming.fill === "both";
        this._instances.push({
          element,
          animation: new Animation(
            new KeyframeEffect(element, convertedKeyframes, convertedTiming)
          ),
          persist,
        });
      });
    }
  }

  async play(): Promise<void> {
    await Promise.allSettled(
      this._instances.map(async (instance) => {
        instance.animation.play();
        await instance.animation.finished;
        const isDisplayed =
          (instance.element as HTMLElement).offsetParent != null;
        if (instance.persist && isDisplayed) {
          instance.animation.commitStyles();
          instance.animation.cancel();
        }
      })
    );
  }
}
