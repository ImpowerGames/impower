import SparkleElement from "../../core/sparkle-element";
import { animationsComplete } from "../../utils/animate";
import { getCssDuration } from "../../utils/getCssDuration";
import { getCssEase } from "../../utils/getCssEase";
import { getUnitlessValue } from "../../utils/getUnitlessValue";
import css from "./collapsible.css";
import html from "./collapsible.html";

const getCollapsedButtonOffset = (
  buttonWidth: number,
  iconWidth: number,
  buttonPaddingLeft: number,
  buttonPaddingRight: number
): number => {
  return buttonWidth - iconWidth - (buttonPaddingLeft + buttonPaddingRight);
};

const getCollapsedIconOffset = (
  buttonX: number,
  iconX: number,
  buttonPaddingLeft: number
): number => {
  return buttonX - iconX + buttonPaddingLeft;
};

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_COLLAPSIBLE_DEPENDENCIES = {
  "s-button": "s-button",
};

/**
 * Collapsibles can be used to collapse child buttons so that only their icon is visible.
 */
export default class Collapsible extends SparkleElement {
  static override dependencies = DEFAULT_COLLAPSIBLE_DEPENDENCIES;

  static override async define(
    tag = "s-collapsible",
    dependencies = DEFAULT_COLLAPSIBLE_DEPENDENCIES
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
  }

