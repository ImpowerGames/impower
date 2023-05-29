import getCssAnimation from "../../../../sparkle-style-transformer/src/utils/getCssAnimation";
import type SparkleEvent from "../../core/SparkleEvent";
import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { animationsComplete } from "../../utils/animationsComplete";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getDirection } from "../../utils/getDirection";
import { restartAnimations } from "../../utils/restartAnimations";
import { reverseAnimations } from "../../utils/reverseAnimations";
import css from "./router.css";
import html from "./router.html";

const styles = new CSSStyleSheet();

const EXIT_EVENT = "exit";
const ENTER_EVENT = "enter";

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  "enter-event",
  "exit-event",
  "swipeable",
  "directional",
]);

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

  override get html() {
    return html;
  }

  override get styles() {
    styles.replaceSync(Router.augmentCss(css));
    return [styles];
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

  get exitFadeEl(): HTMLElement {
    return this.getElementByClass("exit-fade") as HTMLElement;
  }

  get exitTransformEl(): HTMLElement {
    return this.getElementByClass("exit-transform") as HTMLElement;
  }

  get enterFadeEl(): HTMLElement {
    return this.getElementByClass("enter-fade") as HTMLElement;
  }

  get enterTransformEl(): HTMLElement {
    return this.getElementByClass("enter-transform") as HTMLElement;
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
    return this.getElementByClass("header-slot");
  }

  get headerTemplates(): HTMLTemplateElement[] {
    const slot = this.headerSlot;
    if (slot) {
      const assignedElements = slot.assignedElements({ flatten: true });
      return assignedElements.filter(
        (el): el is HTMLTemplateElement => el instanceof HTMLTemplateElement
      );
    }
    return [];
  }

  get footerSlot(): HTMLSlotElement | null {
    return this.getElementByClass("footer-slot");
  }

  get footerTemplates(): HTMLTemplateElement[] {
    const slot = this.footerSlot;
    if (slot) {
      const assignedElements = slot.assignedElements({ flatten: true });
      return assignedElements.filter(
        (el): el is HTMLTemplateElement => el instanceof HTMLTemplateElement
      );
    }
    return [];
  }

  protected _state: "entering" | "exiting" | null = null;

  protected _loadingValue: string | null = null;

  protected _loadedValue: string | null = null;

  protected _loadedNode: Node | null = null;

  protected override onConnected(): void {
    this.root?.addEventListener(this.exitEvent, this.handleChanging);
    this.root?.addEventListener(this.enterEvent, this.handleChanged);
  }

  protected override onDisconnected(): void {
    this.root?.removeEventListener(this.exitEvent, this.handleChanging);
    this.root?.removeEventListener(this.enterEvent, this.handleChanged);
  }

  async exitRoute(direction: string | null): Promise<void> {
    if (this._state === "entering") {
      // already entering, so reverse enter animations
      if (this.directional != null) {
        await reverseAnimations(this.enterFadeEl);
      } else {
        await reverseAnimations(this.enterFadeEl, this.enterTransformEl);
      }
    } else {
      const directionSuffix = direction ? `-${direction}` : "-zoom";
      this.updateRootCssVariable(
        "enter",
        getCssAnimation(this.enter, directionSuffix)
      );
      this.updateRootCssVariable(
        "exit",
        getCssAnimation(this.exit, directionSuffix)
      );
      this.playExitTransition(this._state !== "exiting");
    }
  }

  async enterRoute(newValue: string): Promise<void> {
    if (this._loadedValue === newValue) {
      await animationsComplete(this.enterFadeEl, this.enterTransformEl);
      if (this.interrupted(newValue)) {
        return;
      }
      // already loaded, so reverse exit animations
      await reverseAnimations(this.exitFadeEl, this.exitTransformEl);
      if (this.interrupted(newValue)) {
        return;
      }
    } else {
      await animationsComplete(
        this.exitFadeEl,
        this.enterFadeEl,
        this.enterTransformEl
      );
      if (this.interrupted(newValue)) {
        return;
      }
      this.loadRoute(newValue);
      this.playEnterTransition(true);
      this.emit(ENTER_EVENT);
      await animationsComplete(this.enterFadeEl, this.enterTransformEl);
      if (this.interrupted(newValue)) {
        return;
      }
      if (this._loadedNode) {
        this.assignContent(this._loadedNode);
      }
    }
    this.endTransitions();
  }

  interrupted(newValue: string): boolean {
    return this._loadingValue !== newValue;
  }

  playExitTransition(restart: boolean): void {
    this.updateState("exiting");
    if (restart) {
      restartAnimations(this.exitFadeEl, this.exitTransformEl);
    }
  }

  playEnterTransition(restart: boolean): void {
    this.updateState("entering");
    if (restart) {
      restartAnimations(this.enterFadeEl, this.enterTransformEl);
    }
  }

  loadContent(newValue: string | null): Node | null {
    if (newValue) {
      const template = this.findTemplate(this.contentTemplates, newValue);
      if (template) {
        return this.loadTemplate(template, "enter-content");
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

  loadRoute(newValue: string | null): void {
    if (newValue !== this._loadedValue) {
      this._loadedValue = newValue;
      this._loadedNode = this.loadContent(newValue);
      this.loadFooter(newValue);
    }
  }

  endTransitions(): void {
    this.updateState(null);
  }

  updateState(state: "entering" | "exiting" | null): void {
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
            this._loadingValue = newValue;
            if (this._loadedValue == null) {
              this._loadedValue =
                this.contentTemplates?.[0]?.getAttribute("value") || null;
            }
            e.stopPropagation();
            const direction = getDirection(
              this.directional,
              e.detail.oldRect,
              e.detail.newRect,
              true
            );
            this.emit(EXIT_EVENT, { ...e.detail, direction });
            this.exitRoute(direction);
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
            e.stopPropagation();
            if (newValue === this._loadingValue) {
              this.enterRoute(newValue);
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
    exit: SparkleEvent;
    enter: SparkleEvent;
  }
}
