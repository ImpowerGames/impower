import { getCssDurationMS } from "../../../../sparkle-style-transformer/src/utils/getCssDurationMS";
import { getCssDuration } from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import { animationsComplete } from "../../utils/animationsComplete";
import { getBreakpointValue } from "../../utils/getBreakpointValue";
import { getCurrentBreakpoint } from "../../utils/getCurrentBreakpoint";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import spec from "./_hidden";

const CHANGING_EVENT = "changing";
const CHANGED_EVENT = "changed";

const DEFAULT_TRANSFORMERS = {
  "hide-delay": getCssDuration,
  "show-delay": getCssDuration,
};

/**
 * Hidden is used to hide or unhide elements when a certain events are fired.
 */
export default class Hidden extends SparkleComponent(
  spec,
  DEFAULT_TRANSFORMERS,
) {
  _breakpointValue = 0;

  _hideTransitionTimeout = 0;

  _showTransitionTimeout = 0;

  _shown = false;

  override onConnected() {
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

  override onParsed() {
    this.load();
  }

  override onDisconnected() {
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

  async hide() {
    if (this._shown) {
      this._shown = false;
      this.cancelPending();
      const hideDelay = getCssDurationMS(this.hideDelay, 0);
      if (hideDelay > 0) {
        this._hideTransitionTimeout = window.setTimeout(
          () => this.animateHide(),
          hideDelay,
        );
      } else {
        await this.animateHide();
      }
    }
  }

  async animateHide() {
    this.emit(CHANGING_EVENT, { hidden: true });
    if (this.hideInstantly != null) {
      this.root.hidden = true;
      this.root.setAttribute("status", "hidden");
    } else {
      this.root.setAttribute("status", "hiding");
      await animationsComplete(this.root);
      this.root.hidden = true;
    }
    this.emit(CHANGED_EVENT, { hidden: true });
  }

  async show() {
    if (!this._shown) {
      this._shown = true;
      this.cancelPending();
      const showDelay = getCssDurationMS(this.showDelay, 0);
      if (showDelay > 0) {
        this._showTransitionTimeout = window.setTimeout(
          () => this.animateShow(),
          showDelay,
        );
      } else {
        await this.animateShow();
      }
    }
  }

  async animateShow() {
    this.emit(CHANGING_EVENT, { hidden: false });
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
    this.emit(CHANGED_EVENT, { hidden: false });
  }

  async cancelPending() {
    if (this._hideTransitionTimeout) {
      window.clearTimeout(this._hideTransitionTimeout);
    }
    if (this._showTransitionTimeout) {
      window.clearTimeout(this._showTransitionTimeout);
    }
  }

  protected handleWindowResize = () => {
    this.checkBreakpoint();
  };

  protected handleHideEvent = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (this.preConditionsSatisfied()) {
        this.hide();
      }
    }
  };

  protected handleShowEvent = (e: Event) => {
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
