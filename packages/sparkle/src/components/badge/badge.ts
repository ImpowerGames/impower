import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_badge";
/**
 * Badges are used to draw attention and display statuses or counts.
 */
export default class Badge extends SparkleComponent(spec) {}

declare global {
  interface HTMLElementTagNameMap {
    "s-badge": Badge;
  }
}
