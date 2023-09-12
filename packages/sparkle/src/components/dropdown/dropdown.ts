import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getDependencyNameMap from "../../../../spec-component/src/utils/getDependencyNameMap";
import { DEFAULT_SPARKLE_ATTRIBUTES } from "../../core/sparkle-element";
import { animationsComplete } from "../../utils/animationsComplete";
import { waitForEvent } from "../../utils/events";
import { navEndKey } from "../../utils/navEndKey";
import { navNextKey } from "../../utils/navNextKey";
import { navPrevKey } from "../../utils/navPrevKey";
import { navStartKey } from "../../utils/navStartKey";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import Option from "../option/option";
import Popup from "../popup/popup";
import spec from "./_dropdown";

const CLOSING_EVENT = "closing";
const CLOSED_EVENT = "closed";
const OPENING_EVENT = "opening";
const OPENED_EVENT = "opened";
const CHANGING_EVENT = "changing";
const CHANGED_EVENT = "changed";

const DEFAULT_DEPENDENCIES = getDependencyNameMap(["s-option"]);

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "key",
    "active",
    "open",
    "anchor",
    "placement",
    "strategy",
    "distance",
    "skidding",
    "arrow",
    "arrow-placement",
    "arrow-padding",
    "disable-auto-flip",
    "flip-fallback-placements",
    "flip-fallback-strategy",
    "flip-boundary",
    "flip-padding",
    "disable-auto-shift",
    "shift-boundary",
    "shift-padding",
    "auto-size",
    "sync-size",
    "auto-size-boundary",
    "auto-size-padding",
  ]),
};

/**
 * Dropdowns display additional information based on a specific action.
 */
