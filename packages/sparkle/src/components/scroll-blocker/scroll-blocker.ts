import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_scroll-blocker";

// workaround(safari): the page scrolls behind positioned elements while the on-screen keyboard is visible; an invisible button blocks it
export default class ScrollBlocker extends SparkleComponent(spec) {
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
