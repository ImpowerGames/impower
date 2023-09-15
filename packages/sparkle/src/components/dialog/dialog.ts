import getCssIcon from "../../../../sparkle-style-transformer/src/utils/getCssIcon";
import STYLES from "../../../../spec-component/src/caches/STYLE_CACHE";
import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getKeys from "../../../../spec-component/src/utils/getKeys";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { IconName } from "../../types/iconName";
import { animationsComplete } from "../../utils/animationsComplete";
import spec from "./_dialog";

const CLOSING_EVENT = "closing";
const CLOSED_EVENT = "closed";
const OPENING_EVENT = "opening";
const OPENED_EVENT = "opened";
const REMOVED_EVENT = "removed";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  icon: (v: string) => getCssIcon(v, STYLES.icons),
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
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return spec.html({
      stores: this.stores,
      context: this.context,
      state: this.state,
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

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  /**
   * Indicates whether or not the dialog is open. You can toggle this attribute to show and hide the dialog, or you can
   * use the `show()` and `hide()` methods and this attribute will reflect the dialog's open state.
   */
  get open(): boolean {
    return this.getBooleanAttribute(Dialog.attrs.open);
  }
  set open(value: boolean) {
    this.setBooleanAttribute(Dialog.attrs.open, value);
  }

  /**
   * Indicates whether or not the dialog can be dismissed by clicking the backdrop behind it.
   */
  get dismissable(): boolean {
    return this.getBooleanAttribute(Dialog.attrs.dismissable);
  }
  set dismissable(value) {
    this.setStringAttribute(Dialog.attrs.dismissable, value);
  }

  /**
   * The name of the icon to display.
   */
  get icon(): IconName | string | null {
    return this.getStringAttribute(Dialog.attrs.icon);
  }
  set icon(value) {
    this.setStringAttribute(Dialog.attrs.icon, value);
  }

  /**
   * The title text.
   */
  get label(): string | null {
    return this.getStringAttribute(Dialog.attrs.label);
  }
  set label(value) {
    this.setStringAttribute(Dialog.attrs.label, value);
  }

  /**
   * The cancel text.
   */
  get cancel(): string | null {
    return this.getStringAttribute(Dialog.attrs.cancel);
  }
  set cancel(value) {
    this.setStringAttribute(Dialog.attrs.cancel, value);
  }

  /**
   * The confirm text.
   */
  get confirm(): string | null {
    return this.getStringAttribute(Dialog.attrs.confirm);
  }
  set confirm(value) {
    this.setStringAttribute(Dialog.attrs.confirm, value);
  }

  override onAttributeChanged(name: string, newValue: string) {
    if (name === Dialog.attrs.open) {
      if (newValue != null) {
        this.animateOpen(true);
      }
    }
    if (name === Dialog.attrs.icon) {
      const icon = newValue;
      const iconEl = this.ref.icon;
      if (iconEl) {
        iconEl.hidden = icon == null;
      }
    }
    if (name === Dialog.attrs.label) {
      const label = newValue;
      if (label) {
        this.setAssignedToSlot(label, "label");
      }
      const labelEl = this.ref.label;
      if (labelEl) {
        labelEl.hidden = label == null;
      }
    }
    if (name === Dialog.attrs.cancel) {
      const cancel = newValue;
      if (cancel) {
        this.setAssignedToSlot(cancel, "cancel");
      }
      const cancelButton = this.ref.cancel;
      if (cancelButton) {
        cancelButton.hidden = cancel == null;
      }
    }
    if (name === Dialog.attrs.confirm) {
      const confirm = newValue;
      if (confirm) {
        this.setAssignedToSlot(confirm, "confirm");
      }
      const confirmButton = this.ref.confirm;
      if (confirmButton) {
        confirmButton.hidden = confirm == null;
      }
    }
  }

  override onConnected() {
    const icon = this.icon;
    const iconEl = this.ref.icon;
    if (iconEl) {
      iconEl.hidden = icon == null;
    }
    const label = this.label;
    const labelEl = this.ref.label;
    if (labelEl) {
      labelEl.hidden = label == null;
    }
    const cancel = this.cancel;
    const cancelButton = this.ref.cancel;
    if (cancelButton) {
      cancelButton.hidden = cancel == null;
    }
    const confirm = this.confirm;
    const confirmButton = this.ref.confirm;
    if (confirmButton) {
      confirmButton.hidden = confirm == null;
    }
    this.ref.dialog.addEventListener("click", this.handleLightDismiss);
    this.ref.dialog.addEventListener("cancel", this.handleCancel);
    this.ref.cancel.addEventListener("click", this.handleClickClose);
    this.ref.confirm.addEventListener("click", this.handleClickClose);
    if (this.shadowRoot) {
      this.ref.labelSlot.addEventListener(
        "slotchange",
        this.handleLabelSlotAssigned
      );
    } else {
      this.handleLabelChildrenAssigned(
        Array.from(this.ref.labelSlot.children || [])
      );
    }
    if (this.shadowRoot) {
      this.ref.cancelSlot.addEventListener(
        "slotchange",
        this.handleCancelSlotAssigned
      );
    } else {
      this.handleCancelChildrenAssigned(
        Array.from(this.ref.cancelSlot.children || [])
      );
    }
    if (this.shadowRoot) {
      this.ref.confirmSlot.addEventListener(
        "slotchange",
        this.handleConfirmSlotAssigned
      );
    } else {
      this.handleConfirmChildrenAssigned(
        Array.from(this.ref.confirmSlot.children || [])
      );
    }
  }

  override onParsed() {
    this.root.hidden = !this.open;
  }

  override onDisconnected() {
    this.ref.dialog.removeEventListener("click", this.handleLightDismiss);
    this.ref.dialog.removeEventListener("cancel", this.handleCancel);
    this.ref.cancel.removeEventListener("click", this.handleClickClose);
    this.ref.confirm.removeEventListener("click", this.handleClickClose);
    if (this.shadowRoot) {
      this.ref.labelSlot.removeEventListener(
        "slotchange",
        this.handleLabelSlotAssigned
      );
    }
    if (this.shadowRoot) {
      this.ref.cancelSlot.removeEventListener(
        "slotchange",
        this.handleCancelSlotAssigned
      );
    }
    if (this.shadowRoot) {
      this.ref.confirmSlot.removeEventListener(
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
    if (el === this.ref.dialog && this.dismissable) {
      e.stopPropagation();
      this.close("dismiss");
    }
  };

  protected async animateOpen(modal: boolean): Promise<void> {
    this.root.hidden = false;
    this.root.inert = false;
    this.setAttribute("loaded", "");
    if (modal) {
      this.ref.dialog.showModal();
    } else {
      this.ref.dialog.show();
    }

    const focusTarget = this.root.querySelector<HTMLElement>("[focus]");

    if (focusTarget) {
      focusTarget.focus();
    } else {
      const cancelButton = this.ref.cancel;
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

  protected async animateClose(
    returnValue?: string
  ): Promise<string | undefined> {
    this.ref.dialog.inert = true;
    this.open = false;
    this.emit(CLOSING_EVENT);

    await animationsComplete(this.root);

    this.ref.dialog.close();

    this.emit(CLOSED_EVENT);
    return returnValue;
  }

  protected handleCancel = async (e: Event): Promise<string | undefined> => {
    e.preventDefault();
    e.stopPropagation();
    return this.animateClose("cancel");
  };

  protected handleClickClose = async (
    e: Event
  ): Promise<string | undefined> => {
    e.stopPropagation();
    const button = e.currentTarget as HTMLButtonElement;
    const returnValue = button?.getAttribute?.("id") ?? "";
    return this.animateClose(returnValue);
  };

  /**
   * Closes the dialog element.
   *
   * The argument, if provided, provides a return value.
   */
  async close(returnValue?: string): Promise<string | undefined> {
    return this.animateClose(returnValue);
  }

  /**
   * Displays the dialog element.
   */
  async show(): Promise<void> {
    return this.animateOpen(false);
  }

  /**
   * Displays the dialog element and prevents the user from interacting with anything behind the element.
   */
  async showModal(): Promise<void> {
    return this.animateOpen(true);
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
