import { getCssIcon } from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import { animationsComplete } from "../../utils/animationsComplete";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import spec from "./_dialog";

const CLOSING_EVENT = "closing";
const CLOSED_EVENT = "closed";
const OPENING_EVENT = "opening";
const OPENED_EVENT = "opened";
const REMOVED_EVENT = "removed";

const DEFAULT_TRANSFORMERS = {
  icon: getCssIcon,
};

/**
 * Dialogs, sometimes called "modals", appear above the page and require the user's immediate attention.
 */
export default class Dialog extends SparkleComponent(
  spec,
  DEFAULT_TRANSFORMERS,
) {
  override onAttributeChanged(name: string, newValue: string) {
    if (name === this.attrs.open) {
      if (newValue != null) {
        this.animateOpen(true);
      }
    }
    if (name === this.attrs.icon) {
      const icon = newValue;
      const iconEl = this.refs.icon;
      if (iconEl) {
        iconEl.hidden = icon == null;
      }
    }
    if (name === this.attrs.label) {
      const label = newValue;
      if (label) {
        this.setAssignedToSlot(label, "label");
      }
      const labelEl = this.refs.label;
      if (labelEl) {
        labelEl.hidden = label == null;
      }
    }
    if (name === this.attrs.cancel) {
      const cancel = newValue;
      if (cancel) {
        this.setAssignedToSlot(cancel, "cancel");
      }
      const cancelButton = this.refs.cancel;
      if (cancelButton) {
        cancelButton.hidden = cancel == null;
      }
    }
    if (name === this.attrs.confirm) {
      const confirm = newValue;
      if (confirm) {
        this.setAssignedToSlot(confirm, "confirm");
      }
      const confirmButton = this.refs.confirm;
      if (confirmButton) {
        confirmButton.hidden = confirm == null;
      }
    }
    if (name === this.attrs.loading) {
      if (newValue != null) {
        this.refs.confirm.setAttribute("loading", "");
      } else {
        this.refs.confirm.removeAttribute("loading");
      }
    }
  }

  override onConnected() {
    const icon = this.icon;
    const iconEl = this.refs.icon;
    if (iconEl) {
      iconEl.hidden = icon == null;
    }
    const label = this.label;
    const labelEl = this.refs.label;
    if (labelEl) {
      labelEl.hidden = label == null;
    }
    const cancel = this.cancel;
    const cancelButton = this.refs.cancel;
    if (cancelButton) {
      cancelButton.hidden = cancel == null;
    }
    const confirm = this.confirm;
    const confirmButton = this.refs.confirm;
    if (confirmButton) {
      confirmButton.hidden = confirm == null;
    }
    this.refs.dialog.addEventListener("click", this.handleLightDismiss);
    this.refs.dialog.addEventListener("cancel", this.handleCancel);
    this.refs.cancel.addEventListener("click", this.handleClickCancelButton);
    this.refs.confirm.addEventListener("click", this.handleClickConfirmButton);
    if (this.shadowRoot) {
      this.refs.labelSlot.addEventListener(
        "slotchange",
        this.handleLabelSlotAssigned,
      );
    } else {
      this.handleLabelChildrenAssigned(
        Array.from(this.refs.labelSlot.children || []),
      );
    }
    if (this.shadowRoot) {
      this.refs.cancelSlot.addEventListener(
        "slotchange",
        this.handleCancelSlotAssigned,
      );
    } else {
      this.handleCancelChildrenAssigned(
        Array.from(this.refs.cancelSlot.children || []),
      );
    }
    if (this.shadowRoot) {
      this.refs.confirmSlot.addEventListener(
        "slotchange",
        this.handleConfirmSlotAssigned,
      );
    } else {
      this.handleConfirmChildrenAssigned(
        Array.from(this.refs.confirmSlot.children || []),
      );
    }
    this.root.hidden = !this.open;
  }

  override onDisconnected() {
    this.refs.dialog.removeEventListener("click", this.handleLightDismiss);
    this.refs.dialog.removeEventListener("cancel", this.handleCancel);
    this.refs.cancel.removeEventListener("click", this.handleClickCancelButton);
    this.refs.confirm.removeEventListener(
      "click",
      this.handleClickConfirmButton,
    );
    if (this.shadowRoot) {
      this.refs.labelSlot.removeEventListener(
        "slotchange",
        this.handleLabelSlotAssigned,
      );
    }
    if (this.shadowRoot) {
      this.refs.cancelSlot.removeEventListener(
        "slotchange",
        this.handleCancelSlotAssigned,
      );
    }
    if (this.shadowRoot) {
      this.refs.confirmSlot.removeEventListener(
        "slotchange",
        this.handleConfirmSlotAssigned,
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
    if (el === this.refs.dialog && this.dismissable) {
      e.stopPropagation();
      this.close("dismiss");
    }
  };

  protected async animateOpen(modal: boolean): Promise<void> {
    this.root.hidden = false;
    this.root.inert = false;
    if (modal) {
      this.refs.dialog.showModal();
    } else {
      this.refs.dialog.show();
    }

    const focusTarget = this.root.querySelector<HTMLElement>("[focus]");

    if (focusTarget) {
      focusTarget.focus();
    } else {
      const cancelButton = this.refs.cancel;
      if (cancelButton) {
        cancelButton.focus();
      } else {
        this.root.querySelector("button")?.focus();
      }
    }

    await nextAnimationFrame();
    await nextAnimationFrame();

    this.setAttribute("loaded", "");

    this.emit(OPENING_EVENT);

    await animationsComplete(this.root);

    this.emit(OPENED_EVENT);
  }

  protected async animateClose(
    returnValue?: string,
  ): Promise<string | undefined> {
    this.refs.dialog.inert = true;
    this.open = false;
    this.emit(CLOSING_EVENT, returnValue);

    await animationsComplete(this.root);

    this.refs.dialog.close();

    this.emit(CLOSED_EVENT, returnValue);

    if (returnValue) {
      this.emit(returnValue);
    }

    return returnValue;
  }

  protected handleCancel = async (e: Event): Promise<string | undefined> => {
    e.preventDefault();
    e.stopPropagation();
    return this.animateClose("cancel");
  };

  protected handleClickCancelButton = async (
    e: Event,
  ): Promise<string | undefined> => {
    e.stopPropagation();
    return this.animateClose("cancel");
  };

  protected handleClickConfirmButton = async (
    e: Event,
  ): Promise<string | undefined> => {
    e.stopPropagation();
    return this.animateClose("confirm");
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
