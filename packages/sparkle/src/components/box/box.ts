import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_box";

/**
 * Boxes are basic surfaces for styling and laying out content.
 */
export default class Box extends SparkleComponent(spec) {
  override get root(): HTMLElement {
    return this;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-box": Box;
  }
}
