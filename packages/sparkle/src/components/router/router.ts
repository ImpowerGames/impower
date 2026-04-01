import { getCssAnimation } from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import { animationsComplete } from "../../utils/animationsComplete";
import { cancelAnimations } from "../../utils/cancelAnimations";
import { getDirection } from "../../utils/getDirection";
import { reverseAnimation } from "../../utils/reverseAnimation";
import spec from "./_router";

const EXIT_EVENT = "exit";
const ENTER_EVENT = "enter";

/**
 * Routers are used to lazy-load templates when their value matches an observed value.
 *
 * This element loads any child template whose value attribute matches an observed value.
 * All other children are unloaded.
 */
export default class Router extends SparkleComponent(spec) {
  override get skipChildMorphing() {
    return true;
  }

  get exitFadeEl() {
    return this.refs.oldFade;
  }

  get exitTransformEl() {
    return this.refs.oldTransform;
  }

  get enterFadeEl() {
    return this.unmount === "on-enter" ? this.refs.newFade : this.refs.oldFade;
  }

  get enterTransformEl() {
    return this.unmount === "on-enter"
      ? this.refs.newTransform
      : this.refs.oldTransform;
  }

  get contentTemplates(): HTMLTemplateElement[] {
    const slot = this.contentSlot;
    if (slot) {
      return slot
        .assignedElements()
        .filter(
          (el): el is HTMLTemplateElement => el instanceof HTMLTemplateElement,
        );
    }
    return [];
  }

  get headerTemplates(): HTMLTemplateElement[] {
    const slot = this.refs.headerTemplatesSlot;
    if (slot) {
      const assignedElements = slot.assignedElements({ flatten: true });
      return assignedElements.filter(
        (el): el is HTMLTemplateElement => el instanceof HTMLTemplateElement,
      );
    }
    return [];
  }

  get footerTemplates(): HTMLTemplateElement[] {
    const slot = this.refs.footerTemplatesSlot;
    if (slot) {
      const assignedElements = slot.assignedElements({ flatten: true });
      return assignedElements.filter(
        (el): el is HTMLTemplateElement => el instanceof HTMLTemplateElement,
      );
    }
    return [];
  }

  protected _status: "exiting" | "loading" | "entering" | null = null;

  protected _loadingValue: string | null = null;

  protected _loadedValue: string | null = null;

  protected _loadedContentNodes: Node[] = [];

  protected _enter_transform = "";

  protected _exit_transform = "";

  protected _enter_fade = "";

  protected _exit_fade = "";

  override onConnected() {
    const eventSourceEl = this.eventSource === "window" ? window : this;
    eventSourceEl.addEventListener(
      this.exitEvent || "changing",
      this.handleChanging,
    );
    eventSourceEl.addEventListener(
      this.enterEvent || "changed",
      this.handleChanged,
    );
    if (this.active) {
      this.loadRoute(this.active);
    }
  }

  override onDisconnected() {
    const eventSourceEl = this.eventSource === "window" ? window : this;
    eventSourceEl.removeEventListener(
      this.exitEvent || "changing",
      this.handleChanging,
    );
    eventSourceEl.removeEventListener(
      this.enterEvent || "changed",
      this.handleChanged,
    );
  }

  override onAttributeChanged(name: string, newValue: string) {
    if (name === this.attrs.active) {
      this.loadRoute(newValue);
    }
  }

  cacheAnimationNames() {
    const computedStyle = getComputedStyle(this.root);
    this._exit_transform =
      computedStyle.getPropertyValue("--exit").split(" ")?.[0] || "";
    this._enter_transform =
      computedStyle.getPropertyValue("--enter").split(" ")?.[0] || "";
    this._exit_fade =
      computedStyle.getPropertyValue("--exit-fade").split(" ")?.[0] || "";
    this._enter_fade =
      computedStyle.getPropertyValue("--enter-fade").split(" ")?.[0] || "";
  }

  async exitRoute(direction: string | null): Promise<void> {
    if (this._status === "entering") {
      // already entering, so reverse enter animations
      reverseAnimation(this.enterFadeEl, this._enter_fade);
      reverseAnimation(this.enterTransformEl, this._enter_transform);
    } else {
      const directionSuffix = direction ? `-${direction}` : "";
      const enter = getCssAnimation(this.enter, directionSuffix);
      this.updateRootCssVariable("enter", enter);
      const exit = getCssAnimation(this.exit, directionSuffix);
      this.updateRootCssVariable("exit", exit);
      this.cacheAnimationNames();
      this.playExitTransition();
    }
  }

