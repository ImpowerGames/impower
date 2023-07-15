import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import getDependencyNameMap from "../../../../spark-element/src/utils/getDependencyNameMap";
import { DEFAULT_SPARKLE_ATTRIBUTES } from "../../core/sparkle-element";
import { animationsComplete } from "../../utils/animationsComplete";
import {
  lockBodyScrolling,
  unlockBodyScrolling,
} from "../../utils/bodyScrolling";
import { waitForEvent } from "../../utils/events";
import { navEndKey } from "../../utils/navEndKey";
import { navNextKey } from "../../utils/navNextKey";
import { navPrevKey } from "../../utils/navPrevKey";
import { navStartKey } from "../../utils/navStartKey";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import Option from "../option/option";
import Popup from "../popup/popup";
import css from "./dropdown.css";
import html from "./dropdown.html";

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
    "sync",
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
  static override tagName = "s-dropdown";

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
    return Dropdown.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  override get css() {
    return Dropdown.augmentCss(css, DEFAULT_DEPENDENCIES);
  }

  /**
   * The value of the active option.
   */
  get active(): string | null {
    return this.getStringAttribute(Dropdown.attributes.active);
  }
  set active(value) {
    this.setStringAttribute(Dropdown.attributes.active, value);
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
    return this.getStringAttribute(Dropdown.attributes.placement) || "bottom";
  }

  override get strategy(): "absolute" | "fixed" {
    return this.getStringAttribute(Popup.attributes.strategy) || "fixed";
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

  protected _pointerDownOnAnyOption?: boolean;

  protected _activatingValue: string | null = null;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    const popupEl = this.popupEl;
    if (name === Dropdown.attributes.open) {
      const open = newValue != null;
      if (popupEl) {
        popupEl.setAttribute(
          Dropdown.attributes.ariaLive,
          open ? "polite" : "off"
        );
      }
      if (open) {
        this.handleOpen();
      } else {
        this.handleClose();
      }
    }
    if (
      name === Dropdown.attributes.distance ||
      name === Dropdown.attributes.placement ||
      name === Dropdown.attributes.skidding
    ) {
      this.reposition();
    }
    if (name === Dropdown.attributes.disabled) {
      if (this.disabled && this.open) {
        this.hide();
      }
    }
  }

  protected override onConnected(): void {
    this._activatingValue = this.active;
    this.dialogEl.addEventListener("click", this.handleLightDismiss);
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("keydown", this.handleKeyDown);
  }

  protected override onParsed(): void {
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

  protected override onDisconnected(): void {
    this.dialogEl.addEventListener("click", this.handleLightDismiss);
    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("keydown", this.handleKeyDown);
  }

  protected handleLightDismiss = (e: Event) => {
    const el = e.target as HTMLElement;
    if (el === this.dialogEl) {
      this.hide();
    }
  };

  private handleClick = (): void => {
    if (this.open) {
      this.hide();
    } else {
      this.show();
    }
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    // Pressing escape when the target element has focus should dismiss the dropdown
    if (this.open && event.key === "Escape") {
      event.stopPropagation();
      this.hide();
    }
  };

  protected async handleOpen(): Promise<void> {
    if (this.disabled) {
      return;
    }

    this.dialogEl.showModal();
    lockBodyScrolling(this);

    this.start();

    const el = this.popupEl;
    if (el) {
      el.hidden = false;
      el.inert = false;
    }

    this.emit(OPENING_EVENT);

    await animationsComplete(el);

    this.emit(OPENED_EVENT);
  }

  async handleClose(): Promise<void> {
    const el = this.popupEl;
    if (el) {
      el.inert = true;
    }

    this.emit(CLOSING_EVENT);

    await animationsComplete(el);

    if (el) {
      el.hidden = true;
    }

    this.dialogEl.close();
    unlockBodyScrolling(this);

    this.stop();

    this.emit(CLOSED_EVENT);
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

  async activateOption(option: Option, animate: boolean): Promise<void> {
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
    const detail = { oldRect, newRect, value: newValue };

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

  async updateOptions(animate: boolean): Promise<void> {
    await Promise.all(
      this.options.map((option) => {
        if (this._activatingValue === option.value) {
          return this.activateOption(option, animate);
        } else {
          return this.deactivateOption(option);
        }
      })
    );
  }

  bindOptions(): void {
    this.options.forEach((option) => {
      option.root.addEventListener(
        "pointerdown",
        this.handlePointerDownOption,
        {
          passive: true,
        }
      );
      option.root.addEventListener(
        "pointerenter",
        this.handlePointerEnterOption,
        {
          passive: true,
        }
      );
      option.root.addEventListener("keydown", this.handleKeyDownOption, {
        passive: true,
      });
      option.root.addEventListener("click", this.handleClickOption, {
        passive: true,
      });
      window.addEventListener("pointerup", this.handlePointerUp, {
        passive: true,
      });
    });
  }

  unbindOptions(): void {
    this.options.forEach((option) => {
      option.root.removeEventListener(
        "pointerdown",
        this.handlePointerDownOption
      );
      option.root.removeEventListener(
        "pointerenter",
        this.handlePointerEnterOption
      );
      option.root.removeEventListener("keydown", this.handleKeyDownOption);
      option.root.removeEventListener("click", this.handleClickOption);
      window.removeEventListener("pointerup", this.handlePointerUp);
    });
  }

  focusOption(option: Option, activate: boolean) {
    for (var i = 0; i < this.options.length; i += 1) {
      var t = this.options[i];
      if (t === option) {
        option.focus();
        if (activate) {
          this._activatingValue = option.value;
          this.updateOptions(true);
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

  handlePointerDownOption = (e: PointerEvent): void => {
    this._pointerDownOnAnyOption = true;
  };

  handlePointerEnterOption = (e: PointerEvent): void => {
    if (e.currentTarget instanceof HTMLElement) {
      const option = (e.currentTarget.getRootNode() as ShadowRoot)
        ?.host as Option;
      if (this._pointerDownOnAnyOption) {
        this._activatingValue = option.value;
        this.updateOptions(true);
      }
    }
  };

  handlePointerUp = (e: PointerEvent): void => {
    this._pointerDownOnAnyOption = false;
  };

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
      this._activatingValue = option.value;
      this.updateOptions(true);
    }
  };

  protected setupOptions(children: Element[]): void {
    this.unbindOptions();
    this._options = children.filter(
      (el) => el.tagName.toLowerCase() === Dropdown.dependencies.option
    ) as Option[];
    this.bindOptions();
    this.updateOptions(false);
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
