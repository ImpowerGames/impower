import AnimationPlayer from "@impower/spark-dom/src/classes/AnimationPlayer";
import { getCSSPropertyKeyValue } from "@impower/spark-dom/src/utils/getCSSPropertyKeyValue";
import { getElementContent } from "@impower/spark-dom/src/utils/getElementContent";
import { RequestMessage } from "@impower/spark-engine/src/game/core";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { AnimateElementsMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/AnimateElementsMessage";
import { CreateElementMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/CreateElementMessage";
import { DestroyElementMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/DestroyElementMessage";
import { ObserveElementMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/ObserveElementMessage";
import { SetThemeMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/SetThemeMessage";
import { UnobserveElementMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/UnobserveElementMessage";
import { UpdateElementMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/UpdateElementMessage";
import { Disposable } from "../Disposable";
import Scene from "../Scene";
import { getEventData } from "../utils/getEventData";

export default class UIScene extends Scene {
  protected _overlayRoots: HTMLElement[] = [];

  protected _breakpoints: Record<string, number> = {};

  protected _listeners: Record<string, (event: Event) => void> = {};

  override onDispose(): Disposable[] {
    this._overlayRoots.forEach((el) => el.remove());
    this._listeners = {};
    return super.onDispose();
  }

  getElement(id: string | null | undefined) {
    if (!id) {
      return this.overlay;
    }
    return this.overlay?.querySelector(`#${id}`) as HTMLElement;
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
      if (params.content && "fonts" in params.content) {
        for (const [, font] of Object.entries(params.content.fonts)) {
          try {
            if (font.font_family) {
              const fontFace = new FontFace(
                font.font_family,
                `url(${font.src})`,
                {
                  style: font.font_style || undefined,
                  weight: font.font_weight || undefined,
                  stretch: font.font_stretch || undefined,
                  display: (font.font_display as FontDisplay) || undefined,
                }
              );
              if (
                !Array.from(document.fonts).some(
                  (f) =>
                    f.family === font.font_family &&
                    f.style === font.font_style &&
                    f.weight === font.font_weight &&
                    f.stretch === font.font_stretch
                )
              ) {
                document.fonts.add(fontFace);
                await fontFace.load();
              }
            }
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        const parent = this.getElement(params.parent);
        if (parent) {
          const appendedEl = parent.appendChild(el);
          if (parent === this.overlay) {
            this._overlayRoots.push(appendedEl);
          }
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
