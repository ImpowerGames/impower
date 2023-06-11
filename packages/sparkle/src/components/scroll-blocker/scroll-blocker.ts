import SparkleElement from "../../core/sparkle-element";
import css from "./scroll-blocker.css";
import html from "./scroll-blocker.html";

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

  override get html() {
    return html;
  }

  override get css() {
    return ScrollBlocker.augmentCss(css);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-scroll-blocker": ScrollBlocker;
  }
}
