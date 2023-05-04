import SparkleElement from "../../core/sparkle-element";
import css from "./breakpoint-observer.css";
import html from "./breakpoint-observer.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Breakpoint observers automatically update their value attribute to match the currently active breakpoint.
 */
export default class BreakpointObserver extends SparkleElement {
  static override async define(
    tag = "s-breakpoint-observer",
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
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
    return this.getStringAttribute("measure") || "self";
  }

  /**
   * The xs breakpoint.
   *
   * Defaults to `400px`.
   */
  get xs(): number {
    return this.getNumberAttribute("xs") ?? 400;
  }

  /**
   * The sm breakpoint.
   *
   * Defaults to `600px`.
   */
  get sm(): number {
    return this.getNumberAttribute("sm") ?? 600;
  }

  /**
   * The sm breakpoint.
   *
   * Defaults to `960px`.
   */
  get md(): number {
    return this.getNumberAttribute("md") ?? 960;
  }

  /**
   * The lg breakpoint.
   *
   * Defaults to `1280px`.
   */
  get lg(): number {
    return this.getNumberAttribute("lg") ?? 1280;
  }

  /**
   * The xl breakpoint.
   *
   * Defaults to `1920px`.
   */
  get xl(): number {
    return this.getNumberAttribute("xl") ?? 1920;
  }

  get value(): string | null {
    return this.getStringAttribute("value");
  }
  set value(value: string | null) {
    this.setStringAttribute("value", value);
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
