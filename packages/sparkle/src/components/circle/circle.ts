import { getCssSize } from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_circle";

const DEFAULT_TRANSFORMERS = {
  size: getCssSize,
};

/**
 * Circles are basic surfaces for styling and laying out content.
 */
export default class Circle extends SparkleComponent(
  spec,
  DEFAULT_TRANSFORMERS,
) {}

declare global {
  interface HTMLElementTagNameMap {
    "s-circle": Circle;
  }
}
