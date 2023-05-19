import getCssAnimation from "sparkle-style-transformer/utils/getCssAnimation.js";
import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { animationsComplete } from "../../utils/animate";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getDirection } from "../../utils/getDirection";
import css from "./router.css";
import html from "./router.html";

const styles = new CSSStyleSheet();

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
   * If not provided a value, defaults to `horizontal`.
   */
  get directional(): "horizontal" | "vertical" | null {
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

  get contentEl(): HTMLElement | null {
    return this.getElementByClass("content");
  }

  get templatesSlot(): HTMLSlotElement | null {
    return this.getElementByClass("templates-slot");
  }
  get templates(): HTMLTemplateElement[] {
    const contentSlot = this.contentSlot;
    if (contentSlot) {
      return contentSlot
        .assignedElements()
        .filter(
          (el): el is HTMLTemplateElement => el instanceof HTMLTemplateElement
        );
    }
    return [];
  }

  protected _loadedValue: string | null = null;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Router.attributes.exit) {
      this.setupExitAnimations(newValue);
    }
    if (name === Router.attributes.enter) {
      this.setupEnterAnimations(newValue);
    }
  }

  protected override onConnected(): void {
    this.setupExitAnimations(this.exit);
    this.setupEnterAnimations(this.enter);
    this.root?.addEventListener(this.exitEvent, this.handleChanging);
    this.root?.addEventListener(this.enterEvent, this.handleChanged);
  }

  protected override onDisconnected(): void {
    this.root?.removeEventListener(this.exitEvent, this.handleChanging);
    this.root?.removeEventListener(this.enterEvent, this.handleChanged);
  }

  setupExitAnimations(newValue: string | null): void {
    const exit = newValue || "exit";
    this.updateRootCssVariable("exit-up", getCssAnimation(exit, "-up"));
    this.updateRootCssVariable("exit-down", getCssAnimation(exit, "-down"));
    this.updateRootCssVariable("exit-left", getCssAnimation(exit, "-left"));
    this.updateRootCssVariable("exit-right", getCssAnimation(exit, "-right"));
  }

  setupEnterAnimations(newValue: string | null): void {
    const enter = newValue || "enter";
    this.updateRootCssVariable("enter-up", getCssAnimation(enter, "-up"));
    this.updateRootCssVariable("enter-down", getCssAnimation(enter, "-down"));
    this.updateRootCssVariable("enter-left", getCssAnimation(enter, "-left"));
    this.updateRootCssVariable("enter-right", getCssAnimation(enter, "-right"));
  }

  async exitRoute(): Promise<void> {
    this.updateRootClass("exiting", true);
    await animationsComplete(this.contentEl);
  }

  async exitedRoute(): Promise<void> {
    await animationsComplete(this.contentEl);
    this.updateRootClass("exiting", false);
  }

  async enterRoute(newValue: string): Promise<void> {
    if (newValue) {
      await this.exitedRoute();
      this.loadRouteTemplate(newValue);
      this.updateRootClass("entering", true);
      await animationsComplete(this.contentEl);
      this.updateRootClass("entering", false);
    }
  }

  loadRouteTemplate(newValue: string | null): void {
    if (newValue !== this._loadedValue) {
      this._loadedValue = newValue;
      const templates = this.templates;
      templates.forEach((el) => {
        const value = el.getAttribute("value");
        if (newValue === value) {
          // Load template content
          const templateContent = el.content.cloneNode(true);
          this.setAssignedToSlot(
            templateContent,
            undefined,
            (n) => n instanceof HTMLElement && n.getAttribute("value") != null
          );
          if (templateContent instanceof HTMLElement) {
            if (templateContent.getAttribute("role") == null) {
              templateContent.setAttribute("role", `tabpanel`);
            }
            if (templateContent.getAttribute("tabindex") == null) {
              templateContent.setAttribute("tabindex", "0");
            }
            if (value) {
              if (
                templateContent.getAttribute(Router.attributes.ariaLabel) ==
                null
              ) {
                templateContent.setAttribute(
                  Router.attributes.ariaLabel,
                  value
                );
              }
            }
          }
        }
      });
    }
  }

  protected handleChanging = (e: CustomEvent): void => {
    if (this.shadowRoot) {
      if (e.target instanceof HTMLElement) {
        const newValue = e.detail.value;
        if (newValue != null) {
          e.stopPropagation();
          const direction = getDirection(
            this.directional,
            e.detail.oldRect,
            e.detail.newRect,
            true
          );
          this.updateRootAttribute("direction", direction);
          this.exitRoute();
        }
      }
    }
  };

  protected handleChanged = (e: CustomEvent): void => {
    if (this.shadowRoot) {
      if (e.target instanceof HTMLElement) {
        const newValue = e.detail.value;
        if (newValue != null) {
          e.stopPropagation();
          const direction = getDirection(
            this.directional,
            e.detail.oldRect,
            e.detail.newRect,
            true
          );
          this.updateRootAttribute("direction", direction);
          this.enterRoute(newValue);
        }
      }
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-router": Router;
  }
}
