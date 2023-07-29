import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import getCssAnimation from "../../../../sparkle-style-transformer/src/utils/getCssAnimation";
import SparkleElement from "../../core/sparkle-element";
import { animationsComplete } from "../../utils/animationsComplete";
import { cancelAnimations } from "../../utils/cancelAnimations";
import { getDirection } from "../../utils/getDirection";
import { reverseAnimation } from "../../utils/reverseAnimation";
import component from "./_router";

const EXIT_EVENT = "exit";
const ENTER_EVENT = "enter";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap([
    "key",
    "active",
    "enter-event",
    "exit-event",
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
  static override tagName = "s-router";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  override transformCss(css: string) {
    return Router.augmentCss(css);
  }

  /**
   * The unique key that identifies this router.
   */
  get key(): string | null {
    return this.getStringAttribute(Router.attributes.key);
  }
  set key(value) {
    this.setStringAttribute(Router.attributes.key, value);
  }

  /**
   * The value of the active route.
   */
  get active(): string | null {
    return this.getStringAttribute(Router.attributes.active);
  }
  set active(value) {
    this.setStringAttribute(Router.attributes.active, value);
  }

  /**
   * The event to listen for that causes the current route to exit.
   *
   * Defaults to `changing`
   */
  get exitEvent(): "changing" {
    return this.getStringAttribute(Router.attributes.exitEvent) || "changing";
  }
  set exitEvent(value) {
    this.setStringAttribute(Router.attributes.exitEvent, value);
  }

  /**
   * The event to listen for that causes the new route to enter.
   *
   * Defaults to `changed`
   */
  get enterEvent(): "changed" {
    return this.getStringAttribute(Router.attributes.enterEvent) || "changed";
  }
  set enterEvent(value) {
    this.setStringAttribute(Router.attributes.enterEvent, value);
  }

  /**
   * Determines if the enter and exit animations should be direction-dependent
   *
   * If not provided a value, defaults to `x`.
   */
  get directional(): "x" | "y" | "z" | null {
    return this.getStringAttribute(Router.attributes.directional);
  }
  set directional(value) {
    this.setStringAttribute(Router.attributes.directional, value);
  }

  /**
   * Determines when the exiting panel should be unmounted from the dom
   *
   * Defaults to `on-exit`.
   */
  get unmount(): "on-exit" | "on-enter" | "never" | null {
    return this.getStringAttribute(Router.attributes.unmount);
  }
  set unmount(value) {
    this.setStringAttribute(Router.attributes.unmount, value);
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
    return this.getStringAttribute(Router.attributes.swipeable);
  }
  set swipeable(value) {
    this.setStringAttribute(Router.attributes.swipeable, value);
  }

  get oldFadeEl(): HTMLElement {
    return this.getElementByClass("old-fade") as HTMLElement;
  }

  get oldTransformEl(): HTMLElement {
    return this.getElementByClass("old-transform") as HTMLElement;
  }

  get newFadeEl(): HTMLElement {
    return this.getElementByClass("new-fade") as HTMLElement;
  }

  get newTransformEl(): HTMLElement {
    return this.getElementByClass("new-transform") as HTMLElement;
  }

  get exitFadeEl(): HTMLElement {
    return this.oldFadeEl;
  }

  get exitTransformEl(): HTMLElement {
    return this.oldTransformEl;
  }

  get enterFadeEl(): HTMLElement {
    return this.unmount === "on-enter" ? this.newFadeEl : this.oldFadeEl;
  }

  get enterTransformEl(): HTMLElement {
    return this.unmount === "on-enter"
      ? this.newTransformEl
      : this.oldTransformEl;
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

  get headerSlot(): HTMLSlotElement | null {
    return this.getSlotByName("header");
  }

  get headerTemplatesSlot(): HTMLSlotElement | null {
    return this.getSlotByName("header-templates");
  }

  get headerTemplates(): HTMLTemplateElement[] {
    const slot = this.headerTemplatesSlot;
    if (slot) {
      const assignedElements = slot.assignedElements({ flatten: true });
      return assignedElements.filter(
        (el): el is HTMLTemplateElement => el instanceof HTMLTemplateElement
      );
    }
    return [];
  }

  get footerSlot(): HTMLSlotElement | null {
    return this.getSlotByName("footer");
  }

  get footerTemplatesSlot(): HTMLSlotElement | null {
    return this.getSlotByName("footer-templates");
  }

  get footerTemplates(): HTMLTemplateElement[] {
    const slot = this.footerTemplatesSlot;
    if (slot) {
      const assignedElements = slot.assignedElements({ flatten: true });
      return assignedElements.filter(
        (el): el is HTMLTemplateElement => el instanceof HTMLTemplateElement
      );
    }
    return [];
  }

  protected _state: "exiting" | "loading" | "entering" | null = null;

  protected _loadingValue: string | null = null;

  protected _loadedValue: string | null = null;

  protected _loadedNode: Node | null = null;

  protected _enter_transform = "";

  protected _exit_transform = "";

  protected _enter_fade = "";

  protected _exit_fade = "";

  protected override onConnected(): void {
    this.root?.addEventListener(this.exitEvent, this.handleChanging);
    this.root?.addEventListener(this.enterEvent, this.handleChanged);
    if (this.active) {
      this.loadRoute(this.active);
    }
  }

  protected override onDisconnected(): void {
    this.root?.removeEventListener(this.exitEvent, this.handleChanging);
    this.root?.removeEventListener(this.enterEvent, this.handleChanged);
  }

  cacheAnimationNames(): void {
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
    if (this._state === "entering") {
      // already entering, so reverse enter animations
      reverseAnimation(this.enterFadeEl, this._enter_fade);
      reverseAnimation(this.enterTransformEl, this._enter_transform);
    } else {
      const directionSuffix = direction ? `-${direction}` : "-zoom";
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
      const targetSlotName =
        this.unmount === "on-enter" ? "new-content" : undefined;
      this.loadRoute(newValue, targetSlotName);
      this.active = newValue;
      this.root.removeAttribute("mounting");
      this.emit(ENTER_EVENT, { key: this.key, value: newValue });
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

  playExitTransition(): void {
    this.updateState("exiting");
  }

  playEnterTransition(): void {
    this.updateState("entering");
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

  loadRoute(newValue: string | null, slotName?: string): void {
    if (newValue !== this._loadedValue) {
      this._loadedValue = newValue;
      this._loadedNode = this.loadContent(newValue, slotName);
      this.loadHeader(newValue);
      this.loadFooter(newValue);
    }
  }

  endTransitions(): void {
    this.updateState(null);
  }

  updateState(state: "exiting" | "loading" | "entering" | null): void {
    this._state = state;
    this.updateRootAttribute("state", state);
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

  protected handleChanging = (e: Event): void => {
    if (e instanceof CustomEvent && e.detail) {
      if (this.shadowRoot) {
        if (e.target instanceof HTMLElement) {
          const newValue = e.detail.value;
          if (newValue != null) {
            const templates = this.contentTemplates;
            if (templates.some((t) => t.getAttribute("value") === newValue)) {
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

  protected handleChanged = (e: Event): void => {
    if (e instanceof CustomEvent && e.detail) {
      if (this.shadowRoot) {
        if (e.target instanceof HTMLElement) {
          const newValue = e.detail.value;
          if (newValue != null) {
            const templates = this.contentTemplates;
            if (templates.some((t) => t.getAttribute("value") === newValue)) {
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
