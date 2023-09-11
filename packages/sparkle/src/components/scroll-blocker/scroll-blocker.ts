import SparkleElement from "../../core/sparkle-element";
import spec from "./_scroll-blocker";

/**
 * A Scroll Blocker to prevent page scrolls on safari when the on-screen keyboard is visible.
 * This component is literally just an empty and invisible button that you can stick inside positioned elements
 * (Because this hackery is the kind of shit that Safari forces us to resort to.)
 */
export default class ScrollBlocker extends SparkleElement {
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return this.getHTML(spec, { props: {}, state: {} });
  }

  override get css() {
    return this.getCSS(spec);
  }

  override onConnected(): void {
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("pointerdown", this.handlePointerDown);
    this.root.addEventListener("touchstart", this.handleTouchStart);
    this.root.addEventListener("touchmove", this.handleTouchMove);
  }

  override onDisconnected(): void {
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
