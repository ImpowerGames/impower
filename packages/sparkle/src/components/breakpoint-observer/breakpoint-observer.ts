import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
} from "../../core/sparkle-element";
import { getCurrentBreakpoint } from "../../utils/getCurrentBreakpoint";
import component from "./_breakpoint-observer";

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap(["measure", "xs", "sm", "md", "lg", "xl", "value"]),
};

/**
 * Breakpoint observers automatically update their value attribute to match the currently active breakpoint.
 */
export default class BreakpointObserver
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-breakpoint-observer";

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

  override get component() {
    return component();
  }

  override transformCss(css: string) {
    return BreakpointObserver.augmentCss(css);
  }

  /**
   * The container whose width will be monitored.
   *
   * Defaults to `self`.
   */
  get measure(): "self" | "window" | "screen" {
    return (
      this.getStringAttribute(BreakpointObserver.attributes.measure) || "self"
    );
  }
  set measure(value) {
    this.setStringAttribute(BreakpointObserver.attributes.measure, value);
  }

  /**
   * The xs breakpoint.
   *
   * Defaults to `400px`.
   */
  get xs(): number | null {
    return this.getNumberAttribute(BreakpointObserver.attributes.xs);
  }
  set xs(value) {
    this.setStringAttribute(BreakpointObserver.attributes.xs, value);
  }

  /**
   * The sm breakpoint.
   *
   * Defaults to `600px`.
   */
  get sm(): number | null {
    return this.getNumberAttribute(BreakpointObserver.attributes.sm);
  }
  set sm(value) {
    this.setStringAttribute(BreakpointObserver.attributes.sm, value);
  }

  /**
   * The md breakpoint.
   *
   * Defaults to `960px`.
   */
  get md(): number | null {
    return this.getNumberAttribute(BreakpointObserver.attributes.md);
  }
  set md(value) {
    this.setStringAttribute(BreakpointObserver.attributes.md, value);
  }

  /**
   * The lg breakpoint.
   *
   * Defaults to `1280px`.
   */
  get lg(): number | null {
    return this.getNumberAttribute(BreakpointObserver.attributes.lg);
  }
  set lg(value) {
    this.setStringAttribute(BreakpointObserver.attributes.lg, value);
  }

  /**
   * The xl breakpoint.
   *
   * Defaults to `1920px`.
   */
  get xl(): number | null {
    return this.getNumberAttribute(BreakpointObserver.attributes.xl);
  }
  set xl(value) {
    this.setStringAttribute(BreakpointObserver.attributes.xl, value);
  }

  get value(): string | null {
    return this.getStringAttribute(BreakpointObserver.attributes.value);
  }
  set value(value: string | null) {
    this.setStringAttribute(BreakpointObserver.attributes.value, value);
  }

  get breakpoints() {
    return {
      xs: this.xs,
      sm: this.sm,
      md: this.md,
      lg: this.lg,
    };
  }

  protected _resizeObserver?: ResizeObserver;

  protected override onConnected(): void {
    this._resizeObserver = new ResizeObserver(this.handleElementResize);
    window.addEventListener("resize", this.handleWindowResize, {
      passive: true,
    });
  }

  protected override onParsed(): void {
    const observedEl = this.root;
    if (observedEl) {
      this._resizeObserver?.observe(observedEl);
    }
    const measure = this.measure;
    if (measure === "screen") {
      this.value = getCurrentBreakpoint(screen.availWidth, this.breakpoints);
    } else if (measure === "window") {
      this.value = getCurrentBreakpoint(window.innerWidth, this.breakpoints);
    } else if (observedEl) {
      const { width } = observedEl.getBoundingClientRect();
      this.value = getCurrentBreakpoint(width, this.breakpoints);
    }
  }

  protected override onDisconnected(): void {
    this._resizeObserver?.disconnect();
    window.removeEventListener("resize", this.handleWindowResize);
  }

  private handleWindowResize = (): void => {
    if (this.measure === "window") {
      this.value = getCurrentBreakpoint(window.innerWidth, this.breakpoints);
    }
  };

  private handleElementResize = (entries: ResizeObserverEntry[]): void => {
    if (this.measure === "self") {
      const entry = entries[0];
      if (entry) {
        const { width } = entry.contentRect;
        this.value = getCurrentBreakpoint(width, this.breakpoints);
      }
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-breakpoint-observer": BreakpointObserver;
  }
}
