import { getCssDurationMS } from "../../../../sparkle-style-transformer/src/utils/getCssDurationMS";
import { animationsComplete } from "../../utils/animationsComplete";
import { waitForEvent } from "../../utils/events";
import { PopupComponent } from "../popup/popup";
import spec from "./_tooltip";

const CLOSING_EVENT = "closing";
const CLOSED_EVENT = "closed";
const OPENING_EVENT = "opening";
const OPENED_EVENT = "opened";

/**
 * Tooltips display additional information based on a specific action.
 */
export default class Tooltip extends PopupComponent(spec) {
  private hoverTimeout?: number;

  override onAttributeChanged(name: string, newValue: string) {
    const tooltipEl = this.refs.popup;
    if (name === this.attrs.label) {
      if (tooltipEl) {
        tooltipEl.textContent = newValue;
      }
    }
    if (name === this.attrs.open) {
      const open = newValue != null;
      if (tooltipEl) {
        tooltipEl.setAttribute(this.attrs.ariaLive, open ? "polite" : "off");
      }
      if (open) {
        this.handleOpen();
      } else {
        this.handleClose();
      }
    }
    if (
      name === this.attrs.label ||
      name === this.attrs.distance ||
      name === this.attrs.placement ||
      name === this.attrs.skidding
    ) {
      this.reposition();
    }
    if (name === this.attrs.disabled) {
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
    const popupEl = this.refs.popup;
    if (popupEl) {
      popupEl.hidden = !this.open;
    }
  }

  override onParsed() {
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
        getCssDurationMS(this.showDelay, 0),
      );
    }
  };

  private handleMouseOut = () => {
    if (this.hasTrigger("hover")) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = window.setTimeout(
        () => this.hide(),
        getCssDurationMS(this.hideDelay, 0),
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
    const el = this.refs.popup;

    el.inert = true;
    el.hidden = false;
    el.style.opacity = "0";

    await this.start();

    el.setAttribute("anchored", "");
    el.style.opacity = "1";

    this.emit(OPENING_EVENT);

    await animationsComplete(el);

    this.emit(OPENED_EVENT);

    el.inert = false;
  }

  async handleClose(): Promise<void> {
    const el = this.refs.popup;

    el.inert = true;

    this.emit(CLOSING_EVENT);

    await animationsComplete(el);

    el.hidden = true;

    this.stop();

    el.removeAttribute("anchored");

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
