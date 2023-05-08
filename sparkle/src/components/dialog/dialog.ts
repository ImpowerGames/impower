import SparkleEvent from "../../core/SparkleEvent";
import SparkleElement from "../../core/sparkle-element";
import { animationsComplete } from "../../utils/animate";
import { getCssIcon } from "../../utils/getCssIcon";
import { lockBodyScrolling, unlockBodyScrolling } from "../../utils/scroll";
import css from "./dialog.css";
import html from "./dialog.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

const closingEvent = new SparkleEvent("closing");
const closedEvent = new SparkleEvent("closed");
const openingEvent = new SparkleEvent("opening");
const openedEvent = new SparkleEvent("opened");
const removedEvent = new SparkleEvent("removed");

export const DEFAULT_DIALOG_DEPENDENCIES = {
  "s-icon": "s-icon",
};

/**
 * Dialogs, sometimes called "modals", appear above the page and require the user's immediate attention.
 */
export default class Dialog extends SparkleElement {
  static override dependencies = DEFAULT_DIALOG_DEPENDENCIES;

  static override async define(
    tag = "s-dialog",
    dependencies = DEFAULT_DIALOG_DEPENDENCIES
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
  }

  override get html(): string {
    return Dialog.augment(html, DEFAULT_DIALOG_DEPENDENCIES);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  static override get observedAttributes() {
    return [
      ...super.observedAttributes,
      "open",
      "icon",
      "label",
      "cancel",
      "confirm",
    ];
  }

  /**
   * Indicates whether or not the dialog is open. You can toggle this attribute to show and hide the dialog, or you can
   * use the `show()` and `hide()` methods and this attribute will reflect the dialog's open state.
   */
  get open(): boolean {
    return this.getBooleanAttribute("open");
  }
  set open(value: boolean) {
    this.setBooleanAttribute("open", value);
  }

  /**
   * The icon to display above the title.
   */
  get icon(): string | null {
    return this.getStringAttribute("icon");
  }

  /**
   * The title text.
   */
  get label(): string | null {
    return this.getStringAttribute("label");
  }

  /**
   * The cancel text.
   */
  get cancel(): string | null {
    return this.getStringAttribute("cancel");
  }

  /**
   * The confirm text.
   */
  get confirm(): string | null {
    return this.getStringAttribute("confirm");
  }

  get dialog(): HTMLDialogElement {
    return this.root as HTMLDialogElement;
  }

  get iconEl(): HTMLElement | null {
    return this.getElementByClass("icon");
  }

  get labelEl(): HTMLButtonElement | null {
    return this.getElementByClass("label");
  }

  get cancelButton(): HTMLButtonElement | null {
    return this.getElementByClass("cancel-button");
  }

  get confirmButton(): HTMLButtonElement | null {
    return this.getElementByClass("confirm-button");
  }

  get labelSlot(): HTMLSlotElement | null {
    return this.getSlotByName("label");
  }

  get cancelSlot(): HTMLSlotElement | null {
    return this.getSlotByName("cancel");
  }

  get confirmSlot(): HTMLSlotElement | null {
    return this.getSlotByName("confirm");
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === "open") {
      this.handleOpenChange(newValue != null);
    }
    if (name === "icon") {
      this.updateRootCssVariable(name, getCssIcon(newValue));
      const icon = newValue;
      const iconEl = this.iconEl;
      if (iconEl) {
        iconEl.hidden = icon == null;
      }
    }
    if (name === "label") {
      const label = newValue;
      if (label) {
        this.setAssignedToSlot(label, "label");
      }
      const labelEl = this.labelEl;
      if (labelEl) {
        labelEl.hidden = label == null;
      }
    }
    if (name === "cancel") {
      const cancel = newValue;
      if (cancel) {
        this.setAssignedToSlot(cancel, "cancel");
      }
      const cancelButton = this.cancelButton;
      if (cancelButton) {
        cancelButton.hidden = cancel == null;
      }
    }
    if (name === "confirm") {
      const confirm = newValue;
      if (confirm) {
        this.setAssignedToSlot(confirm, "confirm");
      }
      const confirmButton = this.confirmButton;
      if (confirmButton) {
        confirmButton.hidden = confirm == null;
      }
    }
  }

