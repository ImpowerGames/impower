import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import getDependencyNameMap from "../../../../spark-element/src/utils/getDependencyNameMap";
import getCssDurationMS from "../../../../sparkle-style-transformer/src/utils/getCssDurationMS";
import getCssIcon from "../../../../sparkle-style-transformer/src/utils/getCssIcon";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import Icons from "../../configs/icons";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
} from "../../core/sparkle-element";
import { animationsComplete } from "../../utils/animationsComplete";
import { waitForEvent } from "../../utils/events";
import component from "./_toast";

const CLOSING_EVENT = "closing";
const CLOSED_EVENT = "closed";
const OPENING_EVENT = "opening";
const OPENED_EVENT = "opened";

const DEFAULT_TRANSFORMERS = {
  icon: (v: string) => getCssIcon(v, Icons.all()),
  spacing: getCssSize,
};

const DEFAULT_DEPENDENCIES = getDependencyNameMap(["s-button"]);

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
  static override tagName = "s-toast";

  static override dependencies = DEFAULT_DEPENDENCIES;

  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

  static override async define(
    tagName?: string,
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  override transformHtml(html: string) {
    return Toast.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  override transformCss(css: string) {
    return Toast.augmentCss(css, DEFAULT_DEPENDENCIES);
  }

  /**
   * Indicates whether or not the toast is open. You can toggle this attribute to show and hide the toast, or you can
   * use the `show()` and `hide()` methods and this attribute will reflect the toast's open state.
   */
  get open(): boolean {
    return this.getBooleanAttribute(Toast.attributes.open);
  }
  set open(value: boolean) {
    this.setBooleanAttribute(Toast.attributes.open, value);
  }

  /**
   * The message to display inside the toast.
   */
  get message(): string | null {
    return this.getStringAttribute(Toast.attributes.message);
  }
  set message(value: string | null) {
    this.setStringAttribute(Toast.attributes.message, value);
  }

  /**
   * The label for the action button.
   *
   * (Clicking this button will dismiss the toast.)
   */
  get action(): string | null {
    return this.getStringAttribute(Toast.attributes.action);
  }
  set action(value: string | null) {
    this.setStringAttribute(Toast.attributes.action, value);
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
    return this.getStringAttribute(Toast.attributes.timeout);
  }
  set timeout(value: string | null) {
    this.setStringAttribute(Toast.attributes.timeout, value);
  }

  get buttonEl(): HTMLButtonElement | null {
    return this.getElementByClass("button");
  }

  get closeEl(): HTMLElement | null {
    return this.getElementByClass("close");
  }

  get actionSlot(): HTMLSlotElement | null {
    return this.getSlotByName("action");
  }

  private _setup = false;

  private _autoHideTimeout?: number;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Toast.attributes.color) {
      const buttonEl = this.buttonEl;
      if (buttonEl) {
        if (newValue != null) {
          buttonEl.setAttribute(name, newValue);
        } else {
          buttonEl.removeAttribute(name);
        }
      }
    }
    if (name === Toast.attributes.open) {
      const open = newValue != null;
      this.ariaHidden = open ? "false" : "true";
      const durationMS = getCssDurationMS(this.timeout, 4000);
      this.changeState(open, durationMS);
    }
    if (name === Toast.attributes.timeout) {
      const open = this.open;
      const durationMS = getCssDurationMS(newValue, 4000);
      this.restartAutoClose(open, durationMS);
    }
    if (name === Toast.attributes.message) {
      const message = newValue;
      if (message) {
        this.setAssignedToSlot(message);
      }
    }
    if (name === Toast.attributes.action) {
      const action = newValue;
      if (action) {
        this.setAssignedToSlot(action, "action");
      }
      const closeEl = this.closeEl;
      if (closeEl) {
        closeEl.hidden = action == null;
      }
    }
  }

  protected override onConnected(): void {
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
    const closeEl = this.closeEl;
    if (closeEl) {
      closeEl.hidden = action == null;
    }
    this.root.addEventListener("mousemove", this.handleHover, {
      passive: true,
    });
    this.buttonEl?.addEventListener("click", this.handleButtonClick);
    if (this.shadowRoot) {
      this.actionSlot?.addEventListener(
        "slotchange",
        this.handleActionSlotAssigned
      );
    } else {
      this.handleActionChildrenAssigned(
        Array.from(this.actionSlot?.children || [])
      );
    }
  }

  protected override onDisconnected(): void {
    this.root.removeEventListener("mousemove", this.handleHover);
    this.buttonEl?.removeEventListener("click", this.handleButtonClick);
    if (this.shadowRoot) {
      this.actionSlot?.removeEventListener(
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

  private restartAutoClose(open: boolean, autoCloseDuration: number): void {
    clearTimeout(this._autoHideTimeout);
    if (open && autoCloseDuration >= 0 && autoCloseDuration < Infinity) {
      this._autoHideTimeout = window.setTimeout(
        () => this.close(),
        autoCloseDuration
      );
    }
  }

  private handleButtonClick = (): void => {
    this.close();
  };

  private handleHover = (): void => {
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