  override get html(): string {
    return html;
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  static override get observedAttributes() {
    return [...super.observedAttributes, "collapsed"];
  }

  /**
   * Collapses any child labels.
   */
  get collapsed(): "" | "scrolled" | null {
    return this.getStringAttribute("collapsed");
  }

  protected _buttonEl: HTMLElement | null = null;

  get buttonEl(): HTMLElement | null {
    return this._buttonEl;
  }

  get labelEl(): HTMLElement | null {
    return this.buttonEl?.querySelector<HTMLElement>(`.label`) ?? null;
  }

  get iconEl(): HTMLElement | null {
    return this.buttonEl?.querySelector<HTMLElement>(`.icon`) ?? null;
  }

  get sentinelEl(): HTMLElement | null {
    return this.getElementByClass("sentinel");
  }

  protected _buttonX: number = 0;

  protected _buttonWidth: number = 0;

  protected _buttonPaddingLeft: number = 0;

  protected _buttonPaddingRight: number = 0;

  protected _iconX: number = 0;

  protected _iconWidth: number = 0;

  protected _state: "collapsing" | "collapsed" | "expanding" | "expanded" =
    "expanded";

  protected _intersectionObserver?: IntersectionObserver;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === "collapsed") {
      this.update(true);
      if (newValue === "scrolled") {
        const sentinelEl = this.sentinelEl;
        if (sentinelEl) {
          this._intersectionObserver?.disconnect();
          this._intersectionObserver?.observe(sentinelEl);
        }
      }
    }
  }

  protected override onConnected(): void {
    this._intersectionObserver = new IntersectionObserver(this.handleScroll);
  }
  protected override onParsed(): void {
    this.update(false);
    if (this.collapsed === "scrolled") {
      const sentinelEl = this.sentinelEl;
      if (sentinelEl) {
        this._intersectionObserver?.disconnect();
        this._intersectionObserver?.observe(sentinelEl);
      }
    }
    const buttonEl = this.buttonEl;
    const iconEl = this.iconEl;
    const labelEl = this.labelEl;
    if (buttonEl && iconEl && labelEl) {
      buttonEl.style.setProperty("min-width", null);
      buttonEl.style.setProperty("max-width", null);
      buttonEl.style.setProperty("transform", null);
      buttonEl.style.setProperty("margin", null);
      iconEl.style.setProperty("transform", null);
      const buttonRect = buttonEl.getBoundingClientRect();
      const iconRect = iconEl.getBoundingClientRect();
      const buttonX = buttonRect.x;
      const buttonWidth = buttonRect.width;
      const buttonPaddingLeft = buttonEl
        ? getUnitlessValue(window.getComputedStyle(buttonEl).paddingLeft, 0)
        : 0;
      const buttonPaddingRight = buttonEl
        ? getUnitlessValue(window.getComputedStyle(buttonEl).paddingRight, 0)
        : 0;
      const iconX = iconRect.x;
      const iconWidth = iconRect.width;
      this._buttonX = buttonX;
      this._buttonWidth = buttonWidth;
      this._buttonPaddingLeft = buttonPaddingLeft;
      this._buttonPaddingRight = buttonPaddingRight;
      this._iconX = iconX;
      this._iconWidth = iconWidth;
    }
  }

  protected override onDisconnected(): void {
    this._intersectionObserver?.disconnect();
  }

  handleScroll = (entries: IntersectionObserverEntry[]): void => {
    const entry = entries?.[0];
    if (
      entry &&
      (entry.boundingClientRect.width > 0 ||
        entry.boundingClientRect.height > 0)
    ) {
      const sentinelOnScreen =
        entry.isIntersecting || entry.intersectionRatio > 0;
      if (sentinelOnScreen) {
        this.expand(true);
      } else {
        this.collapse(true);
      }
    }
  };

  protected update(animated: boolean): void {
    if (this.collapsed === "") {
      this.collapse(animated);
    } else {
      this.expand(animated);
    }
  }

  updateTransition(animated: boolean): void {
    const buttonEl = this.buttonEl;
    const iconEl = this.iconEl;
    const labelEl = this.labelEl;
    if (buttonEl && iconEl && labelEl) {
      if (animated) {
        const transitionProperty = `transform, opacity`;
        const duration = getCssDuration(this.getAttribute("duration"), "150ms");
        const ease = getCssEase(this.getAttribute("ease"), "ease");
        buttonEl.style.transitionProperty = transitionProperty;
        buttonEl.style.transitionDuration = duration;
        buttonEl.style.transitionTimingFunction = ease;
        iconEl.style.transitionProperty = transitionProperty;
        iconEl.style.transitionDuration = duration;
        iconEl.style.transitionTimingFunction = ease;
        labelEl.style.transitionProperty = transitionProperty;
        labelEl.style.transitionDuration = duration;
        labelEl.style.transitionTimingFunction = ease;
      } else {
        buttonEl.style.transitionProperty = "none";
        iconEl.style.transitionProperty = "none";
        labelEl.style.transitionProperty = "none";
      }
    }
  }

  loadBorderStyle(targetEl: HTMLElement): void {
    targetEl.style.setProperty("margin", null);
    targetEl.style.setProperty("outline", null);
    targetEl.style.setProperty("border", null);
    targetEl.style.setProperty("box-shadow", null);
    targetEl.style.setProperty("filter", null);

    const overflowX = "clip";
    const overflowY = "clip";
    const borderRadius = window.getComputedStyle(targetEl).borderRadius;
    const margin = window.getComputedStyle(targetEl).margin;
    const outline = window.getComputedStyle(targetEl).outline;
    const border = window.getComputedStyle(targetEl).border;
    const boxShadow = window.getComputedStyle(targetEl).boxShadow;
    const filter = window.getComputedStyle(targetEl).filter;

    this.root.style.setProperty("overflow-x", overflowX);
    this.root.style.setProperty("overflow-y", overflowY);
    this.root.style.setProperty("border-radius", borderRadius);
    this.root.style.setProperty("margin", margin);
    this.root.style.setProperty("outline", outline);
    this.root.style.setProperty("border", border);
    this.root.style.setProperty("box-shadow", boxShadow);
    this.root.style.setProperty("filter", filter);

    targetEl.style.setProperty("overflow-x", "clip");
    targetEl.style.setProperty("overflow-y", "clip");
    targetEl.style.setProperty("margin", "0");
    targetEl.style.setProperty("outline", "none");
    targetEl.style.setProperty("border", "none");
    targetEl.style.setProperty("box-shadow", "none");
    targetEl.style.setProperty("filter", "none");
  }

  unloadBorderStyle(targetEl: HTMLElement): void {
    this.root.style.setProperty("overflow-x", null);
    this.root.style.setProperty("overflow-y", null);
    this.root.style.setProperty("border-radius", null);
    this.root.style.setProperty("margin", null);
    this.root.style.setProperty("outline", null);
    this.root.style.setProperty("border", null);
    this.root.style.setProperty("box-shadow", null);
    this.root.style.setProperty("filter", null);

    targetEl.style.setProperty("overflow-x", null);
    targetEl.style.setProperty("overflow-y", null);
    targetEl.style.setProperty("margin", null);
    targetEl.style.setProperty("outline", null);
    targetEl.style.setProperty("border", null);
    targetEl.style.setProperty("box-shadow", null);
    targetEl.style.setProperty("filter", null);
  }

  loadCollapsedLayout(): void {
    const buttonEl = this.buttonEl;
    const iconEl = this.iconEl;
    const labelEl = this.labelEl;
    const collapsedButtonWidth =
      this._iconWidth + this._buttonPaddingLeft + this._buttonPaddingRight;
    if (buttonEl && iconEl && labelEl) {
      buttonEl.style.transitionProperty = "none";
      iconEl.style.transitionProperty = "none";
      labelEl.style.transitionProperty = "none";
      buttonEl.style.setProperty("min-width", `${collapsedButtonWidth}px`);
      buttonEl.style.setProperty("max-width", `${collapsedButtonWidth}px`);
      iconEl.style.setProperty("transform", `translateX(${0})`);
      labelEl.hidden = true;
    }
  }

  unloadCollapsedLayout(): void {
    const buttonEl = this.buttonEl;
    const iconEl = this.iconEl;
    const labelEl = this.labelEl;
    if (buttonEl && iconEl && labelEl) {
      const buttonTranslateX = getCollapsedButtonOffset(
        this._buttonWidth,
        this._iconWidth,
        this._buttonPaddingLeft,
        this._buttonPaddingRight
      );
      const iconTranslateX = getCollapsedIconOffset(
        this._buttonX,
        this._iconX,
        this._buttonPaddingLeft
      );
      buttonEl.style.transitionProperty = "none";
      iconEl.style.transitionProperty = "none";
      labelEl.style.transitionProperty = "none";
      buttonEl.style.setProperty("min-width", null);
      buttonEl.style.setProperty("max-width", null);
      buttonEl.style.setProperty(
        "transform",
        `translateX(${buttonTranslateX}px)`
      );
      iconEl.style.setProperty("transform", `translateX(${iconTranslateX}px)`);
      labelEl.hidden = false;
    }
  }

  protected async collapse(animated: boolean): Promise<void> {
    if (this._state === "collapsing" || this._state === "collapsed") {
      return;
    }
    this._state = "collapsing";

    this.updateTransition(animated);

    if (animated) {
      const buttonEl = this.buttonEl;
      const iconEl = this.iconEl;
      const labelEl = this.labelEl;
      if (buttonEl && iconEl && labelEl) {
        const buttonTranslateX = getCollapsedButtonOffset(
          this._buttonWidth,
          this._iconWidth,
          this._buttonPaddingLeft,
          this._buttonPaddingRight
        );
        const iconTranslateX = getCollapsedIconOffset(
          this._buttonX,
          this._iconX,
          this._buttonPaddingLeft
        );
        buttonEl.style.transform = `translateX(${buttonTranslateX}px)`;
        iconEl.style.transform = `translateX(${iconTranslateX}px)`;
        labelEl.hidden = false;
        labelEl.style.opacity = "0";

        this.loadBorderStyle(buttonEl);

        await animationsComplete(buttonEl);
        if (this._state !== "collapsing") {
          return;
        }

        this.unloadBorderStyle(buttonEl);

        this.loadCollapsedLayout();
      }
    }
    this._state = "collapsed";
  }

  protected async expand(animated: boolean): Promise<void> {
    if (this._state === "expanding" || this._state === "expanded") {
      return;
    }
    this._state = "expanding";

    this.unloadCollapsedLayout();

    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    if (this._state !== "expanding") {
      return;
    }

    this.updateTransition(animated);
    if (animated) {
      const buttonEl = this.buttonEl;
      const labelEl = this.labelEl;
      const iconEl = this.iconEl;
      if (buttonEl && iconEl && labelEl) {
        buttonEl.style.transform = `translateX(0)`;
        iconEl.style.transform = `translateX(0)`;
        labelEl.style.opacity = "1";

        this.loadBorderStyle(buttonEl);

        await animationsComplete(buttonEl);
        if (this._state !== "expanding") {
          return;
        }

        this.unloadBorderStyle(buttonEl);
      }
    }
    this._state = "expanded";
  }

  protected override onContentAssigned(slot: HTMLSlotElement): void {
    const elements = slot?.assignedElements?.();
    const buttons = elements.filter(
      (el) => el.tagName.toLowerCase() === Collapsible.dependencies["s-button"]
    );
    const targetEl = buttons?.[0]?.shadowRoot?.firstElementChild as HTMLElement;
    if (this._buttonEl !== targetEl) {
      this._buttonEl = targetEl;
      this.update(false);
    }
  }

  override focus(options?: FocusOptions): void {
    const buttonEl = this._buttonEl;
    if (buttonEl) {
      buttonEl.focus(options);
    }
  }

  override blur(): void {
    const buttonEl = this._buttonEl;
    if (buttonEl) {
      buttonEl.blur();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-collapsible": Collapsible;
  }
}
