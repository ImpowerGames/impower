import { SparkleComponent } from "../../core/sparkle-component";
import { animationsComplete } from "../../utils/animationsComplete";
import spec from "./_drawer";

const CLOSING_EVENT = "closing";
const CLOSED_EVENT = "closed";
const OPENING_EVENT = "opening";
const OPENED_EVENT = "opened";
const REMOVED_EVENT = "removed";

/**
 * Drawers slide in from a container to expose additional options and information.
 */
export default class Drawer extends SparkleComponent(spec) {
  get dialog(): HTMLDialogElement {
    return this.root as HTMLDialogElement;
  }

  override onConnected() {
    this.dialog.addEventListener("click", this.handleLightDismiss);
    this.dialog.addEventListener("close", this.handleEscapeClose);
  }

  override onParsed() {
    this.root.hidden = !this.open;
  }

  override onDisconnected() {
    this.dialog.removeEventListener("click", this.handleLightDismiss);
    this.dialog.removeEventListener("close", this.handleEscapeClose);
    this.emit(REMOVED_EVENT);
  }

  protected handleLightDismiss = (e: Event) => {
    const el = e.target as HTMLElement;
    if (el === this.dialog) {
      this.close("dismiss");
    }
  };

  protected async handleOpen(modal: boolean): Promise<void> {
    this.open = true;
    this.root.hidden = false;
    this.root.inert = false;
    this.setAttribute("loaded", "");
    if (modal) {
      this.dialog.showModal();
    } else {
      this.dialog.show();
    }

    const focusTarget = this.root.querySelector<HTMLElement>("[focus]");
    if (focusTarget) {
      focusTarget.focus();
    } else {
      this.root.querySelector("button")?.focus();
    }

    this.emit(OPENING_EVENT);

    await animationsComplete(this.root);

    this.emit(OPENED_EVENT);
  }

  protected handleClose = async (
    returnValue?: string,
  ): Promise<string | undefined> => {
    this.open = false;
    this.dialog.inert = true;
    this.emit(CLOSING_EVENT);

    await animationsComplete(this.root);

    this.dialog.close();
    this.root.hidden = true;

    this.emit(CLOSED_EVENT);
    return returnValue;
  };

  protected handleEscapeClose = async (
    e: Event,
  ): Promise<string | undefined> => {
    return this.handleClose("escape");
  };

  protected handleClickClose = async (
    e: Event,
  ): Promise<string | undefined> => {
    const button = e.currentTarget as HTMLButtonElement;
    const returnValue = button?.getAttribute?.("id") ?? "";
    return this.handleClose(returnValue);
  };

  /**
   * Closes the drawer element.
   *
   * The argument, if provided, provides a return value.
   */
  async close(returnValue?: string): Promise<string | undefined> {
    return this.handleClose(returnValue);
  }

  /**
   * Displays the drawer element.
   */
  async show(): Promise<void> {
    return this.handleOpen(false);
  }

  /**
   * Displays the drawer element and prevents the user from interacting with anything behind the element.
   */
  async showModal(): Promise<void> {
    return this.handleOpen(true);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-drawer": Drawer;
  }
  interface HTMLElementEventMap {
    closing: CustomEvent;
    closed: CustomEvent;
    opening: CustomEvent;
    opened: CustomEvent;
    removed: CustomEvent;
  }
}
