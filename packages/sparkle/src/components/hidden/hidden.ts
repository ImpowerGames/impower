import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
} from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getBreakpointValue } from "../../utils/getBreakpointValue";
import { getCurrentBreakpoint } from "../../utils/getCurrentBreakpoint";
import css from "./hidden.css";
import html from "./hidden.html";

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap(["initial", "below", "above", "on", "off"]),
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

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }

  override get css() {
    return Hidden.augmentCss(css);
  }

  /**
   * Determines if the element is initially hidden or not.
   *
   * Defaults to `off` for not hidden.
   */
  get initial(): "on" | "off" | null {
    return this.getStringAttribute(Hidden.attributes.initial);
  }
  set initial(value) {
    this.setStringAttribute(Hidden.attributes.initial, value);
  }

  /**
   * If provided, the element will only listen for events when the width of the screen is below the specified breakpoint.
   */
  get below(): SizeName | null {
    return this.getStringAttribute(Hidden.attributes.below);
  }
  set below(value) {
    this.setStringAttribute(Hidden.attributes.below, value);
  }

  /**
   * If provided, the element will only listen for events when the width of the screen is above the specified breakpoint.
   */
  get above(): SizeName | null {
    return this.getStringAttribute(Hidden.attributes.above);
  }
  set above(value) {
    this.setStringAttribute(Hidden.attributes.above, value);
  }

  /**
   * The element will hide when this event is fired
   */
  get on(): string | null {
    return this.getStringAttribute(Hidden.attributes.on);
  }
  set on(value) {
    this.setStringAttribute(Hidden.attributes.on, value);
  }

  /**
   * The element will be shown again when this event is fired
   */
  get off(): string | null {
    return this.getStringAttribute(Hidden.attributes.off);
  }
  set off(value) {
    this.setStringAttribute(Hidden.attributes.off, value);
  }

  _breakpointValue = 0;

  protected override onConnected(): void {
    window.addEventListener("resize", this.handleWindowResize, {
      passive: true,
    });
    const on = this.on;
    if (on) {
      window.addEventListener(on, this.handleOn);
    }
    const off = this.off;
    if (off) {
      window.addEventListener(off, this.handleOff);
    }
  }

  protected override onParsed(): void {
    this.updateBreakpoint();
    if (this.preConditionsSatisfied()) {
      if (this.initial === "on") {
        this.activate();
      } else {
        this.deactivate();
      }
    }
  }

  protected override onDisconnected(): void {
    window.removeEventListener("resize", this.handleWindowResize);
    const on = this.on;
    if (on) {
      window.removeEventListener(on, this.handleOn);
    }
    const off = this.off;
    if (off) {
      window.removeEventListener(off, this.handleOff);
    }
  }

  updateBreakpoint() {
    const breakpoint = getCurrentBreakpoint(window.innerWidth);
    this._breakpointValue = getBreakpointValue(breakpoint);
  }

  preConditionsSatisfied() {
    const above = this.above;
    const below = this.below;
    const aboveSatisfied =
      above == null || this._breakpointValue > getBreakpointValue(above);
    const belowSatisfied =
      below == null || this._breakpointValue < getBreakpointValue(below);
    return aboveSatisfied && belowSatisfied;
  }

  activate() {
    this.root.setAttribute("active", "");
  }

  deactivate() {
    this.root.removeAttribute("active");
  }

  private handleWindowResize = (): void => {
    this.updateBreakpoint();
  };

  private handleOn = () => {
    if (this.preConditionsSatisfied()) {
      this.activate();
    }
  };

  private handleOff = () => {
    if (this.preConditionsSatisfied()) {
      this.deactivate();
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-hidden": Hidden;
  }
}
