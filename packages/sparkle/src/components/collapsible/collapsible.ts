import {
  getCssDuration,
  getCssEase,
} from "../../../../sparkle-style-transformer/src/utils/transformers";
import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getUnitlessValue from "../../../../spec-component/src/utils/getUnitlessValue";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
} from "../../core/sparkle-element";
import { animationsComplete } from "../../utils/animationsComplete";
import { getScrollableParent } from "../../utils/getScrollableParent";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import spec from "./_collapsible";

const getCollapsedButtonWidth = (
  iconWidth: number,
  buttonPaddingLeft: number,
  buttonPaddingRight: number
): number => {
  return iconWidth - iconWidth / 2 + buttonPaddingLeft + buttonPaddingRight;
};

const getCollapsedIconOffset = (
  buttonX: number,
  iconX: number,
  iconWidth: number,
  buttonPaddingLeft: number
): number => {
  return buttonX - iconX - iconWidth / 4 + buttonPaddingLeft;
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap(["collapsed", "sentinel"]),
};

/**
 * Collapsibles can be used to collapse child buttons so that only their icon is visible.
 */
export default class Collapsible
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return spec.html({
      graphics: this.graphics,
      stores: this.stores,
      context: this.context,
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
   * Collapses any child labels.
   */
  get collapsed(): "" | "scrolled" | null {
    return this.getStringAttribute(Collapsible.attrs.collapsed);
  }
  set collapsed(value) {
    this.setStringAttribute(Collapsible.attrs.collapsed, value);
  }

  /**
   * Id of sentinel that is observed to determine if the parent has scrolled.
   *
   * Defaults to `scroll-sentinel`.
   */
  get sentinel(): string {
    return (
      this.getStringAttribute(Collapsible.attrs.sentinel) || "scroll-sentinel"
    );
  }
  set sentinel(value) {
    this.setStringAttribute(Collapsible.attrs.sentinel, value);
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

  protected _sentinelEl: HTMLElement | null = null;
  get sentinelEl(): HTMLElement | null {
    if (!this._sentinelEl) {
      const scrollParent =
        this.closestAncestor(`:is([overflow-x], [overflow-y])`)?.shadowRoot
          ?.firstElementChild || getScrollableParent(this.root);
      if (scrollParent) {
        const sentinelId = this.sentinel;
        const sentinel = scrollParent.querySelector(`#${sentinelId}`);
        if (sentinel instanceof HTMLElement) {
          this._sentinelEl = sentinel;
        } else {
          const sentinel = document.createElement("div");
          sentinel.id = sentinelId;
          sentinel.inert = true;
          scrollParent.prepend(sentinel);
          this._sentinelEl = sentinel;
        }
      }
    }
    return this._sentinelEl;
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

  protected _resizeObserver?: ResizeObserver;

  protected _cachedCSSVariables: Record<string, string> = {};

  override onAttributeChanged(name: string, newValue: string) {
    if (name === Collapsible.attrs.collapsed) {
      this.updateState(true);
      if (newValue === "scrolled") {
        const sentinelEl = this.sentinelEl;
        if (sentinelEl) {
          this._intersectionObserver?.disconnect();
          this._intersectionObserver?.observe(sentinelEl);
        }
      }
    }
  }

  override onConnected() {
    this._intersectionObserver = new IntersectionObserver(this.handleScroll);
    this._resizeObserver = new ResizeObserver(this.handleResize);
  }

  override onParsed() {
    this.measure().then(() => this.updateState(false));
    if (this.collapsed === "scrolled") {
      const sentinelEl = this.sentinelEl;
      if (sentinelEl) {
        this._intersectionObserver?.disconnect();
        this._intersectionObserver?.observe(sentinelEl);
      }
    }
    if (this._resizeObserver) {
      this._resizeObserver?.disconnect();
      this._resizeObserver?.observe(this.root);
    }
  }

  override onDisconnected() {
    this._intersectionObserver?.disconnect();
    this._resizeObserver?.disconnect();
  }

  async measure(): Promise<void> {
    await nextAnimationFrame();
    const buttonEl = this.buttonEl;
    const iconEl = this.iconEl;
    const labelEl = this.labelEl;
    if (buttonEl && iconEl && labelEl) {
      this.root.style.setProperty("overflow-x", null);
      this.root.style.setProperty("overflow-y", null);
      this.root.style.setProperty("margin", null);
      this.root.style.setProperty("border-width", null);
      buttonEl.style.setProperty("min-width", null);
      buttonEl.style.setProperty("max-width", null);
      buttonEl.style.setProperty("align-self", null);
      buttonEl.style.setProperty("transform", null);
      buttonEl.style.setProperty("margin", null);
      iconEl.style.setProperty("max-width", null);
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
      this._cachedCSSVariables["--overflow-x"] =
        buttonEl.style.getPropertyValue("--overflow-x");
      this._cachedCSSVariables["--overflow-y"] =
        buttonEl.style.getPropertyValue("--overflow-y");
      this._cachedCSSVariables["--border-width"] =
        buttonEl.style.getPropertyValue("--border-width");
      this._cachedCSSVariables["--margin"] =
        buttonEl.style.getPropertyValue("--margin");
      this._cachedCSSVariables["--filter"] =
        buttonEl.style.getPropertyValue("--filter");
      this._cachedCSSVariables["--shadow"] =
        buttonEl.style.getPropertyValue("--shadow");
    }
  }

  protected updateState(animated: boolean) {
    if (this.collapsed === "") {
      this.collapse(animated);
    } else {
      this.expand(animated);
    }
  }

  updateTransition(animated: boolean) {
    const buttonEl = this.buttonEl;
    const iconEl = this.iconEl;
    const labelEl = this.labelEl;
    if (buttonEl && iconEl && labelEl) {
      if (animated) {
        const transitionProperty = `transform, opacity`;
        const duration = getCssDuration(
          this.getAttribute("duration"),
          this.duration || "150ms"
        );
        const ease = getCssEase(this.ease, "ease-out");
        buttonEl.style.setProperty("transition-property", transitionProperty);
        buttonEl.style.setProperty("transition-duration", duration);
        buttonEl.style.setProperty("transition-timing-function", ease);
        iconEl.style.setProperty("transition-property", transitionProperty);
        iconEl.style.setProperty("transition-duration", duration);
        iconEl.style.setProperty("transition-timing-function", ease);
        labelEl.style.setProperty("transition-property", transitionProperty);
        labelEl.style.setProperty("transition-duration", duration);
        labelEl.style.setProperty("transition-timing-function", ease);
      } else {
        buttonEl.style.setProperty("transition-property", "none");
        iconEl.style.setProperty("transition-property", "none");
        labelEl.style.setProperty("transition-property", "none");
      }
    }
  }

  loadBorderStyle(buttonEl: HTMLElement) {
    buttonEl.style.setProperty("margin", null);
    buttonEl.style.setProperty("outline", null);
    buttonEl.style.setProperty("border-width", null);
    buttonEl.style.setProperty("box-shadow", null);
    buttonEl.style.setProperty("filter", null);

    const overflowX = "clip";
    const overflowY = "clip";
    const borderRadius = window.getComputedStyle(buttonEl).borderRadius;
    const margin = window.getComputedStyle(buttonEl).margin;
    const outline = window.getComputedStyle(buttonEl).outline;
    const borderWidth = window.getComputedStyle(buttonEl).borderWidth;
    const filter = window.getComputedStyle(buttonEl).filter;

    this.root.style.setProperty("overflow-x", overflowX);
    this.root.style.setProperty("overflow-y", overflowY);
    this.root.style.setProperty("border-radius", borderRadius);
    this.root.style.setProperty("margin", margin);
    this.root.style.setProperty("outline", outline);
    this.root.style.setProperty("border-width", borderWidth);
    this.root.style.setProperty("filter", filter);

    buttonEl.style.setProperty("overflow-x", "clip");
    buttonEl.style.setProperty("overflow-y", "clip");
    buttonEl.style.setProperty("border-width", "0");
    buttonEl.style.setProperty("margin", "0");
    buttonEl.style.setProperty("filter", "none");
    buttonEl.style.setProperty("box-shadow", "none");

    buttonEl.style.setProperty("--overflow-x", "clip");
    buttonEl.style.setProperty("--overflow-y", "clip");
    buttonEl.style.setProperty("--border-width", "0");
    buttonEl.style.setProperty("--margin", "0");
    buttonEl.style.setProperty("--filter", "none");
    buttonEl.style.setProperty("--shadow", "none");
  }

  unloadBorderStyle(buttonEl: HTMLElement) {
    this.root.style.setProperty("overflow-x", null);
    this.root.style.setProperty("overflow-y", null);
    this.root.style.setProperty("border-radius", null);
    this.root.style.setProperty("margin", null);
    this.root.style.setProperty("outline", null);
    this.root.style.setProperty("border-width", null);
    this.root.style.setProperty("filter", null);

    buttonEl.style.setProperty("overflow-x", null);
    buttonEl.style.setProperty("overflow-y", null);
    buttonEl.style.setProperty("margin", null);
    buttonEl.style.setProperty("outline", null);
    buttonEl.style.setProperty("border-width", null);
    buttonEl.style.setProperty("filter", null);
    buttonEl.style.setProperty("box-shadow", null);

    buttonEl.style.setProperty(
      "--overflow-x",
      this._cachedCSSVariables["--overflow-x"] || null
    );
    buttonEl.style.setProperty(
      "--overflow-y",
      this._cachedCSSVariables["--overflow-y"] || null
    );
    buttonEl.style.setProperty(
      "--border-width",
      this._cachedCSSVariables["--border-width"] || null
    );
    buttonEl.style.setProperty(
      "--margin",
      this._cachedCSSVariables["--margin"] || null
    );
    buttonEl.style.setProperty(
      "--shadow",
      this._cachedCSSVariables["--shadow"] || null
    );
    buttonEl.style.setProperty(
      "--filter",
      this._cachedCSSVariables["--filter"] || null
    );
  }

  loadCollapsedLayout() {
    const buttonEl = this.buttonEl;
    const iconEl = this.iconEl;
    const labelEl = this.labelEl;
    const collapsedButtonWidth = getCollapsedButtonWidth(
      this._iconWidth,
      this._buttonPaddingLeft,
      this._buttonPaddingRight
    );
    if (buttonEl && iconEl && labelEl) {
      buttonEl.style.setProperty("transition-property", "none");
      iconEl.style.setProperty("transition-property", "none");
      labelEl.style.setProperty("transition-property", "none");
      buttonEl.style.setProperty("min-width", `${collapsedButtonWidth}px`);
      buttonEl.style.setProperty("max-width", `${collapsedButtonWidth}px`);
      buttonEl.style.setProperty("transform", null);
      buttonEl.style.setProperty("align-self", "flex-end");
      iconEl.style.setProperty("max-width", "0");
      iconEl.style.setProperty("transform", `translateX(0)`);
      labelEl.hidden = true;
    }
  }

  unloadCollapsedLayout() {
    const buttonEl = this.buttonEl;
    const iconEl = this.iconEl;
    const labelEl = this.labelEl;
    if (buttonEl && iconEl && labelEl) {
      const collapsedButtonWidth = getCollapsedButtonWidth(
        this._iconWidth,
        this._buttonPaddingLeft,
        this._buttonPaddingRight
      );
      const buttonTranslateX = this._buttonWidth - collapsedButtonWidth;
      const iconTranslateX = getCollapsedIconOffset(
        this._buttonX,
        this._iconX,
        this._iconWidth,
        this._buttonPaddingLeft
      );
      buttonEl.style.transitionProperty = "none";
      iconEl.style.transitionProperty = "none";
      labelEl.style.transitionProperty = "none";
      buttonEl.style.setProperty("min-width", null);
      buttonEl.style.setProperty("max-width", null);
      buttonEl.style.setProperty("align-self", null);
      buttonEl.style.setProperty(
        "transform",
        `translateX(${buttonTranslateX}px)`
      );
      iconEl.style.setProperty("max-width", null);
      iconEl.style.setProperty("transform", `translateX(${iconTranslateX}px)`);
      labelEl.hidden = false;
    }
  }

  interrupted(state: "collapsing" | "expanding"): boolean {
    return this._state !== state;
  }

  protected async collapse(animated: boolean): Promise<void> {
    if (this._state === "collapsing" || this._state === "collapsed") {
      return;
    }
    this._state = "collapsing";

    await nextAnimationFrame();
    if (this.interrupted("collapsing")) {
      return;
    }

    this.updateTransition(animated);

    if (animated) {
      const buttonEl = this.buttonEl;
      const iconEl = this.iconEl;
      const labelEl = this.labelEl;
      if (buttonEl && iconEl && labelEl) {
        const collapsedButtonWidth = getCollapsedButtonWidth(
          this._iconWidth,
          this._buttonPaddingLeft,
          this._buttonPaddingRight
        );
        const buttonTranslateX = this._buttonWidth - collapsedButtonWidth;
        const iconTranslateX = getCollapsedIconOffset(
          this._buttonX,
          this._iconX,
          this._iconWidth,
          this._buttonPaddingLeft
        );
        buttonEl.style.transform = `translateX(${buttonTranslateX}px)`;
        iconEl.style.transform = `translateX(${iconTranslateX}px)`;
        labelEl.hidden = false;
        labelEl.style.opacity = "0";

        this.loadBorderStyle(buttonEl);

        await animationsComplete(buttonEl);
        if (this.interrupted("collapsing")) {
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

    await nextAnimationFrame();
    if (this.interrupted("expanding")) {
      return;
    }

    const buttonEl = this.buttonEl;
    const labelEl = this.labelEl;
    const iconEl = this.iconEl;

    this.unloadCollapsedLayout();

    if (buttonEl) {
      this.loadBorderStyle(buttonEl);
    }

    await nextAnimationFrame();
    if (this.interrupted("expanding")) {
      return;
    }

    this.updateTransition(animated);

    if (buttonEl) {
      if (animated) {
        buttonEl?.style.setProperty("transform", `translateX(0)`);
        iconEl?.style.setProperty("transform", `translateX(0)`);
        labelEl?.style.setProperty("opacity", "1");

        await animationsComplete(buttonEl);
        if (this.interrupted("expanding")) {
          return;
        }
      }
      this.unloadBorderStyle(buttonEl);
    }
    this._state = "expanded";
    this.measure();
  }

  handleScroll = (entries: IntersectionObserverEntry[]) => {
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

  handleResize = () => {
    if (!this._state || this._state === "expanded") {
      this.measure();
    }
  };

  protected override onContentAssigned(children: Element[]) {
    const elements = children;
    const buttons = elements.filter(
      (el) => el.tagName.toLowerCase() === this.selectors.button
    );
    const button = buttons?.[0];
    const targetEl = (button?.shadowRoot || button)
      ?.firstElementChild as HTMLElement;
    if (this._buttonEl !== targetEl) {
      this._buttonEl = targetEl;
      this.updateState(false);
    }
  }

  override focus(options?: FocusOptions) {
    const buttonEl = this._buttonEl;
    if (buttonEl) {
      buttonEl.focus(options);
    }
  }

  override blur() {
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
