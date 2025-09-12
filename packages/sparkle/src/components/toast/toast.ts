import { getCssDurationMS } from "../../../../sparkle-style-transformer/src/utils/getCssDurationMS";
import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
} from "../../core/sparkle-element";
import { animationsComplete } from "../../utils/animationsComplete";
import { waitForEvent } from "../../utils/events";
import spec from "./_toast";

const CLOSING_EVENT = "closing";
const CLOSED_EVENT = "closed";
const OPENING_EVENT = "opening";
const OPENED_EVENT = "opened";

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap(["open", "message", "action", "timeout"]),
};

/**
 * Toasts are used to display important messages inline or as alert notifications.
 */
export default class Toast
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

  override get refs() {
    return super.refs as RefMap<typeof this.selectors>;
  }

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  /**
   * Indicates whether or not the toast is open. You can toggle this attribute to show and hide the toast, or you can
   * use the `show()` and `hide()` methods and this attribute will reflect the toast's open state.
   */
  get open(): boolean {
    return this.getBooleanAttribute(Toast.attrs.open);
  }
  set open(value: boolean) {
    this.setBooleanAttribute(Toast.attrs.open, value);
  }

  /**
   * The message to display inside the toast.
   */
  get message(): string | null {
    return this.getStringAttribute(Toast.attrs.message);
  }
  set message(value: string | null) {
    this.setStringAttribute(Toast.attrs.message, value);
  }

  /**
   * The label for the action button.
   *
   * (Clicking this button will dismiss the toast.)
   */
  get action(): string | null {
    return this.getStringAttribute(Toast.attrs.action);
  }
  set action(value: string | null) {
    this.setStringAttribute(Toast.attrs.action, value);
  }

  /**
   * The length of time, in milliseconds, the toast will show before closing itself.
   * If the user interacts with the toast before it closes (e.g. moves the mouse over it),
   * the timer will restart.
   *
   * Set to `none`, to make it so toast will remain indefinitely (or until the user dismisses it).
   *
   * Defaults to `4000`.
   */
  get timeout(): string | null {
    return this.getStringAttribute(Toast.attrs.timeout);
  }
  set timeout(value: string | null) {
    this.setStringAttribute(Toast.attrs.timeout, value);
  }

  private _setup = false;

  private _autoHideTimeout?: number;

  override onAttributeChanged(name: string, newValue: string) {
    if (name === Toast.attrs.color) {
      const buttonEl = this.refs.button;
      if (buttonEl) {
        if (newValue != null) {
          buttonEl.setAttribute(name, newValue);
        } else {
          buttonEl.removeAttribute(name);
        }
      }
    }
    if (name === Toast.attrs.open) {
      const open = newValue != null;
      this.ariaHidden = open ? "false" : "true";
      const durationMS = getCssDurationMS(this.timeout, 4000);
      this.changeState(open, durationMS);
    }
    if (name === Toast.attrs.timeout) {
      const open = this.open;
      const durationMS = getCssDurationMS(newValue, 4000);
      this.restartAutoClose(open, durationMS);
    }
    if (name === Toast.attrs.message) {
      const message = newValue;
      if (message) {
        this.setAssignedToSlot(message);
      }
    }
    if (name === Toast.attrs.action) {
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
        this.handleActionSlotAssigned
      );
    } else {
      this.handleActionChildrenAssigned(
        Array.from(this.refs.actionSlot.children || [])
      );
    }
  }

  override onDisconnected() {
    this.root.removeEventListener("mousemove", this.handleHover);
    this.refs.button.removeEventListener("click", this.handleButtonClick);
    if (this.shadowRoot) {
      this.refs.actionSlot.removeEventListener(
        "slotchange",
        this.handleActionSlotAssigned
      );
    }
  }

  protected override onContentAssigned(children: Element[]) {
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
        autoCloseDuration
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
    autoCloseDuration: number
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
        { once: true }
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