  protected override onConnected(): void {
    const icon = this.icon;
    const iconEl = this.iconEl;
    if (iconEl) {
      iconEl.hidden = icon == null;
    }
    const label = this.label;
    const labelEl = this.labelEl;
    if (labelEl) {
      labelEl.hidden = label == null;
    }
    const cancel = this.cancel;
    const cancelButton = this.cancelButton;
    if (cancelButton) {
      cancelButton.hidden = cancel == null;
    }
    const confirm = this.confirm;
    const confirmButton = this.confirmButton;
    if (confirmButton) {
      confirmButton.hidden = confirm == null;
    }
    this.dialog.addEventListener("click", this.handleLightDismiss);
    this.dialog.addEventListener("close", this.handleClose);
    // remove connecting attribute
    // prevent page load @keyframes playing
    animationsComplete(this.root).then(() => {
      this.root.removeAttribute("connecting");
    });
    this.labelSlot?.addEventListener("slotchange", this.handleLabelSlotChange);
    this.cancelSlot?.addEventListener(
      "slotchange",
      this.handleCancelSlotChange
    );
    this.confirmSlot?.addEventListener(
      "slotchange",
      this.handleConfirmSlotChange
    );
  }

  protected override onParsed(): void {
    this.root.hidden = !this.open;
    if (this.open) {
      lockBodyScrolling(this);
    }
  }

  protected override onDisconnected(): void {
    unlockBodyScrolling(this);

    this.dialog.removeEventListener("click", this.handleLightDismiss);
    this.dialog.removeEventListener("close", this.handleClose);
    this.labelSlot?.removeEventListener(
      "slotchange",
      this.handleLabelSlotChange
    );
    this.cancelSlot?.removeEventListener(
      "slotchange",
      this.handleCancelSlotChange
    );
    this.confirmSlot?.removeEventListener(
      "slotchange",
      this.handleConfirmSlotChange
    );
    this.dispatchEvent(removedEvent);
  }

  protected handleLabelSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    const assignedElement = slot?.assignedElements?.()?.[0];
    if (assignedElement) {
      if (this.label == null) {
        this.setAttribute("label", "");
      }
    }
  };

  protected handleCancelSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    const assignedElement = slot?.assignedElements?.()?.[0];
    if (assignedElement) {
      if (this.cancel == null) {
        this.setAttribute("cancel", "");
      }
    }
  };

  protected handleConfirmSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    const assignedElement = slot?.assignedElements?.()?.[0];
    if (assignedElement) {
      if (this.confirm == null) {
        this.setAttribute("confirm", "");
      }
    }
  };

  protected handleLightDismiss = (e: Event) => {
    const dialog = e.currentTarget as HTMLDialogElement;
    dialog.close("dismiss");
  };

  protected handleClose = async (e: Event) => {
    const dialog = e.currentTarget as HTMLDialogElement;
    dialog.setAttribute("inert", "");
    this.dispatchEvent(closingEvent);

    await animationsComplete(this.root);

    this.dispatchEvent(closedEvent);
  };

  protected async handleOpenChange(isOpen: boolean): Promise<void> {
    if (!isOpen) {
      return;
    }

    this.root.hidden = false;
    this.root.inert = false;

    const focusTarget = this.root.querySelector<HTMLElement>("[focus]");

    if (focusTarget) {
      focusTarget.focus();
    } else {
      const cancelButton = this.cancelButton;
      if (cancelButton) {
        cancelButton.focus();
      } else {
        this.root.querySelector("button")?.focus();
      }
    }

    this.dispatchEvent(openingEvent);

    await animationsComplete(this.root);

    this.dispatchEvent(openedEvent);
  }

  private requestClose(source: "close-button" | "keyboard" | "overlay") {}

  /**
   * Closes the dialog element.
   *
   * The argument, if provided, provides a return value.
   */
  async close(returnValue?: string): Promise<string | undefined> {
    return returnValue;
  }

  /**
   * Displays the dialog element.
   */
  async show(): Promise<void> {}

  /**
   * Displays the dialog element and prevents the user from interacting with anything behind the element.
   */
  showModal(): void {
    this.show();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-dialog": Dialog;
  }
  interface HTMLElementEventMap {
    closing: SparkleEvent;
    closed: SparkleEvent;
    opening: SparkleEvent;
    opened: SparkleEvent;
    removed: SparkleEvent;
  }
}
