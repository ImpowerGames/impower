import { getElementContent } from "../../../../spark-dom/src/utils/getElementContent";
import { RequestMessage } from "../../../../spark-engine/src/game/core";
import { EventMessage } from "../../../../spark-engine/src/game/core/classes/messages/EventMessage";
import { CloneElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/CloneElementMessage";
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
      if (params.id) {
        el.id = params.id;
      }
      if (params.name) {
        el.className = params.name;
      }
      if (params.content) {
        el.textContent = getElementContent(params.content);
      }
      if (params.style) {
        el.style.cssText = Object.entries(params.style)
          .map(([k, v]) => `${k}: ${v}`)
          .join(";");
      }
      if (params.attributes) {
        Object.entries(params.attributes).forEach(([k, v]) => {
          if (v != null) {
            el.setAttribute(k, v);
          }
        });
      }
      const isImport = params.content && "import" in params.content;
      const parent = isImport ? this.head : this.getElement(params.parent);
      if (parent) {
        const appendedEl = parent.appendChild(el);
        if (parent === this.head) {
          this._headRoots.push(appendedEl);
        }
        if (parent === this.overlay) {
          this._overlayRoots.push(appendedEl);
        }
      }
      return CreateElementMessage.type.result(params.id);
    }
    if (CloneElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const el = this.getElement(params.targetId);
      if (el) {
        const clonedEl = el.cloneNode(true) as HTMLElement;
        clonedEl.id = params.newId;
        el.parentElement?.appendChild(clonedEl);
      }
      return CloneElementMessage.type.result(params.newId);
    }
    if (DestroyElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const element = this.getElement(params.id);
      if (element) {
        element.remove();
      }
      return DestroyElementMessage.type.result(params.id);
    }
    if (UpdateElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const element = this.getElement(params.id);
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
              if (v == null) {
                if (element) {
                  element.style.removeProperty(k);
                }
              } else {
                if (element) {
                  element.style.setProperty(k, v);
                }
              }
            });
          } else {
            element.style.cssText = "";
          }
        }
      }
      return UpdateElementMessage.type.result(params.id);
    }
    if (ObserveElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const el = this.getElement(params.id);
      if (el) {
        const listener = (event: Event) => {
          this.emit(EventMessage.type.notification(getEventData(event)));
        };
        this._listeners[params.id] = listener;
        el.addEventListener(params.event, listener);
      }
    }
    if (UnobserveElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const el = this.getElement(params.id);
      if (el) {
        const listener = this._listeners[params.id];
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
