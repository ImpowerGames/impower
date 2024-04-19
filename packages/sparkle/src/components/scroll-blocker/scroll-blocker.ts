import { RefMap } from "../../../../spec-component/src/component";
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
    return spec.html({
      graphics: this.graphics,
      stores: this.stores,
      context: this.context,
      props: this.props,
    });
  }

  override get css() {
    return spec.css;
  }

  override get selectors() {
    return spec.selectors;
  }

  override get ref() {
    return super.ref as RefMap<typeof this.selectors>;
  }

  override onConnected() {
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("pointerdown", this.handlePointerDown);
    this.root.addEventListener("touchstart", this.handleTouchStart);
    this.root.addEventListener("touchmove", this.handleTouchMove);
  }

  override onDisconnected() {
    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("pointerdown", this.handlePointerDown);
    this.root.removeEventListener("touchstart", this.handleTouchStart);
    this.root.removeEventListener("touchmove", this.handleTouchMove);
  }

  protected handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  protected handlePointerDown = (e: PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  protected handleTouchStart = (e: TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  protected handleTouchMove = (e: TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-scroll-blocker": ScrollBlocker;
  }
}
