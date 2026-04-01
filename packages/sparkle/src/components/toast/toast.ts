import { getCssDurationMS } from "../../../../sparkle-style-transformer/src/utils/getCssDurationMS";
import { SparkleComponent } from "../../core/sparkle-component";
import { animationsComplete } from "../../utils/animationsComplete";
import { waitForEvent } from "../../utils/events";
import spec from "./_toast";

const CLOSING_EVENT = "closing";
const CLOSED_EVENT = "closed";
const OPENING_EVENT = "opening";
const OPENED_EVENT = "opened";

/**
 * Toasts are used to display important messages inline or as alert notifications.
 */
export default class Toast extends SparkleComponent(spec) {
  private _setup = false;

  private _autoHideTimeout?: number;

  override onAttributeChanged(name: string, newValue: string) {
    if (name === this.attrs.color) {
      const buttonEl = this.refs.button;
      if (buttonEl) {
        if (newValue != null) {
          buttonEl.setAttribute(name, newValue);
        } else {
          buttonEl.removeAttribute(name);
        }
      }
    }
    if (name === this.attrs.open) {
      const open = newValue != null;
      this.ariaHidden = open ? "false" : "true";
      const durationMS = getCssDurationMS(this.timeout, 4000);
      this.changeState(open, durationMS);
    }
    if (name === this.attrs.timeout) {
      const open = this.open;
      const durationMS = getCssDurationMS(newValue, 4000);
      this.restartAutoClose(open, durationMS);
    }
    if (name === this.attrs.message) {
      const message = newValue;
      if (message) {
        this.setAssignedToSlot(message);
      }
    }
    if (name === this.attrs.action) {
      const action = newValue;
      if (action) {
        this.setAssignedToSlot(action, "action");
      }
      const closeEl = this.refs.close;
      if (closeEl) {
        closeEl.hidden = action == null;
      }
    }
  }

  override onConnected() {
    const open = this.open;
    const durationMS = getCssDurationMS(this.timeout, 4000);
    this.changeState(open, durationMS);
    const message = this.message;
    if (message) {
      this.setAssignedToSlot(message);
    }
    const action = this.action;
    if (action) {
      this.setAssignedToSlot(action, "action");
    }
    const closeEl = this.refs.close;
    if (closeEl) {
      closeEl.hidden = action == null;
    }
    this.root.addEventListener("mousemove", this.handleHover, {
      passive: true,
    });
    this.refs.button.addEventListener("click", this.handleButtonClick);
    if (this.shadowRoot) {
      this.refs.actionSlot.addEventListener(
        "slotchange",
        this.handleActionSlotAssigned,
      );
    } else {
      this.handleActionChildrenAssigned(
        Array.from(this.refs.actionSlot.children || []),
      );
    }
  }

  override onDisconnected() {
    this.root.removeEventListener("mousemove", this.handleHover);
    this.refs.button.removeEventListener("click", this.handleButtonClick);
    if (this.shadowRoot) {
      this.refs.actionSlot.removeEventListener(
        "slotchange",
        this.handleActionSlotAssigned,
      );
    }
  }

  override onContentAssigned(children: Element[]) {
    const assignedElement = children[0];
    if (assignedElement) {
      if (this.message == null) {
        this.setAttribute("message", "");
      }
    }
  }

  protected handleActionSlotAssigned = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    this.handleActionChildrenAssigned(slot.assignedElements());
  };

  protected handleActionChildrenAssigned(children: Element[]) {
    if (children.length > 0) {
      if (this.action == null) {
        this.setAttribute("action", "");
      }
    }
  }

  private restartAutoClose(open: boolean, autoCloseDuration: number) {
    clearTimeout(this._autoHideTimeout);
    if (open && autoCloseDuration >= 0 && autoCloseDuration < Infinity) {
      this._autoHideTimeout = window.setTimeout(
        () => this.close(),
        autoCloseDuration,
      );
    }
  }

  private handleButtonClick = () => {
    this.close();
  };

  private handleHover = () => {
    const open = this.open;
    const durationMS = getCssDurationMS(this.timeout, 4000);
    this.restartAutoClose(open, durationMS);
  };

  protected async changeState(
    open: boolean,
    autoCloseDuration: number,
  ): Promise<void> {
    if (!this._setup) {
      this._setup = true;
      if (!open) {
        // Don't show close animation if starts closed.
        this.root.hidden = true;
        this.root.style.display = "none";
        return;
      }
    }
    if (open) {
      return this.handleOpen(autoCloseDuration);
    } else {
      return this.handleClose();
    }
  }

  protected async handleOpen(autoCloseDuration: number): Promise<void> {
    if (this.disabled) {
      return;
    }

    if (autoCloseDuration >= 0 && autoCloseDuration < Infinity) {
      this.restartAutoClose(true, autoCloseDuration);
    }

    const el = this.root;
    if (el) {
      el.hidden = false;
      el.inert = false;
    }

    this.emit(OPENING_EVENT);

    await animationsComplete(this.root);

    this.emit(OPENED_EVENT);
  }

  async handleClose(): Promise<void> {
    const el = this.root;
    if (el) {
      el.inert = true;
    }

    this.emit(CLOSING_EVENT);

    clearTimeout(this._autoHideTimeout);

    await animationsComplete(this.root);

    if (el) {
      el.hidden = true;
    }

    this.emit(CLOSED_EVENT);
  }

  /**
   * Shows the toast.
   */
  async show(): Promise<void> {
    if (this.open) {
      return undefined;
    }
    this.open = true;
    return waitForEvent(this, "opened");
  }

  /**
   * Hides the toast
   */
  async close(): Promise<void> {
    if (!this.open) {
      return undefined;
    }
    this.open = false;
    return waitForEvent(this, "closed");
  }

  /**
   * Displays the toast as an alert notification.
   * When dismissed, the toast will be removed from the DOM completely.
   * By storing a reference to the toast, you can reuse it by calling this method again.
   * The returned promise will resolve after the toast is hidden.
   */
  async alert(container: HTMLElement): Promise<void> {
    return new Promise<void>((resolve) => {
      this.show();
      this.addEventListener(
        "closed",
        () => {
          container.removeChild(this);
          resolve();
        },
        { once: true },
      );
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-toast": Toast;
  }
  interface HTMLElementEventMap {
    closing: CustomEvent;
    closed: CustomEvent;
    opening: CustomEvent;
    opened: CustomEvent;
    removed: CustomEvent;
  }
}
