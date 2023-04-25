import SparkleElement from "../../core/sparkle-element";
import { getCssColor } from "../../utils/getCssColor";
import css from "./skeleton.css";
import html from "./skeleton.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Skeletons are used to provide a visual representation of where content will eventually be drawn.
 */
export default class Skeleton extends SparkleElement {
  static async define(tag = "s-skeleton"): Promise<CustomElementConstructor> {
    customElements.define(tag, this);
    return customElements.whenDefined(tag);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  override get html(): string {
    return html;
  }

  static override get observedAttributes() {
    return [...super.observedAttributes, "sheen-color"];
  }

  /**
   * The color of the sheen.
   */
  get sheenColor(): string | null {
    return this.getStringAttribute("sheen-color");
  }

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "sheen-color") {
      this.updateRootStyle("--sheen-color", getCssColor(newValue));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-skeleton": Skeleton;
  }
}
