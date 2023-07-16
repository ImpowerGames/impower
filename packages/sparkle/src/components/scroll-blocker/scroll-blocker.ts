import SparkleElement from "../../core/sparkle-element";
import component from "./_scroll-blocker";

/**
 * A Scroll Blocker to prevent page scrolls on safari when the on-screen keyboard is visible.
 * This component is literally just an empty and invisible button that you can stick inside positioned elements
 * (Because this hackery is the kind of shit that Safari forces us to resort to.)
 */
export default class ScrollBlocker extends SparkleElement {
  static override tagName = "s-scroll-blocker";

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
    return ScrollBlocker.augmentCss(css);
  }

  protected override onConnected(): void {
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("pointerdown", this.handlePointerDown);
    this.root.addEventListener("touchstart", this.handleTouchStart);
    this.root.addEventListener("touchmove", this.handleTouchMove);
  }

  protected override onDisconnected(): void {
    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("pointerdown", this.handlePointerDown);
    this.root.removeEventListener("touchstart", this.handleTouchStart);
    this.root.removeEventListener("touchmove", this.handleTouchMove);
  }

  protected handleClick = (e: MouseEvent): void => {
    e.stopPropagation();
    e.preventDefault();
  };

  protected handlePointerDown = (e: PointerEvent): void => {
    e.stopPropagation();
    e.preventDefault();
  };

  protected handleTouchStart = (e: TouchEvent): void => {
    e.stopPropagation();
    e.preventDefault();
  };

  protected handleTouchMove = (e: TouchEvent): void => {
    e.stopPropagation();
    e.preventDefault();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-scroll-blocker": ScrollBlocker;
  }
}
