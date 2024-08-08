import { getElementContent } from "../../../../spark-dom/src/utils/getElementContent";
import { getMilliseconds } from "../../../../spark-dom/src/utils/getMilliseconds";
import { RequestMessage } from "../../../../spark-engine/src/game/core";
import { EventMessage } from "../../../../spark-engine/src/game/core/classes/messages/EventMessage";
import { AnimateElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/AnimateElementMessage";
import { CreateElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/CreateElementMessage";
import { DestroyElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/DestroyElementMessage";
import { ObserveElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/ObserveElementMessage";
import { SetThemeMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/SetThemeMessage";
import { UnobserveElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/UnobserveElementMessage";
import { UpdateElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/UpdateElementMessage";
import { Disposable } from "../Disposable";
import Scene from "../Scene";
import { getEventData } from "../utils/getEventData";

export default class UIScene extends Scene {
  protected _headRoots: HTMLElement[] = [];

  protected _overlayRoots: HTMLElement[] = [];

  protected _breakpoints: Record<string, number> = {};

  protected _listeners: Record<string, (event: Event) => void> = {};

  protected get head() {
    return document.documentElement.getElementsByTagName("head")?.[0];
  }

  override onDispose(): Disposable[] {
    this._headRoots.forEach((el) => el.remove());
    this._overlayRoots.forEach((el) => el.remove());
    this._listeners = {};
    return super.onDispose();
  }

  getElement(id: string | null | undefined) {
    if (!id) {
      return this.overlay;
    }
    return (
      (this.overlay?.querySelector(`#${id}`) as HTMLElement) ||
      (this.head?.querySelector(`#${id}`) as HTMLElement)
    );
  }

  override async onReceiveRequest(msg: RequestMessage) {
    if (SetThemeMessage.type.isRequest(msg)) {
      const params = msg.params;
      this._breakpoints = params.breakpoints;
      return SetThemeMessage.type.result("");
    }
    if (CreateElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const el = document.createElement(params.type);
      if (params.element) {
        el.id = params.element;
      }
      if (params.name) {
        el.className = params.name;
      }
      if (params.content) {
        el.textContent = getElementContent(params.content);
      }
      if (params.style) {
        el.style.cssText = Object.entries(params.style)
          .map(([k, v]) => {
            const prop = k.startsWith("--") ? k : k.replaceAll("_", "-");
            return `${prop}: ${v}`;
          })
          .join(";");
      }
      if (params.attributes) {
        Object.entries(params.attributes).forEach(([k, v]) => {
          if (v != null) {
            el.setAttribute(k, v);
          }
        });
      }
      const isHeadElement = params.content && "fonts" in params.content;
      const parent = isHeadElement ? this.head : this.getElement(params.parent);
      if (parent) {
        const appendedEl = parent.appendChild(el);
        if (parent === this.head) {
          this._headRoots.push(appendedEl);
        }
        if (parent === this.overlay) {
          this._overlayRoots.push(appendedEl);
        }
      }
      return CreateElementMessage.type.result(params.element);
    }
    if (DestroyElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const element = this.getElement(params.element);
      if (element) {
        element.remove();
      }
      return DestroyElementMessage.type.result(params.element);
    }
    if (UpdateElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const element = this.getElement(params.element);
      if (element) {
        if (params.content != undefined) {
          element.textContent = getElementContent(params.content);
        }
        if (params.attributes != undefined) {
          if (params.attributes) {
            Object.entries(params.attributes).forEach(([k, v]) => {
              if (v == null) {
                if (element) {
                  element.removeAttribute(k);
                }
              } else {
                if (element) {
                  element.setAttribute(k, v);
                }
              }
            });
          } else {
            Array.from(element.attributes).forEach((attr) =>
              element.removeAttribute(attr.name)
            );
          }
        }
        if (params.style != undefined) {
          if (params.style) {
            Object.entries(params.style).forEach(([k, v]) => {
              const prop = k.startsWith("--") ? k : k.replaceAll("_", "-");
              if (v == null) {
                if (element) {
                  element.style.removeProperty(prop);
                }
              } else {
                if (element) {
                  element.style.setProperty(prop, v);
                }
              }
            });
          } else {
            element.style.cssText = "";
          }
        }
      }
      return UpdateElementMessage.type.result(params.element);
    }
    if (AnimateElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const element = this.getElement(params.element);
      const animations = params.animations;
      const effects: {
        element: Element;
        animation: Animation;
        persist: boolean;
      }[] = [];
      if (element) {
        // Convert engine animations to dom animations
        animations.forEach((animation) => {
          const convertedKeyframes: Keyframe[] = [];
          animation.keyframes.forEach((keyframe) => {
            if (keyframe) {
              const convertedKeyframe: Keyframe = {};
              Object.entries(keyframe).forEach(([prop, value]) => {
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
                convertedKeyframes.push(convertedKeyframe);
              });
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
          effects.push({
            element,
            animation: new Animation(
              new KeyframeEffect(element, convertedKeyframes, convertedTiming)
            ),
            persist,
          });
        });
      }
      // Play dom animations
      await Promise.allSettled(
        effects.map(async (effect) => {
          effect.animation.play();
          await effect.animation.finished;
          const isDisplayed =
            (effect.element as HTMLElement).offsetParent != null;
          if (isDisplayed) {
            effect.animation.commitStyles();
            effect.animation.cancel();
          }
        })
      );
      // Send response when all animations are complete
      return AnimateElementMessage.type.result(params.element);
    }
    if (ObserveElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const el = this.getElement(params.element);
      if (el) {
        const listener = (event: Event) => {
          this.emit(EventMessage.type.notification(getEventData(event)));
        };
        this._listeners[params.element] = listener;
        el.addEventListener(params.event, listener);
      }
    }
    if (UnobserveElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const el = this.getElement(params.element);
      if (el) {
        const listener = this._listeners[params.element];
        if (listener) {
          el.removeEventListener(params.event, listener);
        }
      }
    }
    return undefined;
  }

  override onResize(entry: ResizeObserverEntry): void {
    if (this._breakpoints) {
      const width = entry.contentRect?.width;
      const keys = Object.keys(this._breakpoints);
      let className = "";
      for (let i = 0; i < keys.length; i += 1) {
        const k = keys[i] || "";
        className += `${k} `;
        const b = this._breakpoints[k];
        if (b !== undefined) {
          if (b > width) {
            break;
          }
        }
      }
      className = className.trim();
      if (this.overlay && this.overlay.className !== className) {
        this.overlay.className = className;
      }
    }
  }
}
