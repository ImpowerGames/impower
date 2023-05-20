import type SparkleEvent from "../../core/SparkleEvent";
import { Properties } from "../../types/properties";
import { animationsComplete, parseDuration } from "../../utils/animate";
import { waitForEvent } from "../../utils/events";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getDependencyNameMap } from "../../utils/getDependencyNameMap";
import Popup from "../popup/popup";
import css from "./tooltip.css";
import html from "./tooltip.html";

const styles = new CSSStyleSheet();

const CLOSING_EVENT = "closing";
const CLOSED_EVENT = "closed";
const OPENING_EVENT = "opening";
const OPENED_EVENT = "opened";

const DEFAULT_DEPENDENCIES = getDependencyNameMap([]);

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  "open",
  "anchor",
  "placement",
  "strategy",
  "distance",
  "skidding",
  "arrow",
  "arrow-placement",
  "arrow-padding",
  "disable-auto-flip",
  "flip-fallback-placements",
  "flip-fallback-strategy",
  "flip-boundary",
  "flip-padding",
  "disable-auto-shift",
  "shift-boundary",
  "shift-padding",
  "auto-size",
  "sync",
  "auto-size-boundary",
  "auto-size-padding",
  "label",
  "trigger",
]);

/**
 * Tooltips display additional information based on a specific action.
 */
export default class Tooltip
  extends Popup
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-tooltip";

  static override dependencies = { ...DEFAULT_DEPENDENCIES };

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get html() {
    return Tooltip.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  override get styles() {
    styles.replaceSync(Tooltip.augmentCss(css, DEFAULT_DEPENDENCIES));
    return [styles];
  }

  /**
   * The tooltip's label. If you need to display HTML, use the `label` slot instead.
   */
  get label(): string | null {
    return this.getStringAttribute(Tooltip.attributes.label);
  }
  set label(value) {
    this.setStringAttribute(Tooltip.attributes.label, value);
  }

  /**
   * Controls how the tooltip is activated. Possible options include `click`, `hover`, `focus`, and `manual`. Multiple
   * options can be passed by separating them with a space. When manual is used, the tooltip must be activated
   * programmatically.
   *
   * Default is `hover focus`.
   */
  get trigger(): string | null {
    return this.getStringAttribute(Tooltip.attributes.trigger) || "hover focus";
  }
  set trigger(value) {
    this.setStringAttribute(Tooltip.attributes.trigger, value);
  }

  private hoverTimeout?: number;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    const tooltipEl = this.popupEl;
    if (name === Tooltip.attributes.label) {
      if (tooltipEl) {
        tooltipEl.textContent = newValue;
      }
    }
    if (name === Tooltip.attributes.open) {
      const open = newValue != null;
      if (tooltipEl) {
        tooltipEl.setAttribute(
          Tooltip.attributes.ariaLive,
          open ? "polite" : "off"
        );
      }
      if (open) {
        this.handleOpen();
      } else {
        this.handleClose();
      }
    }
    if (
      name === Tooltip.attributes.label ||
      name === Tooltip.attributes.distance ||
      name === Tooltip.attributes.placement ||
      name === Tooltip.attributes.skidding
    ) {
      this.reposition();
    }
    if (name === Tooltip.attributes.disabled) {
      if (this.disabled && this.open) {
        this.hide();
      }
    }
  }

  protected override onConnected(): void {
    this.root.addEventListener("blur", this.handleBlur, true);
    this.root.addEventListener("focus", this.handleFocus, true);
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("keydown", this.handleKeyDown);
    this.root.addEventListener("mouseover", this.handleMouseOver);
    this.root.addEventListener("mouseout", this.handleMouseOut);
  }

  protected override onParsed(): void {
    const popupEl = this.popupEl;
    if (popupEl) {
      popupEl.hidden = !this.open;
    }
    // If the tooltip is visible on init, update its position
    if (this.open) {
      this.reposition();
    }
  }

  protected override onDisconnected(): void {
    this.root.removeEventListener("blur", this.handleBlur, true);
    this.root.removeEventListener("focus", this.handleFocus, true);
    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("keydown", this.handleKeyDown);
    this.root.removeEventListener("mouseover", this.handleMouseOver);
    this.root.removeEventListener("mouseout", this.handleMouseOut);
  }

  private handleBlur = (): void => {
    if (this.hasTrigger("focus")) {
      this.hide();
    }
  };

  private handleClick = (): void => {
    if (this.hasTrigger("click")) {
      if (this.open) {
        this.hide();
      } else {
        this.show();
      }
    }
  };

  private handleFocus = (): void => {
    if (this.hasTrigger("focus")) {
      this.show();
    }
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    // Pressing escape when the target element has focus should dismiss the tooltip
    if (this.open && event.key === "Escape") {
      event.stopPropagation();
      this.hide();
    }
  };

  private handleMouseOver = (): void => {
    if (this.hasTrigger("hover")) {
      const delay = parseDuration(
        getComputedStyle(this).getPropertyValue("--show-delay")
      );
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = window.setTimeout(() => this.show(), delay);
    }
  };

  private handleMouseOut = (): void => {
    if (this.hasTrigger("hover")) {
      const delay = parseDuration(
        getComputedStyle(this).getPropertyValue("--hide-delay")
      );
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = window.setTimeout(() => this.hide(), delay);
    }
  };

  private hasTrigger(triggerType: string): boolean {
    const trigger = this.trigger;
    if (!trigger) {
      return false;
    }
    const triggers = trigger.split(" ");
    return triggers.includes(triggerType);
  }

  protected async handleOpen(): Promise<void> {
    if (this.disabled) {
      return;
    }

    this.start();

    const tooltipEl = this.popupEl;
    if (tooltipEl) {
      tooltipEl.hidden = false;
      tooltipEl.inert = false;
    }

    this.emit(OPENING_EVENT);

    await animationsComplete(this.root);

    this.emit(OPENED_EVENT);
  }

  async handleClose(): Promise<void> {
    const tooltipEl = this.popupEl;
    if (tooltipEl) {
      tooltipEl.inert = true;
    }

    this.emit(CLOSING_EVENT);

    await animationsComplete(this.root);

    if (tooltipEl) {
      tooltipEl.hidden = true;
    }

    this.stop();

    this.emit(CLOSED_EVENT);
  }

  /** Shows the tooltip. */
  async show(): Promise<void> {
    if (this.open) {
      return undefined;
    }
    this.open = true;
    return waitForEvent(this, "opened");
  }

  /** Hides the tooltip */
  async hide(): Promise<void> {
    if (!this.open) {
      return undefined;
    }
    this.open = false;
    return waitForEvent(this, "closed");
  }

  override focus(options?: FocusOptions): void {
    const content = this.contentSlot?.assignedElements()?.[0];
    if (content instanceof HTMLElement) {
      content.focus(options);
    }
  }

  override blur(): void {
    const content = this.contentSlot?.assignedElements()?.[0];
    if (content instanceof HTMLElement) {
      content.blur();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-tooltip": Tooltip;
  }
  interface HTMLElementEventMap {
    closing: SparkleEvent;
    closed: SparkleEvent;
    opening: SparkleEvent;
    opened: SparkleEvent;
  }
}
