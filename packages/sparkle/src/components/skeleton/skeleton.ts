import { getCssColor } from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_skeleton";

const DEFAULT_TRANSFORMERS = {
  "sheen-color": getCssColor,
};

/**
 * Skeletons are used to provide a visual representation of where content will eventually be drawn.
 */
export default class Skeleton extends SparkleComponent(
  spec,
  DEFAULT_TRANSFORMERS,
) {}

declare global {
  interface HTMLElementTagNameMap {
    "s-skeleton": Skeleton;
  }
}
