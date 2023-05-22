import getCssAnimation from "sparkle-style-transformer/utils/getCssAnimation.js";
import getCssPosition from "sparkle-style-transformer/utils/getCssPosition.js";
import getCssSize from "sparkle-style-transformer/utils/getCssSize.js";
import SparkleElement from "../../core/sparkle-element";
import { AnimationName } from "../../types/animationName";
import { Properties } from "../../types/properties";
import { animationsComplete } from "../../utils/animationsComplete";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getDirection } from "../../utils/getDirection";
import { getKeys } from "../../utils/getKeys";
import css from "./router.css";
import html from "./router.html";

const styles = new CSSStyleSheet();

export const DEFAULT_TRANSFORMERS = {
  "header-enter": getCssAnimation,
  "header-exit": getCssAnimation,
  "footer-enter": getCssAnimation,
  "footer-exit": getCssAnimation,
  "header-position": getCssPosition,
  "footer-position": getCssPosition,
  "header-inset": getCssSize,
  "footer-inset": getCssSize,
};

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  "enter-event",
  "exit-event",
  "swipeable",
  "directional",
  ...getKeys(DEFAULT_TRANSFORMERS),
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

  override get transformers() {
    return { ...super.transformers, ...DEFAULT_TRANSFORMERS };
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

  /**
   * Specifies a `position` for the header.
   */
  get headerPosition(): "" | AnimationName | string | null {
    return this.getStringAttribute(Router.attributes.headerPosition);
  }
  set headerPosition(value) {
    this.setStringAttribute(Router.attributes.headerPosition, value);
  }

  /**
   * Specifies a `inset` for the header.
   */
  get headerInset(): "" | AnimationName | string | null {
    return this.getStringAttribute(Router.attributes.headerInset);
  }
  set headerInset(value) {
    this.setStringAttribute(Router.attributes.headerInset, value);
  }

  /**
   * Specifies a header exit `animation` for this element.
   */
  get headerExit(): "" | AnimationName | string | null {
    return this.getStringAttribute(Router.attributes.headerExit);
  }
  set headerExit(value) {
    this.setStringAttribute(Router.attributes.headerExit, value);
  }

  /**
   * Specifies a header enter `animation` for this element.
   */
  get headerEnter(): "" | AnimationName | string | null {
    return this.getStringAttribute(Router.attributes.headerEnter);
  }
  set headerEnter(value) {
    this.setStringAttribute(Router.attributes.headerEnter, value);
  }

  /**
   * Specifies a `position` for the footer.
   */
  get footerPosition(): "" | AnimationName | string | null {
    return this.getStringAttribute(Router.attributes.footerPosition);
  }
  set footerPosition(value) {
    this.setStringAttribute(Router.attributes.footerPosition, value);
  }

  /**
   * Specifies a `inset` for the footer.
   */
  get footerInset(): "" | AnimationName | string | null {
    return this.getStringAttribute(Router.attributes.footerInset);
  }
  set footerInset(value) {
    this.setStringAttribute(Router.attributes.footerInset, value);
  }

  /**
   * Specifies a footer exit `animation` for this element.
   */
  get footerExit(): "" | AnimationName | string | null {
    return this.getStringAttribute(Router.attributes.footerExit);
  }
  set footerExit(value) {
    this.setStringAttribute(Router.attributes.footerExit, value);
  }

  /**
   * Specifies a footer enter `animation` for this element.
   */
  get footerEnter(): "" | AnimationName | string | null {
    return this.getStringAttribute(Router.attributes.footerEnter);
  }
  set footerEnter(value) {
    this.setStringAttribute(Router.attributes.footerEnter, value);
  }

  get contentEl(): HTMLElement | null {
    return this.getElementByClass("content");
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

  get headerEl(): HTMLElement | null {
    return this.getElementByClass("header");
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

  get footerEl(): HTMLElement | null {
    return this.getElementByClass("footer");
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
    this.setupHeaderAnimations();
    this.setupFooterAnimations();
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

  setupHeaderAnimations(): void {
    if (this.headerTemplates.length > 0) {
      this.headerEl?.classList.add("transition");
    } else {
      this.headerEl?.classList.remove("transition");
    }
  }

  setupFooterAnimations(): void {
    if (this.footerTemplates.length > 0) {
      this.footerEl?.classList.add("transition");
    } else {
      this.footerEl?.classList.remove("transition");
    }
  }

  async exitRoute(): Promise<void> {
    this.updateRootClass("exiting", true);
    await animationsComplete(this.contentEl, this.footerEl);
  }

  async enterRoute(newValue: string): Promise<void> {
    if (newValue) {
      await animationsComplete(this.contentEl, this.footerEl);
      this.loadRoute(newValue);
      this.updateRootClass("exiting", false);
      this.updateRootClass("entering", true);
      await animationsComplete(this.contentEl, this.footerEl);
      this.updateRootClass("entering", false);
    }
  }

  findTemplate(
    templates: HTMLTemplateElement[],
    value: string
  ): HTMLTemplateElement | undefined {
    return templates.find((el) => el.getAttribute("value") === value);
  }

  async loadTemplate(
    template: HTMLTemplateElement,
    slotName?: string
  ): Promise<void> {
    const preserve = (n: ChildNode) =>
      n instanceof HTMLElement && n.getAttribute("value") != null;
    const templateContent = template.content.cloneNode(true);
    this.setAssignedToSlot(templateContent, slotName, preserve);
  }

  loadRoute(newValue: string | null): void {
    if (newValue !== this._loadedValue) {
      this._loadedValue = newValue;
      if (newValue) {
        const contentTemplate = this.findTemplate(
          this.contentTemplates,
          newValue
        );
        if (contentTemplate) {
          this.loadTemplate(contentTemplate);
        }
        const footerTemplate = this.findTemplate(
          this.footerTemplates,
          newValue
        );
        if (footerTemplate) {
          this.loadTemplate(footerTemplate, "footer");
        }
      }
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
