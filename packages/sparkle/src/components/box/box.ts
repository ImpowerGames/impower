import { SparkleComponent } from "../../core/sparkle-component";
import { animationsComplete } from "../../utils/animationsComplete";
import { waitForEvent } from "../../utils/events";
import { navEndKey } from "../../utils/navEndKey";
import { navNextKey } from "../../utils/navNextKey";
import { navPrevKey } from "../../utils/navPrevKey";
import { navStartKey } from "../../utils/navStartKey";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import Button from "../button/button";
import spec from "./_box";

const CLOSING_EVENT = "closing";
const CLOSED_EVENT = "closed";
const OPENING_EVENT = "opening";
const OPENED_EVENT = "opened";
const CHANGING_EVENT = "changing";
const CHANGED_EVENT = "changed";

/**
 * Boxes are basic surfaces for styling and laying out content.
 */
export default class Box extends SparkleComponent(spec) {
  protected _options: Button[] = [];
  get options(): Button[] {
    return this._options;
  }

  protected _activatingValue: string | null = null;

  protected _triggers: string[] = [];
  get triggers() {
    return this._triggers;
  }

  get anchorEl() {
    const rootNode = this.getRootNode();
    const root =
      rootNode instanceof ShadowRoot
        ? rootNode
        : rootNode instanceof HTMLElement
          ? (rootNode.shadowRoot ?? document)
          : document;
    const anchorId = this.getAttribute("anchor-to");
    if (anchorId) {
      const el = root.querySelector(`[${this.attrs.anchorId}='${anchorId}']`);
      return el;
    }
    return null;
  }

  override onAttributeChanged(name: string, newValue: string) {
    if (name === this.attrs.open) {
      const open = newValue != null;
      if (this) {
        this.setAttribute(this.attrs.ariaLive, open ? "polite" : "off");
      }
      if (open) {
        this.animateOpen();
      } else {
        this.animateClose();
      }
    }
    if (name === this.attrs.anchorInteraction) {
      this.updateTriggers();
    }
    if (name === this.attrs.disabled) {
      if (this.disabled && this.open && this.anchorInteraction) {
        this.hide();
      }
    }
  }

  override onConnected() {
    this._activatingValue = this.active;
    this.updateTriggers();
    const anchorEl = this.anchorEl;
    if (anchorEl) {
      anchorEl.addEventListener("click", this.handleClick);
      anchorEl.addEventListener("mouseover", this.handleHoverOn);
      anchorEl.addEventListener("mouseout", this.handleHoverOff);
      anchorEl.addEventListener("focus", this.handleFocus, true);
      anchorEl.addEventListener("blur", this.handleBlur, true);
    }
    document.addEventListener("click", this.handleOutsideClick);
    document.addEventListener("keydown", this.handleEscapeKey);
    document.addEventListener("opening", this.handleOtherOpening);
    if (this.anchorTo && this.anchorInteraction) {
      this.hidden = !this.open;
    }
  }

  override onDisconnected() {
    const anchorEl = this.anchorEl;
    if (anchorEl) {
      anchorEl.removeEventListener("click", this.handleClick);
      anchorEl.removeEventListener("mouseover", this.handleHoverOn);
      anchorEl.removeEventListener("mouseout", this.handleHoverOff);
      anchorEl.removeEventListener("focus", this.handleFocus, true);
      anchorEl.removeEventListener("blur", this.handleBlur, true);
    }
    document.removeEventListener("click", this.handleOutsideClick);
    document.removeEventListener("keydown", this.handleEscapeKey);
    document.removeEventListener("opening", this.handleOtherOpening);
  }

  override propagateAttribute(name: string, value: string): void {
    super.propagateAttribute(name, value);
    if (name === this.attrs.anchorTo) {
      this.setAttribute("popover", "manual");
    }
  }

  override onParsed() {
    this.setupOptions(Array.from(this.querySelectorAll(this.selectors.option)));
    this.updateTriggers();
  }

  protected handleOutsideClick = (e: Event) => {
    if (this.triggers.includes("click")) {
      if (!this.open) return;

      const path = e.composedPath();

      const clickedInsideBox = path.includes(this);

      const clickedOnAnchor = this.anchorEl && path.includes(this.anchorEl);

      if (!clickedInsideBox && !clickedOnAnchor) {
        this.hide();
      }
    }
  };

  protected handleEscapeKey = (e: KeyboardEvent) => {
    if (this.open && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
    }
  };

