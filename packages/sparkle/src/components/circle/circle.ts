import { getCssSize } from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_circle";

const DEFAULT_TRANSFORMERS = {
  size: getCssSize,
};

export default class Circle extends SparkleComponent(
  spec,
  DEFAULT_TRANSFORMERS,
) {}

declare global {
  interface HTMLElementTagNameMap {
    "s-circle": Circle;
  }
}
