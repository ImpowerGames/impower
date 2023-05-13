import SparkleElement from "../../core/sparkle-element";
import css from "./box.css";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Boxes are basic surfaces for styling and laying out content.
 */
export default class Box extends SparkleElement {
  static override tagName = "s-box";

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-box": Box;
  }
}
