import SparkleElement from "../../core/sparkle-element";
import { getCssColor } from "../../utils/getCssColor";
import css from "./progress-bar.css";
import html from "./progress-bar.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Progress bars are used to show the status of an ongoing operation.
 */
export default class ProgressBar extends SparkleElement {
  static async define(
    tag = "s-progress-bar"
  ): Promise<CustomElementConstructor> {
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
    return [
      ...super.observedAttributes,
      "aria-label",
      "value",
      "indeterminate",
      "track-color",
      "label-color",
    ];
  }

  /**
   * The current progress as a percentage, 0 to 100.
   */
  get value(): string | null {
    return this.getStringAttribute("value");
  }

  /**
   * When true, percentage is ignored, the label is hidden, and the progress bar is drawn in an indeterminate state.
   */
  get indeterminate(): boolean {
    return this.getBooleanAttribute("indeterminate");
  }

  /**
   * The color of the track.
   */
  get trackColor(): string | null {
    return this.getStringAttribute("track-color");
  }

  /**
   * The color of the label.
   */
  get labelColor(): string | null {
    return this.getStringAttribute("label-color");
  }

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "title") {
      this.updateRootAttribute("title", newValue);
    }
    if (name === "aria-label") {
      this.updateRootAttribute("aria-label", newValue);
    }
    if (name === "value") {
      this.updateRootAttribute("aria-valuenow", newValue);
      const indicator = this.getElementByPart("indicator");
      if (indicator) {
        indicator.style.width = `${newValue}%`;
      }
    }
    if (name === "track-color") {
      this.updateRootStyle("--track-color", getCssColor(newValue));
    }
    if (name === "label-color") {
      this.updateRootStyle("--label-color", getCssColor(newValue));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-progress-bar": ProgressBar;
  }
}
