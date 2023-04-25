import SparkleElement from "../../core/sparkle-element";
import { getCssColor } from "../../utils/getCssColor";
import { getCssDuration } from "../../utils/getCssDuration";
import { getCssSize } from "../../utils/getCssSize";
import css from "./spinner.css";
import html from "./spinner.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Spinners are used to show the progress of an indeterminate operation.
 */
export default class Spinner extends SparkleElement {
  static async define(tag = "s-spinner"): Promise<CustomElementConstructor> {
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
    return [...super.observedAttributes, "track-width", "track-color", "speed"];
  }

  /**
   * The width of the track.
   */
  get trackWidth(): string | null {
    return this.getStringAttribute("track-width");
  }

  /**
   * The color of the track.
   */
  get trackColor(): string | null {
    return this.getStringAttribute("track-color");
  }

  /**
   * The speed of the animation.
   */
  get speed(): string | null {
    return this.getStringAttribute("speed");
  }

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "track-width") {
      this.updateRootStyle("--track-width", getCssSize(newValue));
    }
    if (name === "track-color") {
      this.updateRootStyle("--track-color", getCssColor(newValue));
    }
    if (name === "speed") {
      this.updateRootStyle("--speed", getCssDuration(newValue));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-spinner": Spinner;
  }
}
