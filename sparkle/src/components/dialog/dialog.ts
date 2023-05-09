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
   * Indicates whether or not the dialog can be dismissed by clicking the backdrop behind it.
   */
  get dismissable(): boolean {
    return this.getBooleanAttribute("dismissable");
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
    return this.getElementByClass("cancel");
  }

  get confirmButton(): HTMLButtonElement | null {
    return this.getElementByClass("confirm");
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
      if (newValue != null) {
        this.handleOpen(true);
      }
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
    this.dialog.addEventListener("close", this.handleEscapeClose);
    this.cancelButton?.addEventListener("click", this.handleClickClose);
    this.confirmButton?.addEventListener("click", this.handleClickClose);
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
    this.dialog.removeEventListener("close", this.handleEscapeClose);
    this.cancelButton?.removeEventListener("click", this.handleClickClose);
    this.confirmButton?.removeEventListener("click", this.handleClickClose);
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
    const el = e.target as HTMLElement;
    if (el === this.dialog && this.dismissable) {
      this.close("dismiss");
    }
  };

  protected async handleOpen(modal: boolean): Promise<void> {
    this.root.hidden = false;
    this.root.inert = false;
    this.setAttribute("loaded", "");
    if (modal) {
      this.dialog.showModal();
      lockBodyScrolling(this);
    } else {
      this.dialog.show();
    }

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

  protected handleClose = async (
    returnValue?: string
  ): Promise<string | undefined> => {
    this.dialog.inert = true;
    this.open = false;
    this.dispatchEvent(closingEvent);

    await animationsComplete(this.root);

    this.dialog.close();

    this.dispatchEvent(closedEvent);
    return returnValue;
  };

  protected handleEscapeClose = async (
    e: Event
  ): Promise<string | undefined> => {
    return this.handleClose("escape");
  };

  protected handleClickClose = async (
    e: Event
  ): Promise<string | undefined> => {
    const button = e.currentTarget as HTMLButtonElement;
    const returnValue = button?.getAttribute?.("id") ?? "";
    return this.handleClose(returnValue);
  };

  /**
   * Closes the dialog element.
   *
   * The argument, if provided, provides a return value.
   */
  async close(returnValue?: string): Promise<string | undefined> {
    return this.handleClose(returnValue);
  }

  /**
   * Displays the dialog element.
   */
  async show(): Promise<void> {
    return this.handleOpen(false);
  }

  /**
   * Displays the dialog element and prevents the user from interacting with anything behind the element.
   */
  async showModal(): Promise<void> {
    return this.handleOpen(true);
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
