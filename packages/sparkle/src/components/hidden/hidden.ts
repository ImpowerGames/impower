import getCssDuration from "../../../../sparkle-style-transformer/src/utils/getCssDuration";
import getCssDurationMS from "../../../../sparkle-style-transformer/src/utils/getCssDurationMS";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getKeys from "../../../../spec-component/src/utils/getKeys";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { SizeName } from "../../types/sizeName";
import { animationsComplete } from "../../utils/animationsComplete";
import { getBreakpointValue } from "../../utils/getBreakpointValue";
import { getCurrentBreakpoint } from "../../utils/getCurrentBreakpoint";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import spec from "./_hidden";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  "hide-delay": getCssDuration,
  "show-delay": getCssDuration,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "initial",
    "hide-below",
    "hide-above",
    "if-below",
    "if-above",
    "hide-event",
    "show-event",
    "hide-instantly",
    "show-instantly",
    ...getKeys(DEFAULT_TRANSFORMERS),
  ]),
};

/**
 * Hidden is used to hide or unhide elements when a certain events are fired.
 */
export default class Hidden
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return this.getHTML(spec, { props: { initial: this.initial }, state: {} });
  }

  override get css() {
    return this.getCSS(spec);
  }

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  /**
   * Determines if the element is initially hidden or not.
   *
   * Defaults to `show`.
   */
  get initial(): "hide" | "show" | null {
    return this.getStringAttribute(Hidden.attrs.initial);
  }
  set initial(value) {
    this.setStringAttribute(Hidden.attrs.initial, value);
  }

  /**
   * If provided, the element will be hidden when the width of the screen is below the specified breakpoint and shown otherwise.
   */
  get hideBelow(): SizeName | null {
    return this.getStringAttribute(Hidden.attrs.hideBelow);
  }
  set hideBelow(value) {
    this.setStringAttribute(Hidden.attrs.hideBelow, value);
  }

  /**
   * If provided, the element will be hidden when the width of the screen is above the specified breakpoint and shown otherwise.
   */
  get hideAbove(): SizeName | null {
    return this.getStringAttribute(Hidden.attrs.hideAbove);
  }
  set hideAbove(value) {
    this.setStringAttribute(Hidden.attrs.hideAbove, value);
  }

  /**
   * If provided, the element will only listen for events when the width of the screen is below the specified breakpoint.
   */
  get ifBelow(): SizeName | null {
    return this.getStringAttribute(Hidden.attrs.ifBelow);
  }
  set ifBelow(value) {
    this.setStringAttribute(Hidden.attrs.ifBelow, value);
  }

  /**
   * If provided, the element will only listen for events when the width of the screen is above the specified breakpoint.
   */
  get ifAbove(): SizeName | null {
    return this.getStringAttribute(Hidden.attrs.ifAbove);
  }
  set ifAbove(value) {
    this.setStringAttribute(Hidden.attrs.ifAbove, value);
  }

  /**
   * The element will hide when this event is fired
   */
  get hideEvent(): string | null {
    return this.getStringAttribute(Hidden.attrs.hideEvent);
  }
  set hideEvent(value) {
    this.setStringAttribute(Hidden.attrs.hideEvent, value);
  }

  /**
   * The element will be shown again when this event is fired
   */
  get showEvent(): string | null {
    return this.getStringAttribute(Hidden.attrs.showEvent);
  }
  set showEvent(value) {
    this.setStringAttribute(Hidden.attrs.showEvent, value);
  }

  /**
   * Disable the hide transition
   */
  get hideInstantly(): string | null {
    return this.getStringAttribute(Hidden.attrs.hideInstantly);
  }
  set hideInstantly(value) {
    this.setStringAttribute(Hidden.attrs.hideInstantly, value);
  }

  /**
   * Disable the show transition
   */
  get showInstantly(): string | null {
    return this.getStringAttribute(Hidden.attrs.showInstantly);
  }
  set showInstantly(value) {
    this.setStringAttribute(Hidden.attrs.showInstantly, value);
  }

  /**
   * The delay before the element is hidden
   */
  get hideDelay(): string | null {
    return this.getStringAttribute(Hidden.attrs.hideDelay);
  }
  set hideDelay(value) {
    this.setStringAttribute(Hidden.attrs.hideDelay, value);
  }

  /**
   * The delay before the element is shown again
   */
  get showDelay(): string | null {
    return this.getStringAttribute(Hidden.attrs.showDelay);
  }
  set showDelay(value) {
    this.setStringAttribute(Hidden.attrs.showDelay, value);
  }

  _breakpointValue = 0;

  _hideTransitionTimeout = 0;

  _showTransitionTimeout = 0;

  _shown = false;

  override onConnected(): void {
    if (this.initial === "hide") {
      this.root.hidden = true;
    } else {
      this.root.hidden = false;
    }
    this._shown = !this.root.hidden;
    window.addEventListener("resize", this.handleWindowResize, {
      passive: true,
    });
    const hideEvents = this.hideEvent?.split(" ");
    const showEvents = this.showEvent?.split(" ");
    if (hideEvents) {
      hideEvents.forEach((hideEvent) => {
        window.addEventListener(hideEvent, this.handleHideEvent);
      });
    }
    if (showEvents) {
      showEvents.forEach((showEvent) => {
        window.addEventListener(showEvent, this.handleShowEvent);
      });
    }
  }

  override onParsed(): void {
    this.load();
  }

  override onDisconnected(): void {
    window.removeEventListener("resize", this.handleWindowResize);
    const hideEvents = this.hideEvent?.split(" ");
    const showEvents = this.showEvent?.split(" ");
    if (hideEvents) {
      hideEvents.forEach((hideEvent) => {
        window.removeEventListener(hideEvent, this.handleHideEvent);
      });
    }
    if (showEvents) {
      showEvents.forEach((showEvent) => {
        window.removeEventListener(showEvent, this.handleShowEvent);
      });
    }
  }

  checkBreakpoint() {
    const breakpoint = getCurrentBreakpoint(window.innerWidth);
    const ifBelow = this.ifBelow;
    const hideBelow = this.hideBelow;
    const hideAbove = this.hideAbove;
    this._breakpointValue = getBreakpointValue(breakpoint);
    if (hideBelow) {
      if (this._breakpointValue < getBreakpointValue(hideBelow)) {
        this.hide();
      } else {
        this.show();
      }
    }
    if (hideAbove) {
      if (this._breakpointValue >= getBreakpointValue(hideAbove)) {
        this.hide();
      } else {
        this.show();
      }
    }
    if (ifBelow) {
      if (this._breakpointValue >= getBreakpointValue(ifBelow)) {
        if (!this._shown) {
          this.show();
        }
      }
    }
  }

  async load() {
    this.checkBreakpoint();
    await nextAnimationFrame();
    this.root.setAttribute("loaded", "");
  }

  hide() {
    if (this._shown) {
      this._shown = false;
      this.cancelPending();
      const hideDelay = getCssDurationMS(this.hideDelay, 0);
      if (hideDelay > 0) {
        this._hideTransitionTimeout = window.setTimeout(
          () => this.animateHide(),
          hideDelay
        );
      } else {
        this.animateHide();
      }
    }
  }

  async animateHide() {
    if (this.hideInstantly != null) {
      this.root.hidden = true;
      this.root.setAttribute("status", "hidden");
    } else {
      this.root.setAttribute("status", "hiding");
      await animationsComplete(this.root);
      this.root.hidden = true;
    }
  }

  show() {
    if (!this._shown) {
      this._shown = true;
      this.cancelPending();
      const showDelay = getCssDurationMS(this.showDelay, 0);
      if (showDelay > 0) {
        this._showTransitionTimeout = window.setTimeout(
          () => this.animateShow(),
          showDelay
        );
      } else {
        this.animateShow();
      }
    }
  }

  async animateShow() {
    if (this.showInstantly != null) {
      this.root.hidden = false;
      this.root.setAttribute("status", "shown");
    } else {
      this.root.hidden = false;
      this.root.setAttribute("status", "mounting");
      await animationsComplete(this.root);
      this.root.setAttribute("status", "showing");
      await animationsComplete(this.root);
      this.root.setAttribute("status", "shown");
    }
  }

  async cancelPending() {
    if (this._hideTransitionTimeout) {
      window.clearTimeout(this._hideTransitionTimeout);
    }
    if (this._showTransitionTimeout) {
      window.clearTimeout(this._showTransitionTimeout);
    }
  }

  protected handleWindowResize = (): void => {
    this.checkBreakpoint();
  };

  protected handleHideEvent = (e: Event): void => {
    if (e instanceof CustomEvent) {
      if (this.preConditionsSatisfied()) {
        this.hide();
      }
    }
  };

  protected handleShowEvent = (e: Event): void => {
    if (e instanceof CustomEvent) {
      if (this.preConditionsSatisfied()) {
        this.show();
      }
    }
  };

  preConditionsSatisfied() {
    const aboveBreakpoint = this.ifAbove;
    const belowBreakpoint = this.ifBelow;
    const aboveSatisfied =
      aboveBreakpoint == null ||
      this._breakpointValue > getBreakpointValue(aboveBreakpoint);
    const belowSatisfied =
      belowBreakpoint == null ||
      this._breakpointValue < getBreakpointValue(belowBreakpoint);
    return aboveSatisfied && belowSatisfied;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-hidden": Hidden;
  }
}