  protected handleOtherOpening = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (
        e.detail &&
        e.detail.instance instanceof Box &&
        JSON.stringify(e.detail.instance.triggers) ===
          JSON.stringify(this.triggers) &&
        e.detail.instance !== this &&
        this.open
      ) {
        this.hide();
      }
    }
  };

  private handleClick = (e: Event) => {
    if (this.triggers.includes("click")) {
      e.stopPropagation();
      if (this.open) {
        this.hide();
      } else {
        this.show();
      }
    }
  };

  private handleHoverOn = (e: Event) => {
    if (this.triggers.includes("hover")) {
      this.show();
    }
  };

  private handleHoverOff = (e: Event) => {
    if (this.triggers.includes("hover")) {
      this.hide();
    }
  };

  private handleFocus = (e: Event) => {
    if (this.triggers.includes("focus")) {
      this.show();
    }
  };

  private handleBlur = (e: Event) => {
    if (this.triggers.includes("focus")) {
      this.hide();
    }
  };

  protected async animateOpen(): Promise<void> {
    if (this.disabled) {
      return;
    }

    const el = this;
    if (!el) {
      return;
    }

    el.inert = true;
    el.hidden = false;

    el.showPopover();

    el.setAttribute("anchored", "");

    this.emit(OPENING_EVENT, { key: this.key, instance: this });

    await animationsComplete(el);

    this.emit(OPENED_EVENT, { key: this.key, instance: this });

    el.inert = false;
  }

  async animateClose(): Promise<void> {
    const el = this;
    if (!el) {
      return;
    }

    el.inert = true;

    this.emit(CLOSING_EVENT, { key: this.key, instance: this });

    await animationsComplete(el);

    el.hidden = true;

    el.removeAttribute("anchored");

    el.hidePopover();

    this.emit(CLOSED_EVENT, { key: this.key, instance: this });
  }

  async show(): Promise<void> {
    if (this.open) {
      return undefined;
    }
    this.open = true;
    return waitForEvent(this, "opened");
  }

  async hide(): Promise<void> {
    if (!this.open) {
      return undefined;
    }
    this.open = false;
    return waitForEvent(this, "closed");
  }

  override focus(options?: FocusOptions) {
    const firstOption = this._options?.[0];
    if (firstOption instanceof HTMLElement) {
      firstOption.focus(options);
    }
  }

  async activateOption(option: Button): Promise<void> {
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
    const detail = {
      key: this.key,
      instance: this,
      oldRect,
      newRect,
      value: newValue,
    };

    if (changed) {
      this.emit(CHANGING_EVENT, detail);
    }

    if (oldOption) {
      oldOption.active = false;
    }
    option.active = true;

    await animationsComplete(
      option.root,
      option.refs.label,
      option.refs.icon,
      option.refs.inactiveIcon,
      option.refs.activeIcon,
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

  async deactivateOption(option: Button): Promise<void> {
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
        }),
      );
    } else {
      const detail = {
        key: this.key,
        instance: this,
        value: this._activatingValue,
      };
      this.emit(CHANGING_EVENT, detail);
      if (this.anchorTo && this.anchorInteraction) {
        await this.hide();
      }
      this.emit(CHANGED_EVENT, detail);
    }
  }

  bindOptions() {
    this.options.forEach((option) => {
      option.root.addEventListener("keydown", this.handleKeyDownOption, {
        passive: true,
      });
      option.root.addEventListener("click", this.handleClickOption, {
        passive: true,
      });
    });
  }

  unbindOptions() {
    this.options.forEach((option) => {
      option.root.removeEventListener("keydown", this.handleKeyDownOption);
      option.root.removeEventListener("click", this.handleClickOption);
    });
  }

  focusOption(option: Button, activate: boolean) {
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

  focusPreviousOption(option: Button, activate: boolean) {
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

  focusNextOption(option: Button, activate: boolean) {
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

  handleKeyDownOption = (e: KeyboardEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      const option = (e.currentTarget.getRootNode() as ShadowRoot)
        ?.host as Button;
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

  handleClickOption = (e: MouseEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      const option = (e.currentTarget.getRootNode() as ShadowRoot)
        ?.host as Button;
      if (option.type !== "toggle") {
        this._activatingValue = option.value;
        this.updateOptions();
      }
    }
  };

  updateTriggers() {
    this._triggers = this.anchorInteraction?.split(" ").sort() || [];
  }

  protected setupOptions(children: Button[]) {
    this.unbindOptions();
    this._options = children;
    this.bindOptions();
    this.updateOptions();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-box": Box;
  }
}