  async enterRoute(newValue: string): Promise<void> {
    if (this._loadedValue === newValue) {
      await animationsComplete(this.enterFadeEl, this.enterTransformEl);
      if (this.interrupted(newValue)) {
        return;
      }
      // already loaded, so reverse exit animations
      reverseAnimation(this.exitFadeEl, this._exit_fade);
      reverseAnimation(this.exitTransformEl, this._exit_transform);
      await animationsComplete(this.exitFadeEl, this.exitTransformEl);
      if (this.interrupted(newValue)) {
        return;
      }
      this.endTransitions();
    } else {
      if (this.directional != null) {
        // For directional transitions, to give the illusion of continuous motion
        // we only wait for the fade to finish
        await animationsComplete(this.exitFadeEl);
      } else {
        await animationsComplete(this.exitFadeEl, this.exitTransformEl);
      }
      if (this.interrupted(newValue)) {
        return;
      }
      this.root.setAttribute("mounting", "");
      cancelAnimations(this.enterFadeEl);
      cancelAnimations(this.enterTransformEl);
      this.playEnterTransition();
      this.emit(ENTER_EVENT, { key: this.key, value: newValue });
      const targetSlotName =
        this.unmount === "on-enter" ? "new-content" : undefined;
      this.loadRoute(newValue, targetSlotName);
      this.active = newValue;
      this.root.removeAttribute("mounting");
      await animationsComplete(this.enterFadeEl, this.enterTransformEl);
      if (this.interrupted(newValue)) {
        return;
      }
      if (this.unmount === "on-enter" && this._loadedContentNodes.length > 0) {
        this.assignContent(this._loadedContentNodes);
      }
      this.endTransitions();
    }
  }

  interrupted(newValue: string): boolean {
    return this._loadingValue !== newValue;
  }

  playExitTransition() {
    this.updateStatus("exiting");
  }

  playEnterTransition() {
    this.updateStatus("entering");
  }

  loadContent(newValue: string | null, slotName?: string): Node[] {
    if (newValue) {
      const template = this.findTemplate(this.contentTemplates, newValue);
      if (template) {
        return this.loadTemplate(template, slotName);
      }
    }
    return [];
  }

  loadHeader(newValue: string | null): Node[] {
    if (newValue) {
      const template = this.findTemplate(this.headerTemplates, newValue);
      if (template) {
        return this.loadTemplate(template, "header");
      }
    }
    return [];
  }

  loadFooter(newValue: string | null): Node[] {
    if (newValue) {
      const template = this.findTemplate(this.footerTemplates, newValue);
      if (template) {
        return this.loadTemplate(template, "footer");
      }
    }
    return [];
  }

  loadRoute(newValue: string | null, slotName?: string) {
    if (newValue !== this._loadedValue) {
      this._loadedValue = newValue;
      this._loadedContentNodes = this.loadContent(newValue, slotName);
      this.loadHeader(newValue);
      this.loadFooter(newValue);
    }
  }

  endTransitions() {
    this.updateStatus(null);
  }

  updateStatus(status: "exiting" | "loading" | "entering" | null) {
    this._status = status;
    this.updateRootAttribute("status", status);
  }

  findTemplate(
    templates: HTMLTemplateElement[],
    value: string,
  ): HTMLTemplateElement | undefined {
    return templates.find((el) => el.getAttribute("value") === value);
  }

  loadTemplate(template: HTMLTemplateElement, slotName?: string): Node[] {
    const templateContent = template.content.cloneNode(true);
    return this.assignContent(templateContent, slotName);
  }

  assignContent(node: Node | Node[], slotName?: string): Node[] {
    const preserve = (n: ChildNode) =>
      n instanceof HTMLElement && n.getAttribute("value") != null;
    return this.setAssignedToSlot(node, slotName, preserve);
  }

  protected handleChanging = (e: Event) => {
    if (e instanceof CustomEvent && e.detail) {
      if (this.shadowRoot) {
        if (e.target instanceof HTMLElement) {
          const oldValue = this._loadedValue;
          const newValue = e.detail.value;
          if (newValue != null) {
            const templates = this.contentTemplates;
            const oldIndex = templates.findIndex(
              (t) => t.getAttribute("value") === oldValue,
            );
            const newIndex = templates.findIndex(
              (t) => t.getAttribute("value") === newValue,
            );
            if (newIndex >= 0) {
              this._loadingValue = newValue;
              if (this._loadedValue == null) {
                this._loadedValue =
                  templates?.[0]?.getAttribute("value") || null;
              }
              e.stopPropagation();
              const direction = getDirection(
                this.directional,
                e.detail.oldRect,
                e.detail.newRect,
                newIndex - oldIndex,
                true,
              );
              this.emit(EXIT_EVENT, { ...e.detail, key: this.key, direction });
              this.exitRoute(direction);
            }
          }
        }
      }
    }
  };

  protected handleChanged = (e: Event) => {
    if (e instanceof CustomEvent && e.detail) {
      if (this.shadowRoot) {
        if (e.target instanceof HTMLElement) {
          const newValue = e.detail.value;
          if (newValue != null) {
            const templates = this.contentTemplates;
            const newIndex = templates.findIndex(
              (t) => t.getAttribute("value") === newValue,
            );
            if (newIndex >= 0) {
              e.stopPropagation();
              if (newValue === this._loadingValue) {
                this.enterRoute(newValue);
              }
            }
          }
        }
      }
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-router": Router;
  }
  interface HTMLElementEventMap {
    exit: CustomEvent;
    enter: CustomEvent;
  }
}