export default class Dropdown
  extends Popup
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return spec.html({ props: this.props, state: this.state });
  }

  override get css() {
    return spec.css;
  }

  static override get dependencies() {
    return DEFAULT_DEPENDENCIES;
  }

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  /**
   * Key that is included in all emitted events.
   */
  get key(): string | null {
    return this.getStringAttribute(Dropdown.attrs.key);
  }
  set key(value) {
    this.setStringAttribute(Dropdown.attrs.key, value);
  }

  /**
   * The value of the active option.
   */
  get active(): string | null {
    return this.getStringAttribute(Dropdown.attrs.active);
  }
  set active(value) {
    this.setStringAttribute(Dropdown.attrs.active, value);
  }

  override get placement():
    | "top"
    | "top-start"
    | "top-end"
    | "bottom"
    | "bottom-start"
    | "bottom-end"
    | "right"
    | "right-start"
    | "right-end"
    | "left"
    | "left-start"
    | "left-end" {
    return this.getStringAttribute(Dropdown.attrs.placement) || "bottom";
  }

  override get strategy(): "absolute" | "fixed" {
    return this.getStringAttribute(Popup.attrs.strategy) || "fixed";
  }

  get optionsSlot(): HTMLSlotElement | null {
    return this.getSlotByName("options");
  }

  get dialogEl(): HTMLDialogElement {
    return this.getElementByTag("dialog") as HTMLDialogElement;
  }

  protected _options: Option[] = [];
  get options(): Option[] {
    return this._options;
  }

  protected _activatingValue: string | null = null;

  override onAttributeChanged(name: string, newValue: string): void {
    const popupEl = this.popupEl;
    if (name === Dropdown.attrs.open) {
      const open = newValue != null;
      if (popupEl) {
        popupEl.setAttribute(Dropdown.attrs.ariaLive, open ? "polite" : "off");
      }
      if (open) {
        this.animateOpen();
      } else {
        this.animateClose();
      }
    }
    if (
      name === Dropdown.attrs.distance ||
      name === Dropdown.attrs.placement ||
      name === Dropdown.attrs.skidding
    ) {
      this.reposition();
    }
    if (name === Dropdown.attrs.disabled) {
      if (this.disabled && this.open) {
        this.hide();
      }
    }
  }

  override onConnected(): void {
    this._activatingValue = this.active;
    this.dialogEl.addEventListener("click", this.handleLightDismiss);
    this.dialogEl.addEventListener("cancel", this.handleCancel);
    this.root.addEventListener("click", this.handleClick);
  }

  override onParsed(): void {
    const popupEl = this.popupEl;
    if (popupEl) {
      popupEl.hidden = !this.open;
    }
    // If the dropdown is visible on init, update its position
    if (this.open) {
      this.reposition();
    }
    if (this.optionsSlot) {
      this.setupOptions(this.optionsSlot.assignedElements({ flatten: true }));
    }
  }

  override onDisconnected(): void {
    this.dialogEl.removeEventListener("click", this.handleLightDismiss);
    this.dialogEl.removeEventListener("cancel", this.handleCancel);
    this.root.removeEventListener("click", this.handleClick);
  }

  protected handleLightDismiss = (e: Event) => {
    e.stopPropagation();
    const el = e.target as HTMLElement;
    if (el === this.dialogEl) {
      this.hide();
    }
  };

  private handleClick = (e: Event): void => {
    e.stopPropagation();
    if (this.open) {
      this.hide();
    } else {
      this.show();
    }
  };

  private handleCancel = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    this.hide();
  };

  protected async animateOpen(): Promise<void> {
    if (this.disabled) {
      return;
    }

    const dialogEl = this.dialogEl;

    dialogEl.style.visibility = "hidden";
    dialogEl.showModal();

    this.start();

    dialogEl.hidden = false;
    dialogEl.inert = false;

    await nextAnimationFrame();

    dialogEl.style.visibility = "visible";

    this.emit(OPENING_EVENT, { key: this.key });

    await animationsComplete(dialogEl);

    this.emit(OPENED_EVENT, { key: this.key });
  }

  async animateClose(): Promise<void> {
    const el = this.popupEl;
    if (el) {
      el.inert = true;
    }

    this.emit(CLOSING_EVENT, { key: this.key });

    await animationsComplete(el);

    if (el) {
      el.hidden = true;
    }

    this.dialogEl.close();

    this.stop();

    this.emit(CLOSED_EVENT, { key: this.key });
  }

  /** Shows the dropdown. */
  async show(): Promise<void> {
    if (this.open) {
      return undefined;
    }
    this.open = true;
    return waitForEvent(this, "opened");
  }

  /** Hides the dropdown */
  async hide(): Promise<void> {
    if (!this.open) {
      return undefined;
    }
    this.open = false;
    return waitForEvent(this, "closed");
  }

  override focus(options?: FocusOptions): void {
    const content = this.contentSlot?.assignedElements()?.[0];
    if (content instanceof HTMLElement) {
      content.focus(options);
    }
  }

  override blur(): void {
    const content = this.contentSlot?.assignedElements()?.[0];
    if (content instanceof HTMLElement) {
      content.blur();
    }
  }

  async activateOption(option: Option): Promise<void> {
    const oldOption = this.options.find((option) => option.active);
    const newValue = option.value;
    const changed = this.active !== newValue;
    this.active = newValue;

    if (oldOption === option) {
      return;
    }

    await nextAnimationFrame();
    if (this.interrupted(newValue)) {
      return;
    }

    const oldRect = oldOption?.root?.getBoundingClientRect();
    const newRect = option?.root?.getBoundingClientRect();
    const detail = { key: this.key, oldRect, newRect, value: newValue };

    if (changed) {
      this.emit(CHANGING_EVENT, detail);
    }

    if (oldOption) {
      oldOption.active = false;
    }
    option.active = true;

    await animationsComplete(
      option.root,
      option.labelEl,
      option.iconEl,
      option.inactiveIconEl,
      option.activeIconEl
    );
    if (this.interrupted(newValue)) {
      return;
    }

    await this.hide();

    if (changed) {
      this.emit(CHANGED_EVENT, detail);
    }
  }

  interrupted(newValue: string | null): boolean {
    return this._activatingValue !== newValue;
  }

  async deactivateOption(option: Option): Promise<void> {
    option.active = false;
  }

  async updateOptions(): Promise<void> {
    if (this.active != null) {
      await Promise.all(
        this.options.map((option) => {
          if (this._activatingValue === option.value) {
            return this.activateOption(option);
          } else {
            return this.deactivateOption(option);
          }
        })
      );
    } else {
      const detail = { key: this.key, value: this._activatingValue };
      this.emit(CHANGING_EVENT, detail);
      await this.hide();
      this.emit(CHANGED_EVENT, detail);
    }
  }

  bindOptions(): void {
    this.options.forEach((option) => {
      option.root.addEventListener("keydown", this.handleKeyDownOption, {
        passive: true,
      });
      option.root.addEventListener("click", this.handleClickOption, {
        passive: true,
      });
    });
  }

  unbindOptions(): void {
    this.options.forEach((option) => {
      option.root.removeEventListener("keydown", this.handleKeyDownOption);
      option.root.removeEventListener("click", this.handleClickOption);
    });
  }

  focusOption(option: Option, activate: boolean) {
    for (var i = 0; i < this.options.length; i += 1) {
      var t = this.options[i];
      if (t === option) {
        option.focus();
        if (activate) {
          this._activatingValue = option.value;
          this.updateOptions();
        }
      }
    }
  }

  focusPreviousOption(option: Option, activate: boolean) {
    const firstOption = this.options[0];
    const lastOption = this.options[this.options.length - 1];
    if (option === firstOption) {
      if (lastOption) {
        this.focusOption(lastOption, activate);
      }
    } else {
      const index = this.options.indexOf(option);
      const prevOption = this.options[index - 1];
      if (prevOption) {
        this.focusOption(prevOption, activate);
      }
    }
  }

  focusNextOption(option: Option, activate: boolean) {
    const firstOption = this.options[0];
    const lastOption = this.options[this.options.length - 1];
    if (option === lastOption) {
      if (firstOption) {
        this.focusOption(firstOption, activate);
      }
    } else {
      const index = this.options.indexOf(option);
      const nextOption = this.options[index + 1];
      if (nextOption) {
        this.focusOption(nextOption, activate);
      }
    }
  }

  handleKeyDownOption = (e: KeyboardEvent): void => {
    if (e.currentTarget instanceof HTMLElement) {
      const option = (e.currentTarget.getRootNode() as ShadowRoot)
        ?.host as Option;
      const dir = "column";
      switch (e.key) {
        case navPrevKey(dir):
          {
            this.focusPreviousOption(option, true);
          }
          break;
        case navNextKey(dir):
          {
            this.focusNextOption(option, true);
          }
          break;
        case navStartKey():
          {
            const firstOption = this.options[0];
            if (firstOption) {
              this.focusOption(firstOption, true);
            }
          }
          break;
        case navEndKey():
          {
            const lastOption = this.options[this.options.length - 1];
            if (lastOption) {
              this.focusOption(lastOption, true);
            }
          }
          break;
        default:
          break;
      }
    }
  };

  handleClickOption = (e: MouseEvent): void => {
    if (e.currentTarget instanceof HTMLElement) {
      const option = (e.currentTarget.getRootNode() as ShadowRoot)
        ?.host as Option;
      if (option.type !== "toggle") {
        this._activatingValue = option.value;
        this.updateOptions();
      }
    }
  };

  protected setupOptions(children: Element[]): void {
    this.unbindOptions();
    this._options = children.filter(
      (el) => el.tagName.toLowerCase() === Dropdown.dependencies.option
    ) as Option[];
    this.bindOptions();
    this.updateOptions();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-dropdown": Dropdown;
  }
  interface HTMLElementEventMap {
    closing: CustomEvent;
    closed: CustomEvent;
    opening: CustomEvent;
    opened: CustomEvent;
    changing: CustomEvent;
    changed: CustomEvent;
  }
}
