import SparkleElement from "../../core/sparkle-element";
import { animateTo, stopAnimations } from "../../utils/animate";
import {
  getAnimation,
  setDefaultAnimation,
} from "../../utils/animation-registry";
import { waitForEvent } from "../../utils/events";
import { getDurationMS } from "../../utils/getDurationMS";
import css from "./toast.css";
import html from "./toast.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_TOAST_DEPENDENCIES = {
  "s-button": "s-button",
  "s-icon": "s-icon",
};

/**
 * Toasts are used to display important messages inline or as alert notifications.
 */
export default class Toast extends SparkleElement {
  static override dependencies = DEFAULT_TOAST_DEPENDENCIES;

  static override async define(
    tag = "s-toast",
    dependencies = DEFAULT_TOAST_DEPENDENCIES
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
  }

  override get html(): string {
    return Toast.augment(html, DEFAULT_TOAST_DEPENDENCIES);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  static override get observedAttributes() {
    return [
      ...super.observedAttributes,
      "open",
      "variant",
      "closable",
      "auto-close",
      "icon",
      "message",
    ];
  }

  /**
   * Indicates whether or not the toast is open. You can toggle this attribute to show and hide the toast, or you can
   * use the `show()` and `hide()` methods and this attribute will reflect the toast's open state.
   */
  get open(): boolean {
    return this.getBooleanAttribute("open");
  }
  set open(value: boolean) {
    this.setBooleanAttribute("open", value);
  }

  /**
   * The toast's theme variant.
   */
  get variant():
    | "primary"
    | "success"
    | "neutral"
    | "warning"
    | "danger"
    | null {
    return this.getStringAttribute("variant");
  }

  /**
   * Enables a close button that allows the user to dismiss the toast.
   */
  get closable(): boolean {
    return this.getBooleanAttribute("closable");
  }

  /**
   * The length of time, in milliseconds, the toast will show before closing itself. If the user interacts with
   * the toast before it closes (e.g. moves the mouse over it), the timer will restart.
   *
   * If not provided a value, defaults to `3000`.
   */
  get autoClose(): number {
    const value = this.getStringAttribute("auto-close");
    return getDurationMS(value, Infinity, 3000);
  }

  /**
   * The icon to display next to the message.
   */
  get icon(): string | null {
    return this.getStringAttribute("icon");
  }
  set icon(value: string | null) {
    this.setStringAttribute("icon", value);
  }

  /**
   * The message to display inside the toast.
   */
  get message(): string | null {
    return this.getStringAttribute("message");
  }
  set message(value: string | null) {
    this.setStringAttribute("message", value);
  }

  get iconEl(): HTMLElement | null {
    return this.getElementByClass("icon");
  }

  get messageEl(): HTMLElement | null {
    return this.getElementByClass("message");
  }

  get buttonEl(): HTMLElement | null {
    return this.getElementByClass("close-button");
  }

  private _setup = false;

  private _autoHideTimeout?: number;

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "open") {
      const open = newValue != null;
      this.ariaHidden = open ? "false" : "true";
      const durationMS = this.autoClose;
      this.changeState(open, durationMS);
    }
    if (name === "auto-close") {
      const open = this.open;
      const durationMS = getDurationMS(newValue, Infinity, 3000);
      this.restartAutoClose(open, durationMS);
    }
    if (name === "icon") {
      const iconEl = this.iconEl;
      if (iconEl) {
        if (newValue != null) {
          iconEl.setAttribute("icon", newValue);
        } else {
          iconEl.removeAttribute("icon");
        }
      }
    }
    if (name === "message") {
      this.textContent = newValue;
    }
  }

  protected override connectedCallback(): void {
    super.connectedCallback();
    const open = this.open;
    const durationMS = this.autoClose;
    this.changeState(open, durationMS);
    this.root.addEventListener("mousemove", this.handleHover);
    this.buttonEl?.addEventListener("click", this.handleCloseClick);
  }

  protected override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.root.removeEventListener("mousemove", this.handleHover);
    this.buttonEl?.removeEventListener("click", this.handleCloseClick);
  }

  private restartAutoClose(open: boolean, autoCloseDuration: number): void {
    clearTimeout(this._autoHideTimeout);
    if (open && autoCloseDuration >= 0 && autoCloseDuration < Infinity) {
      this._autoHideTimeout = window.setTimeout(
        () => this.hide(),
        autoCloseDuration
      );
    }
  }

  private handleCloseClick = (): void => {
    this.hide();
  };

  private handleHover = (): void => {
    const open = this.open;
    const durationMS = this.autoClose;
    this.restartAutoClose(open, durationMS);
  };

  protected async changeState(
    open: boolean,
    autoCloseDuration: number
  ): Promise<void> {
    if (!this._setup) {
      if (!open) {
        // Don't show close animation if starts closed.
        this.root.hidden = true;
        this.root.style.display = "none";
        return;
      }
      this._setup = true;
    }
    if (open) {
      // Show
      this.emit("s-show");

      if (autoCloseDuration >= 0 && autoCloseDuration < Infinity) {
        this.restartAutoClose(open, autoCloseDuration);
      }

      await stopAnimations(this.root);
      this.root.hidden = false;
      this.root.style.display = "flex";
      const { keyframes, options } = getAnimation(this, "toast.show", {
        rtl: this.rtl,
      });
      await animateTo(this.root, keyframes, options);

      this.emit("s-after-show");
    } else {
      // Hide
      this.emit("s-hide");

      clearTimeout(this._autoHideTimeout);

      await stopAnimations(this.root);
      const { keyframes, options } = getAnimation(this, "toast.hide", {
        rtl: this.rtl,
      });
      await animateTo(this.root, keyframes, options);
      this.root.hidden = true;
      this.root.style.display = "none";

      this.emit("s-after-hide");
    }
  }

  /**
   * Shows the toast.
   */
  async show(): Promise<void> {
    if (this.open) {
      return undefined;
    }

    this.open = true;
    return waitForEvent(this, "s-after-show");
  }

  /**
   * Hides the toast
   */
  async hide(): Promise<void> {
    if (!this.open) {
      return undefined;
    }

    this.open = false;
    return waitForEvent(this, "s-after-hide");
  }

  /**
   * Displays the toast as an alert notification.
   * When dismissed, the toast will be removed from the DOM completely.
   * By storing a reference to the toast, you can reuse it by calling this method again.
   * The returned promise will resolve after the toast is hidden.
   */
  async alert(container: HTMLElement): Promise<void> {
    return new Promise<void>((resolve) => {
      // Wait for the toast stack to render
      requestAnimationFrame(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- force a reflow for the initial transition
        this.clientWidth;
        this.show();
      });

      this.addEventListener(
        "s-after-hide",
        () => {
          container.removeChild(this);
          resolve();
        },
        { once: true }
      );
    });
  }
}

setDefaultAnimation("toast.show", {
  keyframes: [
    { opacity: 0, scale: 0.8 },
    { opacity: 1, scale: 1 },
  ],
  options: { duration: 250, easing: "ease" },
});

setDefaultAnimation("toast.hide", {
  keyframes: [
    { opacity: 1, scale: 1 },
    { opacity: 0, scale: 0.8 },
  ],
  options: { duration: 250, easing: "ease" },
});

declare global {
  interface HTMLElementTagNameMap {
    "s-toast": Toast;
  }
}
