import SparkleElement from "../../core/sparkle-element";
import css from "./box.css";
import html from "./box.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Boxes are basic surfaces for styling and laying out content.
 */
export default class Box extends SparkleElement {
  static async define(tag = "s-box"): Promise<CustomElementConstructor> {
    customElements.define(tag, this);
    return customElements.whenDefined(tag);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  override get html(): string {
    return html;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-box": Box;
  }
}
