import getCssAnimation from "../../../../sparkle-style-transformer/src/utils/getCssAnimation";
import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
} from "../../core/sparkle-element";
import { animationsComplete } from "../../utils/animationsComplete";
import { cancelAnimations } from "../../utils/cancelAnimations";
import { getDirection } from "../../utils/getDirection";
import { reverseAnimation } from "../../utils/reverseAnimation";
import spec from "./_router";

const EXIT_EVENT = "exit";
const ENTER_EVENT = "enter";

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "key",
    "active",
    "enter-event",
    "exit-event",
    "event-source",
    "swipeable",
    "directional",
    "unmount",
  ]),
};

/**
 * Routers are used to lazy-load templates when their value matches an observed value.
 *
 * This element loads any child template whose value attribute matches an observed value.
 * All other children are unloaded.
 */
export default class Router
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return spec.html({
      stores: this.stores,
      context: this.context,
      state: this.state,
      props: this.props,
    });
  }

  override get css() {
    return spec.css;
  }

  override get selectors() {
    return spec.selectors;
  }

  override get ref() {
    return super.ref as RefMap<typeof this.selectors>;
  }

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  /**
   * The unique key that identifies this router.
   */
  get key(): string | null {
    return this.getStringAttribute(Router.attrs.key);
  }
  set key(value) {
    this.setStringAttribute(Router.attrs.key, value);
  }

  /**
   * The value of the active route.
   */
  get active(): string | null {
    return this.getStringAttribute(Router.attrs.active);
  }
  set active(value) {
    this.setStringAttribute(Router.attrs.active, value);
  }

  /**
   * The element to listen to.
   *
   * Defaults to `this`
   */
  get eventSource(): "this" | "window" {
    return this.getStringAttribute(Router.attrs.eventSource) || "this";
  }
  set eventSource(value) {
    this.setStringAttribute(Router.attrs.eventSource, value);
  }

  /**
   * The event to listen for that causes the current route to exit.
   *
   * Defaults to `changing`
   */
  get exitEvent(): "changing" {
    return this.getStringAttribute(Router.attrs.exitEvent) || "changing";
  }
  set exitEvent(value) {
    this.setStringAttribute(Router.attrs.exitEvent, value);
  }

  /**
   * The event to listen for that causes the new route to enter.
   *
   * Defaults to `changed`
   */
  get enterEvent(): "changed" {
    return this.getStringAttribute(Router.attrs.enterEvent) || "changed";
  }
  set enterEvent(value) {
    this.setStringAttribute(Router.attrs.enterEvent, value);
  }

  /**
   * Determines if the enter and exit animations should be direction-dependent
   *
   * If not provided a value, defaults to `x`.
   */
  get directional(): "x" | "y" | "z" | null {
    return this.getStringAttribute(Router.attrs.directional);
  }
  set directional(value) {
    this.setStringAttribute(Router.attrs.directional, value);
  }

  /**
   * Determines when the exiting panel should be unmounted from the dom
   *
   * Defaults to `on-exit`.
   */
  get unmount(): "on-exit" | "on-enter" | "never" | null {
    return this.getStringAttribute(Router.attrs.unmount);
  }
  set unmount(value) {
    this.setStringAttribute(Router.attrs.unmount, value);
  }

  /**
   * Allow panels to be swiped.
   *
   * Set to `touch` to limit swipe detection to touch devices.
   * Set to `mouse` to limit swipe detection to mouse devices.
   * Set to `pointer` to support swipe detection for any device.
   *
   * If not provided a value, defaults to `pointer`.
   */
  get swipeable(): "pointer" | "touch" | "mouse" | null {
    return this.getStringAttribute(Router.attrs.swipeable);
  }
  set swipeable(value) {
    this.setStringAttribute(Router.attrs.swipeable, value);
  }

  get exitFadeEl() {
    return this.ref.oldFade;
  }

  get exitTransformEl() {
    return this.ref.oldTransform;
  }

  get enterFadeEl() {
    return this.unmount === "on-enter" ? this.ref.newFade : this.ref.oldFade;
  }

  get enterTransformEl() {
    return this.unmount === "on-enter"
      ? this.ref.newTransform
      : this.ref.oldTransform;
  }

  get contentTemplates(): HTMLTemplateElement[] {
    const slot = this.contentSlot;
    if (slot) {
      return slot
        .assignedElements()
        .filter(
          (el): el is HTMLTemplateElement => el instanceof HTMLTemplateElement
        );
    }
    return [];
  }

  get headerTemplates(): HTMLTemplateElement[] {
    const slot = this.ref.headerTemplatesSlot;
    if (slot) {
      const assignedElements = slot.assignedElements({ flatten: true });
      return assignedElements.filter(
        (el): el is HTMLTemplateElement => el instanceof HTMLTemplateElement
      );
    }
    return [];
  }

  get footerTemplates(): HTMLTemplateElement[] {
    const slot = this.ref.footerTemplatesSlot;
    if (slot) {
      const assignedElements = slot.assignedElements({ flatten: true });
      return assignedElements.filter(
        (el): el is HTMLTemplateElement => el instanceof HTMLTemplateElement
      );
    }
    return [];
  }

  protected _status: "exiting" | "loading" | "entering" | null = null;

  protected _loadingValue: string | null = null;

  protected _loadedValue: string | null = null;

  protected _loadedNode: Node | null = null;

  protected _enter_transform = "";

  protected _exit_transform = "";

  protected _enter_fade = "";

  protected _exit_fade = "";

  override onConnected() {
    const eventSourceEl = this.eventSource === "window" ? window : this;
    eventSourceEl.addEventListener(this.exitEvent, this.handleChanging);
    eventSourceEl.addEventListener(this.enterEvent, this.handleChanged);
    if (this.active) {
      this.loadRoute(this.active);
    }
  }

  override onDisconnected() {
    const eventSourceEl = this.eventSource === "window" ? window : this;
    eventSourceEl.removeEventListener(this.exitEvent, this.handleChanging);
    eventSourceEl.removeEventListener(this.enterEvent, this.handleChanged);
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
      if (this.unmount === "on-enter" && this._loadedNode) {
        this.assignContent(this._loadedNode);
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

  loadContent(newValue: string | null, slotName?: string): Node | null {
    if (newValue) {
      const template = this.findTemplate(this.contentTemplates, newValue);
      if (template) {
        return this.loadTemplate(template, slotName);
      }
    }
    return null;
  }

  loadHeader(newValue: string | null): Node | null {
    if (newValue) {
      const template = this.findTemplate(this.headerTemplates, newValue);
      if (template) {
        return this.loadTemplate(template, "header");
      }
    }
    return null;
  }

  loadFooter(newValue: string | null): Node | null {
    if (newValue) {
      const template = this.findTemplate(this.footerTemplates, newValue);
      if (template) {
        return this.loadTemplate(template, "footer");
      }
    }
    return null;
  }

  loadRoute(newValue: string | null, slotName?: string) {
    if (newValue !== this._loadedValue) {
      this._loadedValue = newValue;
      this._loadedNode = this.loadContent(newValue, slotName);
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
    value: string
  ): HTMLTemplateElement | undefined {
    return templates.find((el) => el.getAttribute("value") === value);
  }

  loadTemplate(template: HTMLTemplateElement, slotName?: string): Node | null {
    const templateContent = template.content.cloneNode(true);
    return this.assignContent(templateContent, slotName);
  }

  assignContent(node: Node, slotName?: string): Node | null {
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
              (t) => t.getAttribute("value") === oldValue
            );
            const newIndex = templates.findIndex(
              (t) => t.getAttribute("value") === newValue
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
                true
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
              (t) => t.getAttribute("value") === newValue
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
