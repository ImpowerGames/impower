import getCssIcon from "../../../../sparkle-style-transformer/src/utils/getCssIcon";
import Icons from "../../configs/icons";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { IconName } from "../../types/iconName";
import { Properties } from "../../types/properties";
import { animationsComplete } from "../../utils/animationsComplete";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getDependencyNameMap } from "../../utils/getDependencyNameMap";
import { getKeys } from "../../utils/getKeys";
import { lockBodyScrolling, unlockBodyScrolling } from "../../utils/scroll";
import css from "./dialog.css";
import html from "./dialog.html";

const CLOSING_EVENT = "closing";
const CLOSED_EVENT = "closed";
const OPENING_EVENT = "opening";
const OPENED_EVENT = "opened";
const REMOVED_EVENT = "removed";

const DEFAULT_DEPENDENCIES = getDependencyNameMap(["s-icon"]);

export const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  icon: (v: string) => getCssIcon(v, Icons.all()),
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "open",
    "dismissable",
    "label",
    "cancel",
    "confirm",
    ...getKeys(DEFAULT_TRANSFORMERS),
  ]),
};

/**
 * Dialogs, sometimes called "modals", appear above the page and require the user's immediate attention.
 */
export default class Dialog
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-dialog";

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

  override get html() {
    return Dialog.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  override get css() {
    return Dialog.augmentCss(css, DEFAULT_DEPENDENCIES);
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  /**
   * Indicates whether or not the dialog is open. You can toggle this attribute to show and hide the dialog, or you can
   * use the `show()` and `hide()` methods and this attribute will reflect the dialog's open state.
   */
  get open(): boolean {
    return this.getBooleanAttribute(Dialog.attributes.open);
  }
  set open(value: boolean) {
    this.setBooleanAttribute(Dialog.attributes.open, value);
  }

  /**
   * Indicates whether or not the dialog can be dismissed by clicking the backdrop behind it.
   */
  get dismissable(): boolean {
    return this.getBooleanAttribute(Dialog.attributes.dismissable);
  }
  set dismissable(value) {
    this.setStringAttribute(Dialog.attributes.dismissable, value);
  }

  /**
   * The name of the icon to display.
   */
  get icon(): IconName | string | null {
    return this.getStringAttribute(Dialog.attributes.icon);
  }
  set icon(value) {
    this.setStringAttribute(Dialog.attributes.icon, value);
  }

  /**
   * The title text.
   */
  get label(): string | null {
    return this.getStringAttribute(Dialog.attributes.label);
  }
  set label(value) {
    this.setStringAttribute(Dialog.attributes.label, value);
  }

  /**
   * The cancel text.
   */
  get cancel(): string | null {
    return this.getStringAttribute(Dialog.attributes.cancel);
  }
  set cancel(value) {
    this.setStringAttribute(Dialog.attributes.cancel, value);
  }

  /**
   * The confirm text.
   */
  get confirm(): string | null {
    return this.getStringAttribute(Dialog.attributes.confirm);
  }
  set confirm(value) {
    this.setStringAttribute(Dialog.attributes.confirm, value);
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
    return this.getElementByClass("label-slot");
  }

  get cancelSlot(): HTMLSlotElement | null {
    return this.getElementByClass("cancel-slot");
  }

  get confirmSlot(): HTMLSlotElement | null {
    return this.getElementByClass("confirm-slot");
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Dialog.attributes.open) {
      if (newValue != null) {
        this.handleOpen(true);
      }
    }
    if (name === Dialog.attributes.icon) {
      const icon = newValue;
      const iconEl = this.iconEl;
      if (iconEl) {
        iconEl.hidden = icon == null;
      }
    }
    if (name === Dialog.attributes.label) {
      const label = newValue;
      if (label) {
        this.setAssignedToSlot(label, "label");
      }
      const labelEl = this.labelEl;
      if (labelEl) {
        labelEl.hidden = label == null;
      }
    }
    if (name === Dialog.attributes.cancel) {
      const cancel = newValue;
      if (cancel) {
        this.setAssignedToSlot(cancel, "cancel");
      }
      const cancelButton = this.cancelButton;
      if (cancelButton) {
        cancelButton.hidden = cancel == null;
      }
    }
    if (name === Dialog.attributes.confirm) {
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
    if (this.shadowRoot) {
      this.labelSlot?.addEventListener(
        "slotchange",
        this.handleLabelSlotAssigned
      );
    } else {
      this.handleLabelChildrenAssigned(
        Array.from(this.labelSlot?.children || [])
      );
    }
    if (this.shadowRoot) {
      this.cancelSlot?.addEventListener(
        "slotchange",
        this.handleCancelSlotAssigned
      );
    } else {
      this.handleCancelChildrenAssigned(
        Array.from(this.cancelSlot?.children || [])
      );
    }
    if (this.shadowRoot) {
      this.confirmSlot?.addEventListener(
        "slotchange",
        this.handleConfirmSlotAssigned
      );
    } else {
      this.handleConfirmChildrenAssigned(
        Array.from(this.confirmSlot?.children || [])
      );
    }
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
    if (this.shadowRoot) {
      this.labelSlot?.removeEventListener(
        "slotchange",
        this.handleLabelSlotAssigned
      );
    }
    if (this.shadowRoot) {
      this.cancelSlot?.removeEventListener(
        "slotchange",
        this.handleCancelSlotAssigned
      );
    }
    if (this.shadowRoot) {
      this.confirmSlot?.removeEventListener(
        "slotchange",
        this.handleConfirmSlotAssigned
      );
    }
    this.emit(REMOVED_EVENT);
  }

  protected handleLabelSlotAssigned = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    this.handleLabelChildrenAssigned(slot.assignedElements());
  };

  protected handleLabelChildrenAssigned(children: Element[]) {
    if (children.length > 0) {
      if (this.label == null) {
        this.setAttribute("label", "");
      }
    }
  }

  protected handleCancelSlotAssigned = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    this.handleCancelChildrenAssigned(slot.assignedElements());
  };

  protected handleCancelChildrenAssigned(children: Element[]) {
    if (children.length > 0) {
      if (this.cancel == null) {
        this.setAttribute("cancel", "");
      }
    }
  }

  protected handleConfirmSlotAssigned = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    this.handleCancelChildrenAssigned(slot.assignedElements());
  };

  protected handleConfirmChildrenAssigned(children: Element[]) {
    if (children.length > 0) {
      if (this.confirm == null) {
        this.setAttribute("confirm", "");
      }
    }
  }

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

    this.emit(OPENING_EVENT);

    await animationsComplete(this.root);

    this.emit(OPENED_EVENT);
  }

  protected handleClose = async (
    returnValue?: string
  ): Promise<string | undefined> => {
    this.dialog.inert = true;
    this.open = false;
    this.emit(CLOSING_EVENT);

    await animationsComplete(this.root);

    this.dialog.close();

    this.emit(CLOSED_EVENT);
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
    closing: CustomEvent;
    closed: CustomEvent;
    opening: CustomEvent;
    opened: CustomEvent;
    removed: CustomEvent;
  }
}
