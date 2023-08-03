import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import { getKeys } from "../../../../spark-element/src/utils/getKeys";
import getCssDuration from "../../../../sparkle-style-transformer/src/utils/getCssDuration";
import getCssDurationMS from "../../../../sparkle-style-transformer/src/utils/getCssDurationMS";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { SizeName } from "../../types/sizeName";
import { animationsComplete } from "../../utils/animationsComplete";
import { getBreakpointValue } from "../../utils/getBreakpointValue";
import { getCurrentBreakpoint } from "../../utils/getCurrentBreakpoint";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import component from "./_hidden";

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
  static override tagName = "s-hidden";

  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get component() {
    return component({ attrs: { initial: this.initial } });
  }

  override transformCss(css: string) {
    return Hidden.augmentCss(css);
  }

  /**
   * Determines if the element is initially hidden or not.
   *
   * Defaults to `show`.
   */
  get initial(): "hide" | "show" | null {
    return this.getStringAttribute(Hidden.attributes.initial);
  }
  set initial(value) {
    this.setStringAttribute(Hidden.attributes.initial, value);
  }

  /**
   * If provided, the element will be hidden when the width of the screen is below the specified breakpoint and shown otherwise.
   */
  get hideBelow(): SizeName | null {
    return this.getStringAttribute(Hidden.attributes.hideBelow);
  }
  set hideBelow(value) {
    this.setStringAttribute(Hidden.attributes.hideBelow, value);
  }

  /**
   * If provided, the element will be hidden when the width of the screen is above the specified breakpoint and shown otherwise.
   */
  get hideAbove(): SizeName | null {
    return this.getStringAttribute(Hidden.attributes.hideAbove);
  }
  set hideAbove(value) {
    this.setStringAttribute(Hidden.attributes.hideAbove, value);
  }

  /**
   * If provided, the element will only listen for events when the width of the screen is below the specified breakpoint.
   */
  get ifBelow(): SizeName | null {
    return this.getStringAttribute(Hidden.attributes.ifBelow);
  }
  set ifBelow(value) {
    this.setStringAttribute(Hidden.attributes.ifBelow, value);
  }

  /**
   * If provided, the element will only listen for events when the width of the screen is above the specified breakpoint.
   */
  get ifAbove(): SizeName | null {
    return this.getStringAttribute(Hidden.attributes.ifAbove);
  }
  set ifAbove(value) {
    this.setStringAttribute(Hidden.attributes.ifAbove, value);
  }

  /**
   * The element will hide when this event is fired
   */
  get hideEvent(): string | null {
    return this.getStringAttribute(Hidden.attributes.hideEvent);
  }
  set hideEvent(value) {
    this.setStringAttribute(Hidden.attributes.hideEvent, value);
  }

  /**
   * The element will be shown again when this event is fired
   */
  get showEvent(): string | null {
    return this.getStringAttribute(Hidden.attributes.showEvent);
  }
  set showEvent(value) {
    this.setStringAttribute(Hidden.attributes.showEvent, value);
  }

  /**
   * The hide transition duration
   */
  get hideInstantly(): string | null {
    return this.getStringAttribute(Hidden.attributes.hideInstantly);
  }
  set hideInstantly(value) {
    this.setStringAttribute(Hidden.attributes.hideInstantly, value);
  }

  /**
   * The delay before the element is hidden
   */
  get hideDelay(): string | null {
    return this.getStringAttribute(Hidden.attributes.hideDelay);
  }
  set hideDelay(value) {
    this.setStringAttribute(Hidden.attributes.hideDelay, value);
  }

  /**
   * The delay before the element is shown again
   */
  get showDelay(): string | null {
    return this.getStringAttribute(Hidden.attributes.showDelay);
  }
  set showDelay(value) {
    this.setStringAttribute(Hidden.attributes.showDelay, value);
  }

  _breakpointValue = 0;

  _hideTransitionTimeout = 0;

  _showTransitionTimeout = 0;

  _shown = false;

  protected override onConnected(): void {
    if (this.initial === "hide") {
      this.root.hidden = true;
    } else {
      this.root.hidden = false;
    }
    this._shown = !this.root.hidden;
    window.addEventListener("resize", this.handleWindowResize, {
      passive: true,
    });
    const hideEvent = this.hideEvent;
    const showEvent = this.showEvent;
    if (hideEvent) {
      window.addEventListener(hideEvent, this.handleHideEvent);
    }
    if (showEvent) {
      window.addEventListener(showEvent, this.handleShowEvent);
    }
  }

  protected override onParsed(): void {
    this.load();
  }

  protected override onDisconnected(): void {
    window.removeEventListener("resize", this.handleWindowResize);
    const hideEvent = this.hideEvent;
    const showEvent = this.showEvent;
    if (hideEvent) {
      window.removeEventListener(hideEvent, this.handleHideEvent);
    }
    if (showEvent) {
      window.removeEventListener(showEvent, this.handleShowEvent);
    }
  }

  checkBreakpoint() {
    const breakpoint = getCurrentBreakpoint(window.innerWidth);
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
      this.root.setAttribute("state", "hidden");
    } else {
      this.root.setAttribute("state", "hiding");
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
    this.root.hidden = false;
    this.root.setAttribute("state", "mounting");
    await animationsComplete(this.root);
    this.root.setAttribute("state", "showing");
    await animationsComplete(this.root);
    this.root.setAttribute("state", "shown");
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
