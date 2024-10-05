import { getElementContent } from "../../../../spark-dom/src/utils/getElementContent";
import { getCSSPropertyKeyValue } from "../../../../spark-dom/src/utils/getCSSPropertyKeyValue";
import AnimationPlayer from "../../../../spark-dom/src/classes/AnimationPlayer";
import { RequestMessage } from "../../../../spark-engine/src/game/core";
import { EventMessage } from "../../../../spark-engine/src/game/core/classes/messages/EventMessage";
import { AnimateElementsMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/AnimateElementsMessage";
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
        el.textContent = getElementContent(params.content, {
          breakpoints: params.breakpoints,
          scope: ":host",
        });
      }
      if (params.style) {
        el.style.cssText = Object.entries(params.style)
          .map(([k, v]) => {
            const [prop, value] = getCSSPropertyKeyValue(k, v);
            return `${prop}: ${value}`;
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
          element.textContent = getElementContent(params.content, {
            breakpoints: params.breakpoints,
            scope: ":host",
          });
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
              const [prop, value] = getCSSPropertyKeyValue(k, v);
              if (v == null) {
                if (element) {
                  element.style.removeProperty(prop);
                }
              } else {
                if (element) {
                  element.style.setProperty(prop, value);
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
    if (AnimateElementsMessage.type.isRequest(msg)) {
      const params = msg.params;
      const player = new AnimationPlayer();
      const validEffects: number[] = [];
      for (let i = 0; i < params.effects.length; i += 1) {
        const effect = params.effects[i];
        if (effect) {
          const element = this.getElement(effect.element);
          const animations = effect.animations;
          if (element) {
            player.add({ element, animations });
            validEffects.push(i);
          }
        }
      }
      await player.play();
      return AnimateElementsMessage.type.result(validEffects);
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
}
