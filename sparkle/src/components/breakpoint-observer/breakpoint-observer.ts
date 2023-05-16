import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import css from "./breakpoint-observer.css";
import html from "./breakpoint-observer.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  "measure",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "value",
]);

/**
 * Breakpoint observers automatically update their value attribute to match the currently active breakpoint.
 */
export default class BreakpointObserver
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-breakpoint-observer";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies);
  }

  override get html(): string {
    return html;
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
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
  get xs(): number {
    return this.getNumberAttribute(BreakpointObserver.attributes.xs) ?? 400;
  }
  set xs(value) {
    this.setStringAttribute(BreakpointObserver.attributes.xs, value);
  }

  /**
   * The sm breakpoint.
   *
   * Defaults to `600px`.
   */
  get sm(): number {
    return this.getNumberAttribute(BreakpointObserver.attributes.sm) ?? 600;
  }
  set sm(value) {
    this.setStringAttribute(BreakpointObserver.attributes.sm, value);
  }

  /**
   * The sm breakpoint.
   *
   * Defaults to `960px`.
   */
  get md(): number {
    return this.getNumberAttribute(BreakpointObserver.attributes.md) ?? 960;
  }
  set md(value) {
    this.setStringAttribute(BreakpointObserver.attributes.md, value);
  }

  /**
   * The lg breakpoint.
   *
   * Defaults to `1280px`.
   */
  get lg(): number {
    return this.getNumberAttribute(BreakpointObserver.attributes.lg) ?? 1280;
  }
  set lg(value) {
    this.setStringAttribute(BreakpointObserver.attributes.lg, value);
  }

  /**
   * The xl breakpoint.
   *
   * Defaults to `1920px`.
   */
  get xl(): number {
    return this.getNumberAttribute(BreakpointObserver.attributes.xl) ?? 1920;
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
      this.value = this.getBreakpoint(screen.availWidth);
    } else if (measure === "window") {
      this.value = this.getBreakpoint(window.innerWidth);
    } else if (observedEl) {
      const { width } = observedEl.getBoundingClientRect();
      this.value = this.getBreakpoint(width);
    }
  }

  protected override onDisconnected(): void {
    this._resizeObserver?.disconnect();
    window.removeEventListener("resize", this.handleWindowResize);
  }

  getBreakpoint(width: number): string {
    if (width <= this.xs) {
      return "xs";
    }
    if (width <= this.sm) {
      return "sm";
    }
    if (width <= this.md) {
      return "md";
    }
    if (width <= this.lg) {
      return "lg";
    }
    return "xl";
  }

  private handleWindowResize = (): void => {
    if (this.measure === "window") {
      this.value = this.getBreakpoint(window.innerWidth);
    }
  };

  private handleElementResize = (entries: ResizeObserverEntry[]): void => {
    if (this.measure === "self") {
      const entry = entries[0];
      if (entry) {
        const { width } = entry.contentRect;
        this.value = this.getBreakpoint(width);
      }
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-breakpoint-observer": BreakpointObserver;
  }
}
