import getCssDurationMS from "../../../../sparkle-style-transformer/src/utils/getCssDurationMS";
import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import { DEFAULT_SPARKLE_ATTRIBUTES } from "../../core/sparkle-element";
import { animationsComplete } from "../../utils/animationsComplete";
import { waitForEvent } from "../../utils/events";
import Popup from "../popup/popup";
import spec from "./_tooltip";

const CLOSING_EVENT = "closing";
const CLOSED_EVENT = "closed";
const OPENING_EVENT = "opening";
const OPENED_EVENT = "opened";

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
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
    "sync-size",
    "auto-size-boundary",
    "auto-size-padding",
    "label",
    "trigger",
    "show-delay",
    "hide-delay",
  ]),
};

/**
 * Tooltips display additional information based on a specific action.
 */
export default class Tooltip
  extends Popup
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
    return { ...super.selectors, ...spec.selectors };
  }

  override get ref() {
    return super.ref as RefMap<typeof this.selectors>;
  }

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  /**
   * The tooltip's label. If you need to display HTML, use the `label` slot instead.
   */
  get label(): string | null {
    return this.getStringAttribute(Tooltip.attrs.label);
  }
  set label(value) {
    this.setStringAttribute(Tooltip.attrs.label, value);
  }

  /**
   * Controls how the tooltip is activated. Possible options include `click`, `hover`, `focus`, and `manual`. Multiple
   * options can be passed by separating them with a space. When manual is used, the tooltip must be activated
   * programmatically.
   *
   * Default is `hover focus`.
   */
  get trigger(): string | null {
    return this.getStringAttribute(Tooltip.attrs.trigger) || "hover focus";
  }
  set trigger(value) {
    this.setStringAttribute(Tooltip.attrs.trigger, value);
  }

  /**
   * How long does the target have to be hovered before the tooltip will show.
   */
  get showDelay(): string | null {
    return this.getStringAttribute(Tooltip.attrs.showDelay);
  }
  set showDelay(value) {
    this.setStringAttribute(Tooltip.attrs.showDelay, value);
  }

  /**
   * How long after the target is no longer hovered will the tooltip remain.
   */
  get hideDelay(): string | null {
    return this.getStringAttribute(Tooltip.attrs.hideDelay);
  }
  set hideDelay(value) {
    this.setStringAttribute(Tooltip.attrs.hideDelay, value);
  }

  private hoverTimeout?: number;

  override onAttributeChanged(name: string, newValue: string) {
    const tooltipEl = this.ref.popup;
    if (name === Tooltip.attrs.label) {
      if (tooltipEl) {
        tooltipEl.textContent = newValue;
      }
    }
    if (name === Tooltip.attrs.open) {
      const open = newValue != null;
      if (tooltipEl) {
        tooltipEl.setAttribute(Tooltip.attrs.ariaLive, open ? "polite" : "off");
      }
      if (open) {
        this.handleOpen();
      } else {
        this.handleClose();
      }
    }
    if (
      name === Tooltip.attrs.label ||
      name === Tooltip.attrs.distance ||
      name === Tooltip.attrs.placement ||
      name === Tooltip.attrs.skidding
    ) {
      this.reposition();
    }
    if (name === Tooltip.attrs.disabled) {
      if (this.disabled && this.open) {
        this.hide();
      }
    }
  }

  override onConnected() {
    this.root.addEventListener("blur", this.handleBlur, true);
    this.root.addEventListener("focus", this.handleFocus, true);
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("keydown", this.handleKeyDown);
    this.root.addEventListener("mouseover", this.handleMouseOver);
    this.root.addEventListener("mouseout", this.handleMouseOut);
  }

  override onParsed() {
    const popupEl = this.ref.popup;
    if (popupEl) {
      popupEl.hidden = !this.open;
    }
    // If the tooltip is visible on init, update its position
    if (this.open) {
      this.reposition();
    }
  }

  override onDisconnected() {
    this.root.removeEventListener("blur", this.handleBlur, true);
    this.root.removeEventListener("focus", this.handleFocus, true);
    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("keydown", this.handleKeyDown);
    this.root.removeEventListener("mouseover", this.handleMouseOver);
    this.root.removeEventListener("mouseout", this.handleMouseOut);
  }

  private handleBlur = () => {
    if (this.hasTrigger("focus")) {
      this.hide();
    }
  };

  private handleClick = () => {
    if (this.hasTrigger("click")) {
      if (this.open) {
        this.hide();
      } else {
        this.show();
      }
    }
  };

  private handleFocus = () => {
    if (this.hasTrigger("focus")) {
      this.show();
    }
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    // Pressing escape when the target element has focus should dismiss the tooltip
    if (this.open && event.key === "Escape") {
      event.stopPropagation();
      this.hide();
    }
  };

  private handleMouseOver = () => {
    if (this.hasTrigger("hover")) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = window.setTimeout(
        () => this.show(),
        getCssDurationMS(this.showDelay, 0)
      );
    }
  };

  private handleMouseOut = () => {
    if (this.hasTrigger("hover")) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = window.setTimeout(
        () => this.hide(),
        getCssDurationMS(this.hideDelay, 0)
      );
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

    const el = this.ref.popup;
    if (el) {
      el.hidden = false;
      el.inert = false;
    }

    this.emit(OPENING_EVENT);

    await animationsComplete(el);

    this.emit(OPENED_EVENT);
  }

  async handleClose(): Promise<void> {
    const el = this.ref.popup;
    if (el) {
      el.inert = true;
    }

    this.emit(CLOSING_EVENT);

    await animationsComplete(el);

    if (el) {
      el.hidden = true;
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

  override focus(options?: FocusOptions) {
    const content = this.contentSlot?.assignedElements()?.[0];
    if (content instanceof HTMLElement) {
      content.focus(options);
    }
  }

  override blur() {
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
    closing: CustomEvent;
    closed: CustomEvent;
    opening: CustomEvent;
    opened: CustomEvent;
  }
}
